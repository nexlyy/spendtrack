"""Пересборка всех .md-файлов из базы.

Поскольку база первична, заметки всегда можно перегенерировать из неё, если
они потерялись или побились на ПК. Данные при этом не теряются — они всё время
лежали в базе, а не в файлах.

Запуск:  python -m spendtrack.rebuild
"""

from __future__ import annotations

from . import storage, vault
from .config import load_config


def rebuild_all() -> int:
    cfg = load_config()
    conn = storage.get_connection(cfg.db_path)
    storage.init_db(conn)
    rows = conn.execute("SELECT * FROM entries ORDER BY id").fetchall()
    count = 0
    for row in rows:
        path = vault.write_note(cfg.records_dir, row)
        storage.set_md_path(conn, int(row["id"]), str(path))
        count += 1
    conn.close()
    print(f"Пересобрано записей: {count} → {cfg.records_dir}")
    return count


if __name__ == "__main__":
    rebuild_all()
