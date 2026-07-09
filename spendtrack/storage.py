"""Слой работы с SQLite — единственное место, которое трогает базу.

База первична, файлы вторичны: запись сначала попадает сюда (и получает
числовой id), и только потом из неё генерируется markdown. Поэтому удаление и
изменение — атомарные операции над строкой, а не над текстом файла.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Iterable

SCHEMA = """
CREATE TABLE IF NOT EXISTS entries (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    amount     REAL    NOT NULL,
    currency   TEXT    NOT NULL DEFAULT 'PLN',
    category   TEXT    NOT NULL,
    place      TEXT    DEFAULT '—',
    kind       TEXT    NOT NULL DEFAULT 'expense',
    note       TEXT    DEFAULT '',
    raw_text   TEXT    DEFAULT '',
    md_path    TEXT    DEFAULT '',
    created_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_date ON entries(user_id, created_at);

CREATE TABLE IF NOT EXISTS budgets (
    user_id       INTEGER NOT NULL,
    category      TEXT NOT NULL,
    monthly_limit REAL NOT NULL,
    currency      TEXT NOT NULL DEFAULT 'PLN',
    PRIMARY KEY (user_id, category)
);

CREATE TABLE IF NOT EXISTS bank_links (
    user_id     INTEGER PRIMARY KEY,
    institution TEXT,
    inst_id     TEXT,
    requisition TEXT,
    account     TEXT,
    last_sync   TEXT
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS imported_tx (
    tx_id       TEXT PRIMARY KEY,
    entry_id    INTEGER,
    imported_at TEXT
);

CREATE TABLE IF NOT EXISTS users (
    telegram_id INTEGER PRIMARY KEY,
    name        TEXT,
    created_at  TEXT
);

CREATE TABLE IF NOT EXISTS login_codes (
    code        TEXT PRIMARY KEY,
    telegram_id INTEGER NOT NULL,
    name        TEXT,
    expires_at  TEXT NOT NULL
);
"""


def get_connection(db_path: str | Path) -> sqlite3.Connection:
    """Открыть соединение, создав папку под базу при необходимости."""
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=4000")
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    conn.commit()


def _iso(value: datetime | str | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.replace(microsecond=0).isoformat(sep="T")
    return value


# Запись

def insert_entry(conn: sqlite3.Connection, record: dict) -> int:
    """Вставить запись, вернуть её числовой id."""
    cur = conn.execute(
        """INSERT INTO entries
           (user_id, amount, currency, category, place, kind, note, raw_text, created_at)
           VALUES (:user_id, :amount, :currency, :category, :place, :kind, :note, :raw_text, :created_at)""",
        {
            "place": "—",
            "note": "",
            "raw_text": "",
            **record,
        },
    )
    conn.commit()
    return int(cur.lastrowid)


def set_md_path(conn: sqlite3.Connection, entry_id: int, md_path: str) -> None:
    conn.execute("UPDATE entries SET md_path = ? WHERE id = ?", (md_path, entry_id))
    conn.commit()


def get_entry(conn: sqlite3.Connection, entry_id: int) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM entries WHERE id = ?", (entry_id,)).fetchone()


def delete_entry(conn: sqlite3.Connection, entry_id: int) -> sqlite3.Row | None:
    """Удалить запись и вернуть удалённую строку (чтобы убрать её .md-файл)."""
    row = get_entry(conn, entry_id)
    if row is None:
        return None
    conn.execute("DELETE FROM entries WHERE id = ?", (entry_id,))
    conn.commit()
    return row


def last_entry(conn: sqlite3.Connection, user_id: int) -> sqlite3.Row | None:
    """Последняя добавленная запись пользователя — для /undo."""
    return conn.execute(
        "SELECT * FROM entries WHERE user_id = ? ORDER BY id DESC LIMIT 1",
        (user_id,),
    ).fetchone()


_EDITABLE = {"amount", "currency", "category", "kind", "note", "place", "created_at"}


def update_entry(conn: sqlite3.Connection, entry_id: int, **fields) -> sqlite3.Row | None:
    """Обновить выбранные поля записи (используется веб-редактором)."""
    cols = {k: v for k, v in fields.items() if k in _EDITABLE and v is not None}
    if not cols:
        return get_entry(conn, entry_id)
    if "created_at" in cols:
        cols["created_at"] = _iso(cols["created_at"])
    assignments = ", ".join(f"{k} = :{k}" for k in cols)
    conn.execute(
        f"UPDATE entries SET {assignments} WHERE id = :id",
        {**cols, "id": entry_id},
    )
    conn.commit()
    return get_entry(conn, entry_id)


# Выборки

def list_entries(
    conn: sqlite3.Connection,
    user_id: int,
    since: datetime | str | None = None,
    until: datetime | str | None = None,
    kinds: Iterable[str] | None = None,
    limit: int | None = None,
    offset: int = 0,
) -> list[sqlite3.Row]:
    clauses = ["user_id = ?"]
    params: list = [user_id]
    if since is not None:
        clauses.append("created_at >= ?")
        params.append(_iso(since))
    if until is not None:
        clauses.append("created_at < ?")
        params.append(_iso(until))
    if kinds:
        kinds = list(kinds)
        clauses.append(f"kind IN ({','.join('?' * len(kinds))})")
        params.extend(kinds)
    sql = f"SELECT * FROM entries WHERE {' AND '.join(clauses)} ORDER BY created_at DESC, id DESC"
    if limit is not None:
        sql += " LIMIT ? OFFSET ?"
        params.extend([limit, offset])
    return conn.execute(sql, params).fetchall()


def summary_by_category(
    conn: sqlite3.Connection,
    user_id: int,
    since: datetime | str | None = None,
    until: datetime | str | None = None,
    kind: str = "expense",
) -> list[sqlite3.Row]:
    """Суммы по категориям за период (по умолчанию только расходы)."""
    clauses = ["user_id = ?", "kind = ?"]
    params: list = [user_id, kind]
    if since is not None:
        clauses.append("created_at >= ?")
        params.append(_iso(since))
    if until is not None:
        clauses.append("created_at < ?")
        params.append(_iso(until))
    sql = (
        f"SELECT category, currency, SUM(amount) AS total, COUNT(*) AS count "
        f"FROM entries WHERE {' AND '.join(clauses)} "
        f"GROUP BY category, currency ORDER BY total DESC"
    )
    return conn.execute(sql, params).fetchall()


def totals_by_kind(
    conn: sqlite3.Connection,
    user_id: int,
    since: datetime | str | None = None,
    until: datetime | str | None = None,
) -> list[sqlite3.Row]:
    """Итоги по типам (expense/income/savings) и валютам за период."""
    clauses = ["user_id = ?"]
    params: list = [user_id]
    if since is not None:
        clauses.append("created_at >= ?")
        params.append(_iso(since))
    if until is not None:
        clauses.append("created_at < ?")
        params.append(_iso(until))
    sql = (
        f"SELECT kind, currency, SUM(amount) AS total, COUNT(*) AS count "
        f"FROM entries WHERE {' AND '.join(clauses)} GROUP BY kind, currency"
    )
    return conn.execute(sql, params).fetchall()


def daily_totals(
    conn: sqlite3.Connection,
    user_id: int,
    since: datetime | str | None = None,
    until: datetime | str | None = None,
    kind: str = "expense",
    currency: str | None = None,
) -> list[sqlite3.Row]:
    """Суммы по дням за период — для столбиков тренда."""
    clauses = ["user_id = ?", "kind = ?"]
    params: list = [user_id, kind]
    if currency:
        clauses.append("currency = ?")
        params.append(currency)
    if since is not None:
        clauses.append("created_at >= ?")
        params.append(_iso(since))
    if until is not None:
        clauses.append("created_at < ?")
        params.append(_iso(until))
    sql = (
        f"SELECT substr(created_at, 1, 10) AS day, SUM(amount) AS total, COUNT(*) AS count "
        f"FROM entries WHERE {' AND '.join(clauses)} GROUP BY day ORDER BY day"
    )
    return conn.execute(sql, params).fetchall()


# Бюджеты (фича веб-версии) — у каждого пользователя свои лимиты.

def get_budgets(conn: sqlite3.Connection, user_id: int) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM budgets WHERE user_id = ? ORDER BY category", (user_id,)
    ).fetchall()


def set_budget(conn: sqlite3.Connection, user_id: int, category: str,
               monthly_limit: float, currency: str = "PLN") -> None:
    conn.execute(
        """INSERT INTO budgets (user_id, category, monthly_limit, currency)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(user_id, category) DO UPDATE SET monthly_limit = excluded.monthly_limit,
                                                        currency = excluded.currency""",
        (user_id, category, monthly_limit, currency),
    )
    conn.commit()


def delete_budget(conn: sqlite3.Connection, user_id: int, category: str) -> None:
    conn.execute("DELETE FROM budgets WHERE user_id = ? AND category = ?",
                 (user_id, category))
    conn.commit()


# Настройки (ключ-значение) и учёт импортированных транзакций — для банка.

def get_setting(conn: sqlite3.Connection, key: str, default=None):
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


def set_setting(conn: sqlite3.Connection, key: str, value) -> None:
    conn.execute(
        "INSERT INTO settings(key, value) VALUES(?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, None if value is None else str(value)),
    )
    conn.commit()


def _tx_key(user_id: int, tx_id: str) -> str:
    return f"{user_id}:{tx_id}"


def is_tx_imported(conn: sqlite3.Connection, user_id: int, tx_id: str) -> bool:
    key = _tx_key(user_id, tx_id)
    return conn.execute("SELECT 1 FROM imported_tx WHERE tx_id = ?", (key,)).fetchone() is not None


def mark_tx_imported(conn: sqlite3.Connection, user_id: int, tx_id: str, entry_id: int) -> None:
    conn.execute(
        "INSERT OR IGNORE INTO imported_tx(tx_id, entry_id, imported_at) VALUES(?, ?, ?)",
        (_tx_key(user_id, tx_id), entry_id,
         datetime.now().replace(microsecond=0).isoformat(sep="T")),
    )
    conn.commit()


def count_imported(conn: sqlite3.Connection, user_id: int) -> int:
    """Сколько транзакций уже импортировано этим пользователем. Ключи в
    imported_tx — `user_id:tx_id`, поэтому `53:%` не зацепит `531:...`."""
    return conn.execute(
        "SELECT COUNT(*) FROM imported_tx WHERE tx_id LIKE ?", (f"{user_id}:%",)
    ).fetchone()[0]


# Подключения к банку (GoCardless) — по одному на пользователя.

def get_bank_link(conn: sqlite3.Connection, user_id: int) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM bank_links WHERE user_id = ?", (user_id,)).fetchone()


_BANK_FIELDS = ("institution", "inst_id", "requisition", "account", "last_sync")


def set_bank_link(conn: sqlite3.Connection, user_id: int, **fields) -> None:
    """Создать/обновить подключение пользователя. Переданные поля перезаписывают
    старые, остальные сохраняются — так можно проставить только `account` после
    согласия, не трогая requisition."""
    data = {k: None for k in _BANK_FIELDS}
    existing = get_bank_link(conn, user_id)
    if existing is not None:
        data.update({k: existing[k] for k in _BANK_FIELDS})
    data.update({k: v for k, v in fields.items() if k in _BANK_FIELDS})
    conn.execute(
        """INSERT INTO bank_links (user_id, institution, inst_id, requisition, account, last_sync)
           VALUES (:user_id, :institution, :inst_id, :requisition, :account, :last_sync)
           ON CONFLICT(user_id) DO UPDATE SET
               institution = excluded.institution,
               inst_id     = excluded.inst_id,
               requisition = excluded.requisition,
               account     = excluded.account,
               last_sync   = excluded.last_sync""",
        {"user_id": user_id, **data},
    )
    conn.commit()


def migrate_state_db(conn: sqlite3.Connection, owner_id: int) -> None:
    """Привести старую базу веб-состояния к текущей схеме.

    Раньше бюджеты и подключение к банку были глобальными (один владелец). Теперь
    они привязаны к пользователю — переносим унаследованные данные на `owner_id`.
    Безопасно вызывать повторно: если миграция уже сделана, ничего не меняется.
    """
    budget_cols = [r["name"] for r in conn.execute("PRAGMA table_info(budgets)").fetchall()]
    if budget_cols and "user_id" not in budget_cols:
        old = conn.execute(
            "SELECT category, monthly_limit, currency FROM budgets"
        ).fetchall()
        conn.executescript(
            "ALTER TABLE budgets RENAME TO budgets_old;"
            "CREATE TABLE budgets ("
            "  user_id INTEGER NOT NULL,"
            "  category TEXT NOT NULL,"
            "  monthly_limit REAL NOT NULL,"
            "  currency TEXT NOT NULL DEFAULT 'PLN',"
            "  PRIMARY KEY (user_id, category));"
        )
        for r in old:
            conn.execute(
                "INSERT OR REPLACE INTO budgets (user_id, category, monthly_limit, currency)"
                " VALUES (?, ?, ?, ?)",
                (owner_id, r["category"], r["monthly_limit"], r["currency"]),
            )
        conn.execute("DROP TABLE budgets_old")
        conn.commit()

    # Старое подключение к банку жило в settings (gc_*). Переносим во владельца.
    if get_bank_link(conn, owner_id) is None:
        acc = get_setting(conn, "gc_account")
        req = get_setting(conn, "gc_requisition")
        if acc or req:
            set_bank_link(
                conn, owner_id,
                institution=get_setting(conn, "gc_institution"),
                requisition=req,
                account=acc,
                last_sync=get_setting(conn, "gc_last_sync"),
            )


# Пользователи и одноразовые коды входа (многопользовательский режим).

def upsert_user(conn: sqlite3.Connection, telegram_id: int, name: str | None) -> None:
    conn.execute(
        "INSERT INTO users(telegram_id, name, created_at) VALUES(?, ?, ?) "
        "ON CONFLICT(telegram_id) DO UPDATE SET name = excluded.name",
        (telegram_id, name, datetime.now().replace(microsecond=0).isoformat(sep="T")),
    )
    conn.commit()


def create_login_code(conn: sqlite3.Connection, code: str, telegram_id: int,
                      name: str | None, ttl_seconds: int = 600) -> None:
    from datetime import timedelta
    expires = (datetime.now() + timedelta(seconds=ttl_seconds)).replace(microsecond=0).isoformat(sep="T")
    conn.execute(
        "INSERT OR REPLACE INTO login_codes(code, telegram_id, name, expires_at) VALUES(?, ?, ?, ?)",
        (code, telegram_id, name, expires),
    )
    conn.commit()


def redeem_login_code(conn: sqlite3.Connection, code: str) -> dict | None:
    """Проверить одноразовый код. Если действителен — вернуть пользователя и
    погасить код; иначе None. Заодно подчищаем просроченные."""
    now = datetime.now().replace(microsecond=0).isoformat(sep="T")
    row = conn.execute(
        "SELECT telegram_id, name, expires_at FROM login_codes WHERE code = ?", (code,)
    ).fetchone()
    conn.execute("DELETE FROM login_codes WHERE expires_at < ?", (now,))
    conn.commit()
    if row is None or row["expires_at"] < now:
        return None
    conn.execute("DELETE FROM login_codes WHERE code = ?", (code,))
    conn.commit()
    return {"telegram_id": row["telegram_id"], "name": row["name"]}


def ensure_high_ids(conn: sqlite3.Connection, floor: int = 1_000_000) -> None:
    """Поднять автоинкремент так, чтобы новые локальные записи (банк, сайт)
    получали id от floor и выше. Тогда обновление с сервера (где id маленькие)
    их никогда не затрёт и не перепутает по номеру."""
    row = conn.execute("SELECT seq FROM sqlite_sequence WHERE name = 'entries'").fetchone()
    if row is None:
        conn.execute("INSERT INTO sqlite_sequence(name, seq) VALUES('entries', ?)", (floor,))
    elif row["seq"] < floor:
        conn.execute("UPDATE sqlite_sequence SET seq = ? WHERE name = 'entries'", (floor,))
    conn.commit()
