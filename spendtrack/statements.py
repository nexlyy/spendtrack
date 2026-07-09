"""Разбор банковской выписки (CSV) в список транзакций.

Парсер гибкий: сам определяет разделитель, находит строку заголовка и колонки
по польским/английским названиям, понимает польский формат чисел (запятая —
десятичная, пробел — разряды) и дат. Заточен под выписки PKO, но переживает и
другие банки. Каждой транзакции даём стабильный id (хеш даты, суммы, описания),
чтобы повторный импорт не задваивал.
"""

from __future__ import annotations

import csv
import hashlib
import io
import re
from datetime import datetime

DELIMITERS = [";", "\t", ","]

DATE_KEYS = ["data operacji", "data księgowania", "data ksiegowania",
             "data transakcji", "data waluty", "data", "date"]
AMOUNT_KEYS = ["kwota operacji", "kwota w walucie", "kwota", "wartość", "wartosc", "amount"]
DEBIT_KEYS = ["obciążenia", "obciazenia", "wydatki", "debit"]
CREDIT_KEYS = ["uznania", "wpłaty", "wplaty", "wpływy", "wplywy", "credit"]
DESC_KEYS = ["opis operacji", "tytuł", "tytul", "nazwa odbiorcy", "odbiorca",
             "dane kontrahenta", "kontrahent", "szczegóły", "szczegoly",
             "opis", "nazwa", "description", "title"]
CURRENCY_KEYS = ["waluta", "currency"]

_DATE_FORMATS = ["%Y-%m-%d", "%d.%m.%Y", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d", "%Y.%m.%d"]


def decode_bytes(raw: bytes) -> str:
    """Декодировать файл выписки. PKO часто отдаёт cp1250/ISO-8859-2."""
    for enc in ("utf-8-sig", "utf-8", "cp1250", "iso-8859-2", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", "replace")


def _sniff_delimiter(text: str) -> str:
    line = next((ln for ln in text.splitlines() if ln.strip()), "")
    return max(DELIMITERS, key=lambda d: line.count(d))


def _find_col(headers: list[str], keys: list[str]) -> int | None:
    low = [h.strip().lower() for h in headers]
    for key in keys:
        for i, h in enumerate(low):
            if key in h:
                return i
    return None


def _parse_amount(text: str | None) -> float | None:
    if text is None:
        return None
    s = str(text).strip().replace("\xa0", "").replace(" ", "")
    s = re.sub(r"[^\d,.\-+]", "", s)  # убрать валюту и прочее
    if not s or s in ("-", "+"):
        return None
    if "," in s and "." in s:          # 1.234,56 → 1234.56
        s = s.replace(".", "").replace(",", ".")
    else:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def _parse_date(text: str | None) -> str:
    s = (text or "").strip()[:10]
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return ""


def parse_statement(text: str) -> list[dict]:
    if not text or not text.strip():
        return []
    delim = _sniff_delimiter(text)
    rows = [r for r in csv.reader(io.StringIO(text), delimiter=delim) if any(c.strip() for c in r)]
    if not rows:
        return []

    # строка заголовка — где есть дата и (сумма или дебет)
    header_idx, headers = 0, rows[0]
    for i, r in enumerate(rows[:20]):
        low = [c.strip().lower() for c in r]
        has_date = any(any(k in c for c in low) for k in DATE_KEYS)
        has_amt = any(any(k in c for c in low) for k in AMOUNT_KEYS + DEBIT_KEYS)
        if has_date and has_amt:
            header_idx, headers = i, r
            break

    date_i = _find_col(headers, DATE_KEYS)
    amt_i = _find_col(headers, AMOUNT_KEYS)
    deb_i = _find_col(headers, DEBIT_KEYS)
    cred_i = _find_col(headers, CREDIT_KEYS)
    desc_i = _find_col(headers, DESC_KEYS)
    cur_i = _find_col(headers, CURRENCY_KEYS)
    if date_i is None:
        return []

    out: list[dict] = []
    for r in rows[header_idx + 1:]:
        if date_i >= len(r):
            continue
        date = _parse_date(r[date_i])
        if not date:
            continue

        amount = _parse_amount(r[amt_i]) if (amt_i is not None and amt_i < len(r)) else None
        if amount is None and deb_i is not None and deb_i < len(r):
            d = _parse_amount(r[deb_i])
            if d:
                amount = -abs(d)
        if amount is None and cred_i is not None and cred_i < len(r):
            c = _parse_amount(r[cred_i])
            if c:
                amount = abs(c)
        if amount is None or amount == 0:
            continue

        desc = (r[desc_i].strip() if desc_i is not None and desc_i < len(r) else "")
        desc = re.sub(r"\s+", " ", desc).strip()
        currency = (r[cur_i].strip() if cur_i is not None and cur_i < len(r) else "") or "PLN"
        tx_id = hashlib.sha1(f"{date}|{amount}|{desc}".encode("utf-8")).hexdigest()[:16]
        out.append({"id": tx_id, "date": date, "amount": amount,
                    "currency": currency, "description": desc})
    return out
