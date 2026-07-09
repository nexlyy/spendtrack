"""Сопоставление польских торговых точек с категориями SpendTrack.

Из описания банковской транзакции (например «ZABKA Z6453 K.1 WARSZAWA»)
определяем категорию: Zabka → Продукты, Bolt → Транспорт, Glovo → Доставка.
Список обычный, его легко дополнять; для платежей, которые словарь не узнал,
ставится «Прочее». Через таблицу overrides можно закрепить своё правило для
конкретной строки описания.
"""

from __future__ import annotations

# Категория → ключевые слова в описании (нижний регистр). Порядок важен:
# «bolt food» (Доставка) проверяется раньше, чем «bolt» (Транспорт).
MERCHANT_KEYWORDS: dict[str, list[str]] = {
    "Доставка": [
        "glovo", "wolt", "pyszne", "uber eats", "ubereats", "lieferando",
        "bolt food", "bolt.eu/food",
    ],
    "Подписки": [
        "netflix", "spotify", "youtube", "google", "apple.com", "icloud",
        "disney", "hbo", "amazon prime", "microsoft", "openai", "chatgpt",
        "patreon", "adobe", "notion",
    ],
    "Продукты": [
        "zabka", "żabka", "biedronka", "lidl", "auchan", "carrefour", "kaufland",
        "dino", "stokrotka", "aldi", "netto", "lewiatan", "polomarket", "spolem",
        "społem", "delikatesy", "fresh market", "supersam", "groszek", "frac",
    ],
    "Еда": [
        "mcdonald", "kfc", "burger king", "starbucks", "costa", "subway",
        "pizza hut", "telepizza", "restauracja", "kawiarnia", "bistro",
        "kebab", "sushi", "thai", "green caffe", "north fish",
    ],
    "Транспорт": [
        "bolt", "uber", "free now", "freenow", "mpk", "ztm", "koleje", "pkp",
        "intercity", "flixbus", "orlen", "shell", "circle k", "lotos", "moya",
        "amic", "bp-", "paliwo", "parking", "taxi", "mevo", "lime", "tier", "dott",
    ],
    "Развлечения": [
        "cinema city", "multikino", "helios", "kino", "empik", "steam",
        "playstation", "xbox", "nintendo", "ticketmaster", "going.", "ebilet",
        "legimi", "audioteka",
    ],
    "Одежда": [
        "zara", "h&m", "hm.com", "reserved", "ccc", "deichmann", "sinsay",
        "cropp", "house", "zalando", "nike", "adidas", "decathlon", "4f",
        "medicine", "mohito", "bershka", "pull&bear", "new balance",
    ],
    "Дом": [
        "ikea", "leroy merlin", "castorama", "obi", "jysk", "action", "pepco",
        "tedi", "homla", "agata", "rossmann", "hebe", "super-pharm",
    ],
    "Аренда": ["czynsz", "najem", "wynajem", "rent ", "rental"],
}


def _normalize(text: str) -> str:
    return (text or "").lower().replace("ё", "е")


def categorize(description: str, overrides: dict[str, str] | None = None) -> str:
    """Определить категорию по описанию транзакции.

    overrides — словарь {фрагмент описания: категория}, проверяется первым,
    чтобы можно было закрепить нестандартные точки.
    """
    d = _normalize(description)
    if overrides:
        for fragment, category in overrides.items():
            if fragment and _normalize(fragment) in d:
                return category
    for category, keywords in MERCHANT_KEYWORDS.items():
        for kw in keywords:
            if kw in d:
                return category
    return "Прочее"


def guess_merchant(description: str) -> str:
    """Грубая попытка вытащить «имя магазина» из описания для показа.

    Берём осмысленную часть до служебных токенов (номера терминала, города).
    """
    text = (description or "").strip()
    for sep in ("  ", " K.", " NR", " WARSZAWA", " KRAKOW", " GDANSK", " WROCLAW"):
        idx = text.upper().find(sep)
        if idx > 2:
            text = text[:idx]
            break
    # отрезаем хвостовые коды вида Z6453
    parts = [p for p in text.split() if not (len(p) >= 4 and p[0].isalpha() and any(c.isdigit() for c in p))]
    return (" ".join(parts) or text).strip()[:40]
