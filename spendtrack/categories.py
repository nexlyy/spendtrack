"""Словарь категорий, маркеров дохода/сбережений и валют.

Это «знание о языке трат». Принцип строгий (см. документацию проекта):
первое слово после суммы считается категорией и сверяется со словарём форм.
Если совпало — категория известна, остаток строки идёт в заметку.
Если нет — категория «Прочее», а слово уходит в заметку.

Сравнение всегда идёт по нормализованной форме (нижний регистр, ё→е),
а для слов длиной от пяти букв прощаются опечатки (расстояние Левенштейна).
Короткие слова («ева» и «еда») разводятся только точным совпадением — это
намеренно, иначе траты на девушку путались бы с едой.
"""

from __future__ import annotations

# Порядок важен: в этом порядке категории показываются в /start и в легенде.
CATEGORY_FORMS: dict[str, list[str]] = {
    "Еда": [
        "еда", "еду", "еды", "еде", "едой",
        "обед", "ужин", "завтрак", "ланч", "перекус",
        "кафе", "ресторан", "столовая",
    ],
    "Доставка": [
        "доставка", "доставку", "доставки", "доставке", "доставкой",
        "вольт", "глово", "wolt", "glovo", "пицца",
    ],
    "Продукты": [
        "продукты", "продукт", "продукта", "продуктов", "продуктам", "продуктами",
        "бакалея", "супермаркет", "biedronka", "lidl",
    ],
    "Транспорт": [
        "транспорт", "транспорта", "транспорту",
        "проезд", "билет", "билеты", "метро", "автобус", "трамвай",
        "такси", "uber", "болт", "bolt", "бензин", "заправка",
    ],
    "Ева": [
        # короткое слово — только точное совпадение, без опечаток
        "ева", "еве", "еву", "евы", "евой",
    ],
    "Аренда": [
        "аренда", "аренду", "аренды", "аренде", "арендой",
        "квартплата", "рент", "жильё", "жилье",
    ],
    "Развлечения": [
        "развлечения", "развлечение", "развлечений", "развлекуха",
        "кино", "концерт", "бар", "клуб", "игры", "игра", "отдых",
    ],
    "Одежда": [
        "одежда", "одежду", "одежды", "одежде", "одеждой",
        "обувь", "обуви", "кроссовки", "куртка", "шмотки",
    ],
    "Дом": [
        "дом", "дома", "дому",
        "быт", "хозтовары", "мебель", "ремонт", "посуда",
    ],
    "Подписки": [
        "подписка", "подписки", "подписку", "подписке", "подпиской",
        "netflix", "нетфликс", "spotify", "спотифай", "youtube", "ютуб",
    ],
    "Прочее": [
        "прочее", "прочего", "прочему", "разное", "другое",
    ],
}

# Категория-корзина по умолчанию, когда первое слово не опознано.
DEFAULT_CATEGORY = "Прочее"

# Маркеры дохода и сбережений. Эти записи не идут в расходы и в диаграмму трат —
# они сохраняются отдельным kind ('income' / 'savings').
INCOME_FORMS: list[str] = [
    "зарплата", "зарплату", "зарплаты", "зп",
    "доход", "дохода", "получил", "получила",
    "премия", "премию", "аванс", "гонорар", "фриланс",
]
SAVINGS_FORMS: list[str] = [
    "отложил", "отложила", "отложить",
    "накопления", "накопил", "накопить", "заначка", "копилка",
    "ипотека", "ипотеку", "ипотеки", "сбережения", "сбережение",
]

# Метки kind → отображаемое имя «категории» для дохода/сбережений.
KIND_LABELS = {
    "income": "Доход",
    "savings": "Сбережения",
}

# Валюты: словные и символьные формы → ISO-код.
DEFAULT_CURRENCY = "PLN"
CURRENCY_FORMS: dict[str, str] = {
    "pln": "PLN", "зл": "PLN", "злотых": "PLN", "злотый": "PLN", "zł": "PLN", "zl": "PLN",
    "eur": "EUR", "евро": "EUR", "€": "EUR",
    "usd": "USD", "доллар": "USD", "долларов": "USD", "доллара": "USD", "бакс": "USD", "$": "USD",
}
CURRENCY_SYMBOLS = {"PLN": "zł", "EUR": "€", "USD": "$"}


def normalize(word: str) -> str:
    """Нормализация для сравнения: нижний регистр, ё→е, обрезка пунктуации по краям."""
    w = word.strip().lower().replace("ё", "е")
    return w.strip(".,!?;:()[]\"'«»")


def _levenshtein(a: str, b: str) -> int:
    """Расстояние Левенштейна (классический DP). Нужен только для опечаток."""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cost = 0 if ca == cb else 1
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost))
        prev = cur
    return prev[-1]


def _max_typo_distance(length: int) -> int:
    """Сколько опечаток прощаем слову данной длины.

    До пяти букв — ноль (точное совпадение), это защищает «ева»/«еда».
    Длинные слова прощают больше: «прдукты» → «продукты».
    """
    if length < 5:
        return 0
    if length < 8:
        return 1
    return 2


def _build_index(forms_map: dict[str, list[str]]) -> tuple[dict[str, str], list[tuple[str, str]]]:
    """Строит прямой индекс form→label и плоский список для нечёткого поиска."""
    exact: dict[str, str] = {}
    flat: list[tuple[str, str]] = []
    for label, forms in forms_map.items():
        for form in forms:
            nf = normalize(form)
            exact.setdefault(nf, label)
            flat.append((nf, label))
    return exact, flat


_CAT_EXACT, _CAT_FLAT = _build_index(CATEGORY_FORMS)
_INCOME_EXACT, _INCOME_FLAT = _build_index({"income": INCOME_FORMS})
_SAVINGS_EXACT, _SAVINGS_FLAT = _build_index({"savings": SAVINGS_FORMS})


def _match(word: str, exact: dict[str, str], flat: list[tuple[str, str]]) -> str | None:
    """Опознать слово: сперва точно, затем — опечаткой для длинных слов."""
    nw = normalize(word)
    if not nw:
        return None
    if nw in exact:
        return exact[nw]
    max_dist = _max_typo_distance(len(nw))
    if max_dist == 0:
        return None
    best_label, best_dist = None, max_dist + 1
    for form, label in flat:
        # дешёвая отсечка по длине перед дорогим DP
        if abs(len(form) - len(nw)) > max_dist:
            continue
        d = _levenshtein(nw, form)
        if d < best_dist:
            best_label, best_dist = label, d
            if d == 0:
                break
    return best_label if best_dist <= max_dist else None


def match_category(word: str) -> str | None:
    """Вернуть каноническое имя категории для слова или None."""
    return _match(word, _CAT_EXACT, _CAT_FLAT)


def match_income(word: str) -> bool:
    return _match(word, _INCOME_EXACT, _INCOME_FLAT) is not None


def match_savings(word: str) -> bool:
    return _match(word, _SAVINGS_EXACT, _SAVINGS_FLAT) is not None


def match_currency(word: str) -> str | None:
    """Опознать валюту по слову или символу. Только точное совпадение."""
    nw = normalize(word)
    return CURRENCY_FORMS.get(nw)


def category_names() -> list[str]:
    return list(CATEGORY_FORMS.keys())
