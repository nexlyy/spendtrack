"""Парсер входящей строки.

Это самостоятельная логика без побочных эффектов: на входе текст, на выходе
структура записи. Из сообщения по очереди извлекаются четыре вещи —
необязательная дата, сумма, валюта и категория с заметкой.

Тонкий момент разведения даты и суммы: дата обязана иметь два разделителя
(`02.06.2026`), а сумма — максимум один (`99.99`). Поэтому `32.50 Еда`
не ломается: `32.50` остаётся суммой, а не принимается за дату.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime

from . import categories as cat

# Дата: ровно два разделителя (точка, дефис или слеш), год 2 или 4 цифры.
DATE_RE = re.compile(r"^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$")

# Сумма: необязательный символ валюты спереди, число с максимум одним
# десятичным разделителем и максимум двумя знаками, опциональный «хвост»
# (символ/слово валюты, приклеенные к числу).
AMOUNT_RE = re.compile(
    r"^(?P<sym1>[$€])?(?P<num>\d+(?:[.,]\d{1,2})?)(?P<sym2>[^\d].*)?$"
)


class ParseError(ValueError):
    """Строку не удалось разобрать (например, нет суммы)."""


@dataclass
class ParsedEntry:
    amount: float
    currency: str
    category: str
    note: str
    kind: str                # expense | income | savings
    created_at: datetime
    raw_text: str
    place: str = "—"
    backdated: bool = False  # трата задним числом (время выставлено в 12:00)

    def as_record(self, user_id: int) -> dict:
        """Представление для вставки в SQLite (created_at — локальное ISO без TZ)."""
        return {
            "user_id": user_id,
            "amount": self.amount,
            "currency": self.currency,
            "category": self.category,
            "place": self.place,
            "kind": self.kind,
            "note": self.note,
            "raw_text": self.raw_text,
            "created_at": self.created_at.replace(microsecond=0).isoformat(sep="T"),
        }


def _parse_date(token: str) -> datetime | None:
    """Разобрать дату из начала строки. Записи задним числом получают 12:00 —
    полдень, чтобы сдвиг часового пояса не перекинул дату на соседний день."""
    m = DATE_RE.match(token)
    if not m:
        return None
    day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if year < 100:
        year += 2000
    try:
        return datetime(year, month, day, 12, 0, 0)
    except ValueError:
        return None  # «32.13.2026» — не дата, пусть едет дальше


def _parse_amount(token: str) -> tuple[float | None, str | None]:
    """Если токен — сумма, вернуть (значение, валюта|None). Иначе (None, None)."""
    m = AMOUNT_RE.match(token)
    if not m:
        return None, None
    try:
        value = float(m.group("num").replace(",", "."))
    except ValueError:
        return None, None
    glued = (m.group("sym1") or "") + (m.group("sym2") or "")
    glued = glued.strip()
    currency = None
    if glued:
        currency = cat.match_currency(glued)
        if currency is None:
            # к числу приклеено что-то не-валютное («50кг») — это не сумма
            return None, None
    return value, currency


def parse_message(
    text: str,
    now: datetime | None = None,
    default_currency: str = cat.DEFAULT_CURRENCY,
) -> ParsedEntry:
    """Разобрать сообщение в структуру записи."""
    now = now or datetime.now()
    raw = text.strip()
    tokens = raw.split()
    if not tokens:
        raise ParseError("Пустое сообщение")

    created_at = now
    backdated = False

    # 1) необязательная дата в начале
    dt = _parse_date(tokens[0])
    if dt is not None:
        created_at = dt
        backdated = True
        tokens = tokens[1:]

    # 2) сумма (первое число) и, возможно, приклеенная к ней валюта
    amount = currency = amount_idx = None
    for i, tok in enumerate(tokens):
        value, cur = _parse_amount(tok)
        if value is not None:
            amount, currency, amount_idx = value, cur, i
            break
    if amount is None:
        raise ParseError("Не нашёл сумму. Формат: «50 Еда обед».")

    rest = tokens[:amount_idx] + tokens[amount_idx + 1:]

    # 3) валюта отдельным словом/символом, если ещё не определена
    if currency is None:
        kept: list[str] = []
        for tok in rest:
            c = cat.match_currency(tok)
            if c and currency is None:
                currency = c
            else:
                kept.append(tok)
        rest = kept
    currency = currency or default_currency

    # 4) тип записи и категория — по первому слову остатка
    kind = "expense"
    category = cat.DEFAULT_CATEGORY
    note_tokens = rest
    if rest:
        first = rest[0]
        if cat.match_income(first):
            kind, category, note_tokens = "income", cat.KIND_LABELS["income"], rest[1:]
        elif cat.match_savings(first):
            kind, category, note_tokens = "savings", cat.KIND_LABELS["savings"], rest[1:]
        else:
            matched = cat.match_category(first)
            if matched:
                category, note_tokens = matched, rest[1:]
            else:
                # слово не опознано — категория «Прочее», а слово уходит в заметку
                category, note_tokens = cat.DEFAULT_CATEGORY, rest

    note = " ".join(note_tokens).strip()

    return ParsedEntry(
        amount=round(amount, 2),
        currency=currency,
        category=category,
        note=note,
        kind=kind,
        created_at=created_at,
        raw_text=raw,
        backdated=backdated,
    )
