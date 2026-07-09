"""Границы периодов — общие для бота и веба.

Граница дня — полночь локального времени, граница недели — понедельник.
В отличие от старой страницы в Obsidian (где «месяц» был последними 31 днём),
здесь «месяц» и «год» — календарные: так суммы совпадают с привычным
пониманием «за июнь», «за 2026».
"""

from __future__ import annotations

from datetime import datetime, timedelta

# Канонические имена периодов и их человеческие подписи.
PERIOD_LABELS = {
    "today": "Сегодня",
    "week": "Неделя",
    "month": "Месяц",
    "year": "Год",
    "all": "Всё время",
}


def day_start(now: datetime) -> datetime:
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def week_start(now: datetime) -> datetime:
    """Понедельник текущей недели, 00:00."""
    start = day_start(now)
    return start - timedelta(days=start.weekday())


def month_start(now: datetime) -> datetime:
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def year_start(now: datetime) -> datetime:
    return now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)


def _add_month(dt: datetime) -> datetime:
    if dt.month == 12:
        return dt.replace(year=dt.year + 1, month=1)
    return dt.replace(month=dt.month + 1)


def period_range(name: str, now: datetime | None = None) -> tuple[datetime | None, datetime | None, str]:
    """Вернуть (since, until, подпись) для имени периода.

    since включительно, until — исключительно (created_at < until). Для «всё
    время» обе границы None.
    """
    now = now or datetime.now()
    name = (name or "month").lower()
    if name in ("today", "day", "сутки"):
        s = day_start(now)
        return s, s + timedelta(days=1), PERIOD_LABELS["today"]
    if name in ("week", "неделя"):
        s = week_start(now)
        return s, s + timedelta(days=7), PERIOD_LABELS["week"]
    if name in ("month", "месяц"):
        s = month_start(now)
        return s, _add_month(s), PERIOD_LABELS["month"]
    if name in ("year", "год"):
        s = year_start(now)
        return s, s.replace(year=s.year + 1), PERIOD_LABELS["year"]
    # «всё время» и любое неизвестное имя
    return None, None, PERIOD_LABELS["all"]
