"""Заполнить базу реалистичными данными для демонстрации и тестов.

Генерирует траты за последние N дней по всем категориям, ежемесячную зарплату
и редкие сбережения — чтобы диаграмма и лента на странице выглядели живыми.

Запуск:  python -m scripts.seed [--days 75] [--reset]
"""

from __future__ import annotations

import argparse
import random
from datetime import datetime, timedelta

from spendtrack import service, storage
from spendtrack.config import load_config

# Шаблоны трат: категория → (диапазон суммы, примеры заметок).
TEMPLATES = {
    "Еда": ((18, 70), ["обед", "кофе", "ланч", "перекус", "ужин в кафе", ""]),
    "Доставка": ((35, 95), ["суши", "пицца", "вольт", "глово", "бургеры"]),
    "Продукты": ((40, 260), ["Biedronka", "Lidl", "молоко хлеб", "на неделю", ""]),
    "Транспорт": ((8, 60), ["метро", "автобус", "такси", "болт", "бензин"]),
    "Ева": ((40, 320), ["цветы", "подарок", "ужин", "кафе", "сюрприз"]),
    "Развлечения": ((25, 180), ["кино", "бар", "концерт", "игры", "боулинг"]),
    "Одежда": ((60, 400), ["кроссовки", "куртка", "футболка", "джинсы", ""]),
    "Дом": ((20, 200), ["хозтовары", "посуда", "лампочки", "ремонт", ""]),
    "Подписки": ((20, 60), ["Netflix", "Spotify", "YouTube", "iCloud"]),
    "Прочее": ((15, 120), ["кебаб", "аптека", "парикмахер", "почта", ""]),
}
# Аренда — раз в месяц, отдельной крупной строкой.
RENT = (2600, 2600)


def amount(rng: tuple[int, int]) -> int:
    lo, hi = rng
    return random.randint(lo, hi)


def seed(days: int, reset: bool) -> None:
    cfg = load_config()
    conn = storage.get_connection(cfg.db_path)
    storage.init_db(conn)
    user = cfg.web_user_id

    if reset:
        conn.execute("DELETE FROM entries WHERE user_id = ?", (user,))
        conn.commit()
        # подчистим сгенерированные .md
        import shutil
        if cfg.records_dir.exists():
            shutil.rmtree(cfg.records_dir, ignore_errors=True)

    now = datetime.now()
    created = 0
    for d in range(days, -1, -1):
        day = now - timedelta(days=d)
        # 0–4 траты в день, в среднем ~2
        for _ in range(random.choices([0, 1, 2, 3, 4], weights=[1, 3, 4, 3, 2])[0]):
            category = random.choices(
                list(TEMPLATES.keys()),
                weights=[10, 6, 8, 7, 3, 4, 2, 3, 2, 4],
            )[0]
            rng, notes = TEMPLATES[category]
            note = random.choice(notes)
            ts = day.replace(hour=random.randint(8, 22), minute=random.randint(0, 59),
                             second=0, microsecond=0)
            text = f"{amount(rng)} {category} {note}".strip()
            service.add_from_text(conn, cfg.records_dir, user, text, now=ts)
            created += 1

        # аренда 1-го числа, зарплата 5-го, иногда отложить
        if day.day == 1:
            ts = day.replace(hour=10, minute=0, second=0, microsecond=0)
            service.add_from_text(conn, cfg.records_dir, user, f"{RENT[0]} Аренда квартплата", now=ts)
            created += 1
        if day.day == 5:
            ts = day.replace(hour=12, minute=0, second=0, microsecond=0)
            service.add_from_text(conn, cfg.records_dir, user, "8200 зарплата", now=ts)
            service.add_from_text(conn, cfg.records_dir, user, "1000 отложил ипотека", now=ts)
            created += 2

    # пара бюджетов для демонстрации — в отдельной базе веб-состояния
    state = storage.get_connection(cfg.web_state_db)
    storage.init_db(state)
    storage.set_budget(state, user, "Еда", 900, cfg.default_currency)
    storage.set_budget(state, user, "Продукты", 1400, cfg.default_currency)
    storage.set_budget(state, user, "Развлечения", 600, cfg.default_currency)
    state.close()

    total = conn.execute("SELECT COUNT(*) c FROM entries WHERE user_id = ?", (user,)).fetchone()["c"]
    conn.close()
    print(f"Добавлено записей: {created}. Всего в базе у пользователя {user}: {total}.")
    print(f"База: {cfg.db_path}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=75)
    ap.add_argument("--reset", action="store_true", help="очистить записи пользователя перед заливкой")
    args = ap.parse_args()
    seed(args.days, args.reset)
