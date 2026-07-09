"""Генерация .md-файла из записи.

Файл — это «представление» строки базы для Obsidian. Имя содержит числовой
id (по нему файл находят при удалении), фронтматтер — на русском, потому что
страница `Траты` читает поля по русским ключам.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Mapping

# Запрещённые в именах файлов символы Windows/Unix.
_BAD_CHARS = re.compile(r'[\\/:*?"<>|]')


def _field(row: Mapping, key: str, default=""):
    try:
        value = row[key]
    except (KeyError, IndexError, TypeError):
        return default
    return default if value is None else value


def _split_dt(created_at: str) -> tuple[str, str]:
    """'2026-06-05T14:30:00' → ('2026-06-05', '14:30')."""
    if "T" in created_at:
        date_part, time_part = created_at.split("T", 1)
    elif " " in created_at:
        date_part, time_part = created_at.split(" ", 1)
    else:
        date_part, time_part = created_at, "00:00"
    return date_part, time_part[:5]


def entry_filename(row: Mapping) -> str:
    entry_id = int(_field(row, "id", 0))
    category = _BAD_CHARS.sub("", str(_field(row, "category", "Прочее"))).strip()
    # Дефис после номера — чтобы наши файлы не путались с серверными
    # (0012_дата_…) и чтобы синхронизатор их не трогал зеркальным удалением.
    return f"{entry_id:05d}-{category}.md".strip()


def to_markdown(row: Mapping) -> str:
    """Содержимое .md-файла, как у серверных записей: тот же фронтматтер плюс
    ссылки [[Категория]] и [[—]] в теле — именно они связывают запись с узлом
    категории и с центром в графе Obsidian (иначе записи висят вразброс)."""
    entry_id = int(_field(row, "id", 0))
    date_part, time_part = _split_dt(str(_field(row, "created_at", "")))
    amount = _field(row, "amount", 0)
    currency = _field(row, "currency", "PLN")
    category = str(_field(row, "category", "Прочее"))
    note = _field(row, "note", "")
    message = _field(row, "raw_text", "") or note
    lines = [
        "---",
        f"id: {entry_id}",
        f"тип: {_field(row, 'kind', 'expense')}",
        f"сумма: {amount}",
        f"валюта: {currency}",
        f"категория: {category}",
        "место: —",
        f"дата: {date_part}",
        f"время: {time_part}",
        "---",
        "",
        f"# {amount} {currency} — {category}",
        "",
        f"- Категория: [[{category}]]",
        "- Место: [[—]]",
        f"- Когда: {date_part} {time_part}",
        f"- Сообщение: {message}",
        "",
    ]
    return "\n".join(lines)


def write_note(records_dir: str | Path, row: Mapping) -> Path:
    """Записать .md-файл записи в папку `Записи`, вернуть путь."""
    directory = Path(records_dir)
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / entry_filename(row)
    path.write_text(to_markdown(row), encoding="utf-8")
    return path


def find_note_by_id(records_dir: str | Path, entry_id: int) -> Path | None:
    # Ищем по ведущему числу в имени, а не по точному префиксу — иначе наши
    # 5-значные имена (00012-…) не находят серверные 4-значные (0012_…).
    directory = Path(records_dir)
    if not directory.exists():
        return None
    entry_id = int(entry_id)
    for path in directory.glob("*.md"):
        m = re.match(r"^0*(\d+)[ _.\-]", path.name)
        if m and int(m.group(1)) == entry_id:
            return path
    return None


def delete_note_by_id(records_dir: str | Path, entry_id: int) -> bool:
    """Удалить .md-файл записи по её номеру. True, если файл был и удалён."""
    path = find_note_by_id(records_dir, entry_id)
    if path and path.exists():
        path.unlink()
        return True
    return False
