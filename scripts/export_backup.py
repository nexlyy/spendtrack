"""Экспорт существующей базы SpendTrack в резервную копию для автономного приложения.

Берёт записи (и при наличии — бюджеты) из SQLite, в котором раньше жил сервер, и
складывает их в JSON того же формата, что делает кнопка «Сохранить копию». Этот
файл потом восстанавливается в приложении (Данные и настройки → Восстановить из
копии) — так старые траты переезжают в офлайн-версию.

Запуск:
    python -m scripts.export_backup                 # из cfg.db_path, все пользователи
    python -m scripts.export_backup --user <telegram_id> --out backup.json
    python -m scripts.export_backup --db data/real-spend.db
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime

from spendtrack import storage
from spendtrack.config import load_config

ENTRY_FIELDS = ["id", "amount", "currency", "category", "place", "kind", "note", "raw_text", "created_at"]


def main() -> None:
    cfg = load_config()
    ap = argparse.ArgumentParser(description="Экспорт базы в резервную копию SpendTrack")
    ap.add_argument("--db", default=str(cfg.db_path), help="путь к базе с записями")
    ap.add_argument("--state-db", default=str(cfg.web_state_db), help="база веб-состояния (бюджеты)")
    ap.add_argument("--user", type=int, default=None, help="оставить только этого пользователя (Telegram-id)")
    ap.add_argument("--out", default=None, help="имя выходного файла")
    args = ap.parse_args()

    conn = storage.get_connection(args.db)
    storage.init_db(conn)
    if args.user is not None:
        rows = conn.execute("SELECT * FROM entries WHERE user_id = ? ORDER BY id", (args.user,)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM entries ORDER BY id").fetchall()
    entries = [{k: r[k] for k in ENTRY_FIELDS} for r in rows]
    conn.close()

    budgets = []
    try:
        state = storage.get_connection(args.state_db)
        storage.init_db(state)
        storage.migrate_state_db(state, cfg.web_user_id)
        if args.user is not None:
            brows = storage.get_budgets(state, args.user)
        else:
            brows = state.execute("SELECT category, monthly_limit, currency FROM budgets").fetchall()
        budgets = [{"category": b["category"], "monthly_limit": b["monthly_limit"],
                    "currency": b["currency"]} for b in brows]
        state.close()
    except Exception:
        pass  # бюджеты не критичны — если базы нет, просто пропускаем

    backup = {
        "app": "spendtrack", "format": 1,
        "exported_at": datetime.now().replace(microsecond=0).isoformat(sep="T"),
        "entries": entries, "budgets": budgets, "settings": {}, "imported_tx": [],
    }

    out = args.out or f"spendtrack-backup-{datetime.now():%Y-%m-%d}.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(backup, f, ensure_ascii=False, indent=2)
    print(f"Готово: {out} · записей: {len(entries)}, бюджетов: {len(budgets)}")
    print("Восстановить в приложении: Данные и настройки -> Восстановить из копии.")


if __name__ == "__main__":
    main()
