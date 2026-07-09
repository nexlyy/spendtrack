"""Telegram-бот SpendTrack.

Точка входа, которая связывает всё: принимает сообщения и команды, вызывает
парсер, пишет в базу и генерирует .md-файл. Тяжёлая логика — в общем ядре
(`parser`, `storage`, `service`), здесь только Telegram-обвязка.

Запуск:  python -m spendtrack.bot   (нужен SPENDTRACK_TOKEN)
"""

from __future__ import annotations

import logging
import secrets
from datetime import datetime

from . import service, storage
from .categories import CATEGORY_FORMS, CURRENCY_SYMBOLS
from .config import load_config
from .parser import ParseError
from .periods import period_range

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("spendtrack.bot")

cfg = load_config()
conn = storage.get_connection(cfg.db_path)
storage.init_db(conn)


# Доступ и форматирование

def _allowed(user_id: int | None) -> bool:
    """Whitelist на владельца. Пустой список — пускать всех (первый запуск),
    но об этом громко предупреждаем в логе."""
    if not cfg.allowed_ids:
        return True
    return user_id in cfg.allowed_ids


def fmt_amount(amount: float, currency: str = "PLN") -> str:
    symbol = CURRENCY_SYMBOLS.get(currency, currency)
    text = f"{amount:.2f}".rstrip("0").rstrip(".")
    return f"{text} {symbol}"


def render_summary(label: str, rows) -> str:
    """Текстовая сводка по категориям за период."""
    if not rows:
        return f"*{label}*\nПока пусто."
    lines = [f"*{label}*"]
    totals: dict[str, float] = {}
    for r in rows:
        cur = r["currency"]
        totals[cur] = totals.get(cur, 0.0) + r["total"]
        lines.append(f"• {r['category']} — {fmt_amount(r['total'], cur)}")
    lines.append("")
    lines.append("Итого: " + ", ".join(fmt_amount(v, c) for c, v in totals.items()))
    return "\n".join(lines)


HELP = (
    "*SpendTrack* — быстрый учёт расходов.\n\n"
    "*Как писать трату:*\n"
    "`50 Еда обед` — сумма, категория, заметка\n"
    "`120 Продукты` — заметка необязательна\n"
    "`02.06.2026 50 Еда обед` — задним числом\n"
    "`20 eur кофе` — другая валюта (EUR/USD)\n\n"
    "*Доход и сбережения:*\n"
    "`4500 зарплата` · `200 отложил ипотека`\n\n"
    "*Категории:* " + ", ".join(CATEGORY_FORMS.keys()) + "\n\n"
    "*Команды:*\n"
    "/today — траты за сегодня\n"
    "/week — за неделю (с понедельника)\n"
    "/categories — топ категорий за всё время\n"
    "/del N — удалить запись №N\n"
    "/undo — отменить последнюю запись"
)


# Хендлеры

async def cmd_login(update, context):
    """Выдать одноразовый код для входа в приложение. Доступно всем (это и есть
    регистрация/вход в многопользовательском режиме)."""
    user = update.effective_user
    name = user.full_name or user.username or str(user.id)
    code = f"{secrets.randbelow(900000) + 100000}"
    storage.upsert_user(conn, user.id, name)
    storage.create_login_code(conn, code, user.id, name, ttl_seconds=600)
    await update.message.reply_markdown(
        "Код для входа в приложение SpendTrack:\n\n"
        f"`{code}`\n\n"
        "Введите его на экране входа. Код действует 10 минут."
    )


async def cmd_start(update, context):
    # В многопользовательском режиме /start = онбординг с кодом входа.
    if cfg.multiuser:
        await cmd_login(update, context)
        return
    if not _allowed(update.effective_user.id):
        return
    await update.message.reply_markdown(HELP)


async def _period_summary(update, period: str):
    user_id = update.effective_user.id
    since, until, label = period_range(period)
    rows = storage.summary_by_category(conn, user_id, since, until)
    await update.message.reply_markdown(render_summary(f"Траты · {label}", rows))


async def cmd_today(update, context):
    if not _allowed(update.effective_user.id):
        return
    await _period_summary(update, "today")


async def cmd_week(update, context):
    if not _allowed(update.effective_user.id):
        return
    await _period_summary(update, "week")


async def cmd_categories(update, context):
    if not _allowed(update.effective_user.id):
        return
    user_id = update.effective_user.id
    rows = storage.summary_by_category(conn, user_id, None, None)
    await update.message.reply_markdown(render_summary("Топ категорий · всё время", rows))


async def cmd_del(update, context):
    if not _allowed(update.effective_user.id):
        return
    user_id = update.effective_user.id
    if not context.args or not context.args[0].lstrip("#").isdigit():
        await update.message.reply_text("Формат: /del N, где N — номер записи.")
        return
    entry_id = int(context.args[0].lstrip("#"))
    row = storage.get_entry(conn, entry_id)
    if row is None or row["user_id"] != user_id:
        await update.message.reply_text(f"Запись #{entry_id} не найдена.")
        return
    service.remove_entry(conn, cfg.records_dir, entry_id)
    await update.message.reply_text(
        f"Удалил #{entry_id}: {row['category']} {fmt_amount(row['amount'], row['currency'])}"
    )


async def cmd_undo(update, context):
    if not _allowed(update.effective_user.id):
        return
    user_id = update.effective_user.id
    row = service.undo_last(conn, cfg.records_dir, user_id)
    if row is None:
        await update.message.reply_text("Нечего отменять.")
        return
    await update.message.reply_text(
        f"Отменил #{row['id']}: {row['category']} {fmt_amount(row['amount'], row['currency'])}"
    )


async def on_message(update, context):
    if not _allowed(update.effective_user.id):
        return
    user_id = update.effective_user.id
    text = (update.message.text or "").strip()
    try:
        row, parsed = service.add_from_text(
            conn, cfg.records_dir, user_id, text,
            default_currency=cfg.default_currency,
        )
    except ParseError as exc:
        await update.message.reply_text(f"⚠️ {exc}")
        return

    kind_note = {"income": " (доход)", "savings": " (сбережения)"}.get(parsed.kind, "")
    when = ""
    if parsed.backdated:
        when = f"\n🗓 {parsed.created_at:%d.%m.%Y} 12:00"
    note = f" · {row['note']}" if row["note"] else ""
    await update.message.reply_text(
        f"#{row['id']} · {row['category']}{kind_note} · "
        f"{fmt_amount(row['amount'], row['currency'])}{note}{when}"
    )


def build_application():
    from telegram.ext import (
        Application, CommandHandler, MessageHandler, filters,
    )

    if not cfg.token:
        raise SystemExit(
            "Не задан SPENDTRACK_TOKEN. Создайте бота у @BotFather и положите токен "
            "в переменную окружения SPENDTRACK_TOKEN."
        )
    if not cfg.allowed_ids:
        log.warning("SPENDTRACK_ALLOWED пуст — бот принимает сообщения от всех. "
                    "Для личного бота задайте свой Telegram-id.")

    app = Application.builder().token(cfg.token).build()
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("login", cmd_login))
    app.add_handler(CommandHandler("help", cmd_start))
    app.add_handler(CommandHandler("today", cmd_today))
    app.add_handler(CommandHandler("week", cmd_week))
    app.add_handler(CommandHandler("categories", cmd_categories))
    app.add_handler(CommandHandler("del", cmd_del))
    app.add_handler(CommandHandler("undo", cmd_undo))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_message))
    return app


def main():
    app = build_application()
    log.info("SpendTrack-бот запущен (long polling). База: %s", cfg.db_path)
    app.run_polling(allowed_updates=["message"])


if __name__ == "__main__":
    main()
