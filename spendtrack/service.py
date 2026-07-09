"""Сервисный слой — единственное место, где склеены парсер, база и заметки.

Здесь закреплён важный порядок: сначала вставка в базу (чтобы получить id),
потом запись .md-файла с этим id, потом дозапись пути файла обратно в строку.
И бот, и веб ходят сюда, чтобы не дублировать эту логику и не разойтись.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime
from pathlib import Path

from . import storage, vault
from .parser import ParsedEntry, parse_message


def add_entry(
    conn: sqlite3.Connection,
    records_dir: str | Path,
    user_id: int,
    parsed: ParsedEntry,
) -> sqlite3.Row:
    """Сохранить разобранную запись: база → файл → дозапись пути. Вернуть строку.

    Если records_dir пуст (многопользовательский режим без Obsidian) — пишем
    только в базу, .md-файл не создаём.
    """
    entry_id = storage.insert_entry(conn, parsed.as_record(user_id))
    row = storage.get_entry(conn, entry_id)
    if records_dir:
        path = vault.write_note(records_dir, row)
        storage.set_md_path(conn, entry_id, str(path))
        row = storage.get_entry(conn, entry_id)
    return row


def add_from_text(
    conn: sqlite3.Connection,
    records_dir: str | Path,
    user_id: int,
    text: str,
    now: datetime | None = None,
    default_currency: str = "PLN",
) -> tuple[sqlite3.Row, ParsedEntry]:
    """Разобрать текст и сохранить. Вернуть (строка, результат разбора)."""
    parsed = parse_message(text, now=now, default_currency=default_currency)
    row = add_entry(conn, records_dir, user_id, parsed)
    return row, parsed


def remove_entry(
    conn: sqlite3.Connection,
    records_dir: str | Path,
    entry_id: int,
) -> sqlite3.Row | None:
    """Удалить запись из базы и её .md-файл. Вернуть удалённую строку или None."""
    row = storage.delete_entry(conn, entry_id)
    if row is not None and records_dir:
        vault.delete_note_by_id(records_dir, entry_id)
    return row


def undo_last(
    conn: sqlite3.Connection,
    records_dir: str | Path,
    user_id: int,
) -> sqlite3.Row | None:
    """Удалить последнюю добавленную запись пользователя."""
    last = storage.last_entry(conn, user_id)
    if last is None:
        return None
    return remove_entry(conn, records_dir, int(last["id"]))


def update_entry(
    conn: sqlite3.Connection,
    records_dir: str | Path,
    entry_id: int,
    **fields,
) -> sqlite3.Row | None:
    """Изменить запись и пересобрать её .md-файл (имя файла может смениться)."""
    existing = storage.get_entry(conn, entry_id)
    if existing is None:
        return None
    row = storage.update_entry(conn, entry_id, **fields)
    if records_dir:
        # Перезаписываем существующий файл на месте, не переименовывая: иначе
        # серверный 0012_…md и наш новый дали бы дубль в Obsidian после синхронизации.
        path = vault.find_note_by_id(records_dir, entry_id)
        if path is None:
            path = vault.write_note(records_dir, row)
        else:
            path.write_text(vault.to_markdown(row), encoding="utf-8")
        storage.set_md_path(conn, entry_id, str(path))
        row = storage.get_entry(conn, entry_id)
    return row
