"""Проверки парсера на примерах из документации проекта.

Запуск:  python -m tests.test_parser   (из корня spendtrack-app)
"""

from datetime import datetime

from spendtrack.parser import parse_message, ParseError

NOW = datetime(2026, 6, 5, 18, 30, 0)


def check(text, **expect):
    p = parse_message(text, now=NOW)
    for key, want in expect.items():
        got = getattr(p, key)
        if key == "created_at":
            got = got.isoformat()
        assert got == want, f"[{text!r}] {key}: ждали {want!r}, получили {got!r}"
    return p


def run():
    # обычная трата: первое слово после суммы — категория
    check("50 Еда обед", amount=50.0, category="Еда", note="обед", kind="expense")
    check("60 доставку суши", amount=60.0, category="Доставка", note="суши")
    check("120 Продукты", amount=120.0, category="Продукты", note="")

    # неопознанное первое слово → Прочее, само слово уходит в заметку
    check("50 кебаб", amount=50.0, category="Прочее", note="кебаб")

    # сумма с одним разделителем не путается с датой
    check("32.50 Еда", amount=32.5, category="Еда")
    check("99,99 Продукты", amount=99.99, category="Продукты")

    # трата задним числом: дата с двумя разделителями, время 12:00
    check("02.06.2026 50 Еда обед", amount=50.0, category="Еда", note="обед",
          backdated=True, created_at="2026-06-02T12:00:00")
    check("02.06.26 50 Еда обед", backdated=True, created_at="2026-06-02T12:00:00")
    check("2-6-2026 10 кофе", backdated=True, created_at="2026-06-02T12:00:00")

    # доход и сбережения — отдельные типы, не расходы
    check("4500 зарплата", amount=4500.0, kind="income", category="Доход")
    check("200 отложил ипотека", amount=200.0, kind="savings",
          category="Сбережения", note="ипотека")

    # короткие слова разводятся точным совпадением: «ева» ≠ «еда»
    check("50 ева подарок", category="Ева", note="подарок")
    check("50 еда", category="Еда")

    # опечатки прощаются длинным словам (Левенштейн)
    check("80 прдукты молоко", category="Продукты", note="молоко")

    # валюта: словом, символом, приклеенная к числу
    check("20 eur кофе", currency="EUR", category="Прочее", note="кофе")
    check("15$ Еда", currency="USD", category="Еда")
    check("50zł Продукты", currency="PLN", category="Продукты")
    check("70 Транспорт", currency="PLN")  # по умолчанию PLN

    # пустая/безсумная строка — ошибка
    for bad in ["", "   ", "просто текст без числа"]:
        try:
            parse_message(bad, now=NOW)
        except ParseError:
            pass
        else:
            raise AssertionError(f"ждали ParseError на {bad!r}")

    print("OK: все проверки парсера прошли")


if __name__ == "__main__":
    run()
