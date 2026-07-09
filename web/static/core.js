// Ядро SpendTrack на чистом JS — порт пакета spendtrack (parser, categories,
// merchants, periods, statements). Никакого DOM и хранилища: на входе текст,
// на выходе разобранная запись. Раньше это жило на Python-сервере; теперь всё
// считается прямо на устройстве, поэтому приложение работает без сети.
"use strict";

const Core = (() => {
  // --- категории и формы слов (categories.py) ---
  // Слова-категории на 4 языках: ru / uk / pl / en. Ключ — каноническое русское
  // имя (так данные не зависят от языка интерфейса). «Ева» убрана из стандартных.
  const CATEGORY_FORMS = {
    "Еда": ["еда", "еду", "еды", "еде", "едой", "обед", "ужин", "завтрак", "ланч",
      "перекус", "кафе", "ресторан", "столовая",
      "їжа", "обід", "вечеря", "сніданок", "перекус", "кафе", "ресторан",
      "jedzenie", "obiad", "kolacja", "śniadanie", "przekąska", "kawiarnia", "restauracja",
      "food", "lunch", "dinner", "breakfast", "meal", "snack", "cafe", "restaurant", "eat"],
    "Доставка": ["доставка", "доставку", "доставки", "доставке", "доставкой",
      "вольт", "глово", "wolt", "glovo", "пицца",
      "доставка", "доставку", "dostawa", "dowóz", "delivery", "takeaway", "pizza"],
    "Продукты": ["продукты", "продукт", "продукта", "продуктов", "продуктам",
      "продуктами", "бакалея", "супермаркет", "biedronka", "lidl",
      "продукти", "бакалія", "zakupy", "spożywcze", "groceries", "grocery", "supermarket"],
    "Транспорт": ["транспорт", "транспорта", "транспорту", "проезд", "билет",
      "билеты", "метро", "автобус", "трамвай", "такси", "uber", "болт", "bolt",
      "бензин", "заправка",
      "проїзд", "квиток", "таксі", "паливо", "потяг",
      "bilet", "autobus", "tramwaj", "paliwo", "benzyna", "taxi", "parking", "pociąg",
      "transport", "transit", "bus", "train", "fuel", "gas", "ticket"],
    "Аренда": ["аренда", "аренду", "аренды", "аренде", "арендой", "квартплата",
      "рент", "жильё", "жилье",
      "оренда", "оренду", "житло",
      "czynsz", "najem", "wynajem", "mieszkanie", "rent", "housing"],
    "Развлечения": ["развлечения", "развлечение", "развлечений", "развлекуха",
      "кино", "концерт", "бар", "клуб", "игры", "игра", "отдых",
      "розваги", "розвага", "кіно", "концерт", "ігри", "гра", "відпочинок",
      "rozrywka", "kino", "koncert", "klub", "impreza", "gry", "gra",
      "entertainment", "cinema", "movie", "concert", "club", "games", "game", "party", "fun"],
    "Одежда": ["одежда", "одежду", "одежды", "одежде", "одеждой", "обувь", "обуви",
      "кроссовки", "куртка", "шмотки",
      "одяг", "взуття",
      "ubrania", "odzież", "buty", "ubranie",
      "clothes", "clothing", "shoes", "jacket", "sneakers"],
    "Дом": ["дом", "дома", "дому", "быт", "хозтовары", "мебель", "ремонт", "посуда",
      "дім", "меблі", "ремонт",
      "meble", "remont", "agd",
      "home", "house", "furniture", "repair"],
    "Уход": ["уход", "ухода", "косметика", "косметику", "косметики", "шампунь",
      "крем", "парфюм", "дрогери", "бьюти",
      "догляд", "косметика",
      "kosmetyki", "drogeria", "pielęgnacja", "perfumy",
      "care", "cosmetics", "beauty", "skincare", "shampoo"],
    "Здоровье": ["здоровье", "здоровья", "аптека", "аптеку", "аптеки", "лекарства",
      "лекарство", "таблетки", "врач", "клиника", "анализы",
      "здоров'я", "аптека", "лікар", "ліки",
      "apteka", "lekarz", "leki", "zdrowie",
      "health", "pharmacy", "doctor", "medicine", "meds", "dentist"],
    "Образование": ["образование", "учёба", "учеба", "университет", "курсы", "курс",
      "обучение", "студент", "школа", "репетитор",
      "освіта", "навчання", "курс", "університет",
      "edukacja", "nauka", "kurs", "szkoła", "uczelnia", "studia",
      "education", "course", "school", "university", "tuition", "study"],
    "Подписки": ["подписка", "подписки", "подписку", "подписке", "подпиской",
      "netflix", "нетфликс", "spotify", "спотифай", "youtube", "ютуб",
      "підписка", "підписки", "абонемент",
      "subskrypcja", "subskrypcje", "abonament",
      "subscription", "subscriptions"],
    "Прочее": ["прочее", "прочего", "прочему", "разное", "другое",
      "інше", "різне", "inne", "różne", "other", "misc"],
  };
  const DEFAULT_CATEGORY = "Прочее";
  const INCOME_FORMS = ["зарплата", "зарплату", "зарплаты", "зп", "доход", "дохода",
    "получил", "получила", "премия", "премию", "аванс", "гонорар", "фриланс",
    "зарплата", "дохід", "премія", "аванс", "отримав", "гонорар",
    "wypłata", "pensja", "przychód", "premia", "zaliczka", "wynagrodzenie",
    "salary", "income", "paycheck", "bonus", "paid", "wage", "refund"];
  const SAVINGS_FORMS = ["отложил", "отложила", "отложить", "накопления", "накопил",
    "накопить", "заначка", "копилка", "ипотека", "ипотеку", "ипотеки",
    "сбережения", "сбережение",
    "відклав", "відкласти", "заощадження", "накопичення", "накопив",
    "oszczędności", "odłożone", "oszczędzam", "oszczędności",
    "savings", "saved", "save"];
  const KIND_LABELS = { income: "Доход", savings: "Сбережения" };

  const DEFAULT_CURRENCY = "PLN";
  const CURRENCY_FORMS = {
    "pln": "PLN", "зл": "PLN", "злотых": "PLN", "злотый": "PLN", "злотих": "PLN",
    "zł": "PLN", "zl": "PLN", "zloty": "PLN", "zlotych": "PLN", "złoty": "PLN",
    "eur": "EUR", "евро": "EUR", "євро": "EUR", "euro": "EUR", "€": "EUR",
    "usd": "USD", "доллар": "USD", "долларов": "USD", "доллара": "USD", "долар": "USD",
    "бакс": "USD", "dollar": "USD", "dolar": "USD", "$": "USD",
    "uah": "UAH", "грн": "UAH", "гривна": "UAH", "гривен": "UAH", "гривня": "UAH",
    "гривень": "UAH", "гривні": "UAH", "гривень.": "UAH", "hrn": "UAH", "грв": "UAH", "₴": "UAH",
  };
  const CURRENCY_SYMBOLS = { PLN: "zł", EUR: "€", USD: "$", UAH: "₴" };

  // Курсы для сводной аналитики (сколько PLN в 1 единице валюты). Офлайн-приложение
  // не тянет живые курсы — это ориентировочные значения, пользователь правит их в
  // настройках. База — PLN (=1).
  const DEFAULT_RATES = { PLN: 1, EUR: 4.3, USD: 4.0, UAH: 0.1 };
  function convert(amount, from, to, rates) {
    if (!from || !to || from === to) return amount;
    const rf = (rates && rates[from]) || 1;
    const rt = (rates && rates[to]) || 1;
    return rt ? amount * rf / rt : amount;
  }
  // Валюта — только буквы (ISO-код), максимум 8. Отсекает и мусор из выписки, и
  // возможную HTML-инъекцию через код валюты в восстановленной копии.
  function cleanCurrency(c) {
    const s = String(c == null ? "" : c).replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 8);
    return s || "PLN";
  }

  const STRIP = /^[.,!?;:()[\]"'«»]+|[.,!?;:()[\]"'«»]+$/g;
  function normalize(word) {
    return String(word == null ? "" : word).trim().toLowerCase().replace(/ё/g, "е").replace(STRIP, "");
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a) return b.length;
    if (!b) return a.length;
    let prev = [];
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      }
      prev = cur;
    }
    return prev[b.length];
  }

  function maxTypoDistance(len) {
    if (len < 5) return 0;
    if (len < 8) return 1;
    return 2;
  }

  function buildIndex(formsMap) {
    const exact = {};
    const flat = [];
    for (const label of Object.keys(formsMap)) {
      for (const form of formsMap[label]) {
        const nf = normalize(form);
        if (!(nf in exact)) exact[nf] = label;
        flat.push([nf, label]);
      }
    }
    return { exact, flat };
  }

  const CAT_IDX = buildIndex(CATEGORY_FORMS);
  const INCOME_IDX = buildIndex({ income: INCOME_FORMS });
  const SAVINGS_IDX = buildIndex({ savings: SAVINGS_FORMS });

  function matchIn(word, idx) {
    const nw = normalize(word);
    if (!nw) return null;
    if (nw in idx.exact) return idx.exact[nw];
    const maxDist = maxTypoDistance(nw.length);
    if (maxDist === 0) return null;
    let bestLabel = null, bestDist = maxDist + 1;
    for (const [form, label] of idx.flat) {
      if (Math.abs(form.length - nw.length) > maxDist) continue;
      const d = levenshtein(nw, form);
      if (d < bestDist) { bestLabel = label; bestDist = d; if (d === 0) break; }
    }
    return bestDist <= maxDist ? bestLabel : null;
  }

  const matchCategory = (w) => matchIn(w, CAT_IDX);
  const matchIncome = (w) => matchIn(w, INCOME_IDX) !== null;
  const matchSavings = (w) => matchIn(w, SAVINGS_IDX) !== null;
  const matchCurrency = (w) => CURRENCY_FORMS[normalize(w)] || null;
  const categoryNames = () => Object.keys(CATEGORY_FORMS);

  // --- даты как локальный ISO без TZ (совпадает с форматом старого сервера) ---
  function pad(n) { return String(n).padStart(2, "0"); }
  function localISO(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  // --- парсер строки (parser.py) ---
  const DATE_RE = /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/;
  const AMOUNT_RE = /^(?<sym1>[$€])?(?<num>\d+(?:[.,]\d{1,2})?)(?<sym2>[^\d].*)?$/;

  function parseDateToken(token) {
    const m = DATE_RE.exec(token);
    if (!m) return null;
    let [, dd, mm, yy] = m;
    let day = +dd, month = +mm, year = +yy;
    if (year < 100) year += 2000;
    const dt = new Date(year, month - 1, day, 12, 0, 0);
    // отбрасываем «32.13.2026»: Date нормализует, проверяем обратимость
    if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) return null;
    return dt;
  }

  function parseAmountToken(token) {
    const m = AMOUNT_RE.exec(token);
    if (!m) return [null, null];
    const value = parseFloat(m.groups.num.replace(",", "."));
    if (!isFinite(value)) return [null, null];
    let glued = ((m.groups.sym1 || "") + (m.groups.sym2 || "")).trim();
    let currency = null;
    if (glued) {
      currency = matchCurrency(glued);
      if (currency === null) return [null, null]; // «50кг» — не сумма
    }
    return [value, currency];
  }

  class ParseError extends Error {}

  function parseMessage(text, opts) {
    opts = opts || {};
    const now = opts.now || new Date();
    const defaultCurrency = opts.defaultCurrency || DEFAULT_CURRENCY;
    const raw = String(text || "").trim();
    let tokens = raw.split(/\s+/).filter(Boolean);
    if (!tokens.length) throw new ParseError("Пустое сообщение");

    let createdAt = now, backdated = false;
    const dt = parseDateToken(tokens[0]);
    if (dt) { createdAt = dt; backdated = true; tokens = tokens.slice(1); }

    let amount = null, currency = null, amountIdx = null;
    for (let i = 0; i < tokens.length; i++) {
      const [v, c] = parseAmountToken(tokens[i]);
      if (v !== null) { amount = v; currency = c; amountIdx = i; break; }
    }
    if (amount === null) throw new ParseError("Не нашёл сумму. Формат: «50 Еда обед».");

    let rest = tokens.slice(0, amountIdx).concat(tokens.slice(amountIdx + 1));

    if (currency === null) {
      const kept = [];
      for (const tok of rest) {
        const c = matchCurrency(tok);
        if (c && currency === null) currency = c;
        else kept.push(tok);
      }
      rest = kept;
    }
    currency = currency || defaultCurrency;

    let kind = "expense", category = DEFAULT_CATEGORY, noteTokens = rest;
    if (rest.length) {
      const first = rest[0];
      const merchantCat = matchMerchant(rest); // «11 Жабка» → Продукты, текст в заметку
      if (matchIncome(first)) { kind = "income"; category = KIND_LABELS.income; noteTokens = rest.slice(1); }
      else if (matchSavings(first)) { kind = "savings"; category = KIND_LABELS.savings; noteTokens = rest.slice(1); }
      else if (merchantCat) { category = merchantCat; noteTokens = rest; }
      else {
        const matched = matchCategory(first);
        if (matched) { category = matched; noteTokens = rest.slice(1); }
        else {
          // последняя попытка — нечёткое имя магазина («биедронка»)
          const fuzzy = matchMerchantFuzzy(first);
          if (fuzzy) { category = fuzzy; noteTokens = rest; }
          else { category = DEFAULT_CATEGORY; noteTokens = rest; }
        }
      }
    }

    return {
      amount: Math.round(amount * 100) / 100,
      currency, category,
      note: noteTokens.join(" ").trim(),
      kind,
      created_at: localISO(createdAt),
      raw_text: raw,
      place: "—",
      backdated,
    };
  }

  // --- периоды (periods.py) ---
  const PERIOD_LABELS = { today: "Сегодня", week: "Неделя", month: "Месяц", year: "Год", all: "Всё время" };

  function dayStart(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function weekStart(d) { const s = dayStart(d); const wd = (s.getDay() + 6) % 7; s.setDate(s.getDate() - wd); return s; }
  function monthStart(d) { const x = new Date(d); x.setDate(1); x.setHours(0, 0, 0, 0); return x; }
  function yearStart(d) { const x = new Date(d); x.setMonth(0, 1); x.setHours(0, 0, 0, 0); return x; }

  // Сдвиг точки отсчёта на `offset` периодов назад/вперёд (для навигации по
  // месяцам/неделям): offset=-1 — предыдущий период, +1 — следующий.
  function shiftNow(name, offset, now) {
    now = now || new Date();
    if (!offset) return now;
    const d = new Date(now);
    name = (name || "month").toLowerCase();
    if (["today", "day", "сутки"].includes(name)) d.setDate(d.getDate() + offset);
    else if (["week", "неделя"].includes(name)) d.setDate(d.getDate() + 7 * offset);
    else if (["month", "месяц"].includes(name)) d.setMonth(d.getMonth() + offset);
    else if (["year", "год"].includes(name)) d.setFullYear(d.getFullYear() + offset);
    return d;
  }

  function periodRange(name, now, offset) {
    now = shiftNow(name, offset || 0, now || new Date());
    name = (name || "month").toLowerCase();
    if (["today", "day", "сутки"].includes(name)) {
      const s = dayStart(now), u = new Date(s); u.setDate(u.getDate() + 1);
      return { since: localISO(s), until: localISO(u), label: PERIOD_LABELS.today };
    }
    if (["week", "неделя"].includes(name)) {
      const s = weekStart(now), u = new Date(s); u.setDate(u.getDate() + 7);
      return { since: localISO(s), until: localISO(u), label: PERIOD_LABELS.week };
    }
    if (["month", "месяц"].includes(name)) {
      const s = monthStart(now), u = new Date(s); u.setMonth(u.getMonth() + 1);
      return { since: localISO(s), until: localISO(u), label: PERIOD_LABELS.month };
    }
    if (["year", "год"].includes(name)) {
      const s = yearStart(now), u = new Date(s); u.setFullYear(u.getFullYear() + 1);
      return { since: localISO(s), until: localISO(u), label: PERIOD_LABELS.year };
    }
    return { since: null, until: null, label: PERIOD_LABELS.all };
  }

  // --- магазины → категории ---
  // Большой словарь польских сетей. Каждый магазин: c — категория, n — как
  // показать в заметке, a — псевдонимы (PL/EN/RU/UA + транслитерации), по которым
  // его узнаём и в наборе вручную («11 Жабка»), и в описании выписки.
  const MERCHANTS = [
    // Продукты
    { c: "Продукты", n: "Żabka", a: ["zabka", "żabka", "жабка", "жабкa", "zappka"] },
    { c: "Продукты", n: "Biedronka", a: ["biedronka", "бедронка", "бєдронка", "бидронка", "биедронка", "бєдронка"] },
    { c: "Продукты", n: "Lidl", a: ["lidl", "лидл", "лідл"] },
    { c: "Продукты", n: "Auchan", a: ["auchan", "ашан"] },
    { c: "Продукты", n: "Carrefour", a: ["carrefour", "карфур", "карефур", "карфвур"] },
    { c: "Продукты", n: "Kaufland", a: ["kaufland", "кауфланд"] },
    { c: "Продукты", n: "Dino", a: ["dino", "дино"] },
    { c: "Продукты", n: "Stokrotka", a: ["stokrotka", "стокротка"] },
    { c: "Продукты", n: "Aldi", a: ["aldi", "алди", "алді"] },
    { c: "Продукты", n: "Netto", a: ["netto", "нетто"] },
    { c: "Продукты", n: "Lewiatan", a: ["lewiatan", "левиатан"] },
    { c: "Продукты", n: "POLOmarket", a: ["polomarket", "поломаркет"] },
    { c: "Продукты", n: "Społem", a: ["spolem", "społem", "сполем"] },
    { c: "Продукты", n: "Delikatesy Centrum", a: ["delikatesy", "delikatesy centrum", "деликатесы"] },
    { c: "Продукты", n: "Supersam", a: ["supersam", "суперсам"] },
    { c: "Продукты", n: "Groszek", a: ["groszek", "грошек"] },
    { c: "Продукты", n: "Chata Polska", a: ["chata polska", "хата польска"] },
    { c: "Продукты", n: "Topaz", a: ["topaz", "топаз"] },
    { c: "Продукты", n: "Mila", a: ["mila market"] },
    { c: "Продукты", n: "E.Leclerc", a: ["leclerc", "леклерк"] },
    { c: "Продукты", n: "Intermarché", a: ["intermarche", "интермарше"] },
    { c: "Продукты", n: "Frisco", a: ["frisco", "фриско"] },
    { c: "Продукты", n: "Makro", a: ["makro cash", "makro pl"] },
    { c: "Продукты", n: "Selgros", a: ["selgros", "селгрос"] },
    { c: "Продукты", n: "Małpka Express", a: ["malpka", "małpka", "малпка", "мавпка"] },
    { c: "Продукты", n: "Piotr i Paweł", a: ["piotr i pawel", "piotr i paweł"] },
    // Доставка еды (раньше Транспорта, поэтому ловится первой)
    { c: "Доставка", n: "Glovo", a: ["glovo", "глово"] },
    { c: "Доставка", n: "Wolt", a: ["wolt", "волт", "вольт"] },
    { c: "Доставка", n: "Pyszne.pl", a: ["pyszne", "пышне"] },
    { c: "Доставка", n: "Bolt Food", a: ["bolt food", "болт фуд", "boltfood"] },
    { c: "Доставка", n: "Uber Eats", a: ["uber eats", "ubereats", "убер итс"] },
    { c: "Доставка", n: "Lieferando", a: ["lieferando"] },
    { c: "Доставка", n: "Pizza Portal", a: ["pizzaportal", "pizza portal"] },
    // Уход (дрогери, косметика)
    { c: "Уход", n: "Rossmann", a: ["rossmann", "rossman", "россман", "россманн", "росман", "росманн"] },
    { c: "Уход", n: "Hebe", a: ["hebe", "хебе"] },
    { c: "Уход", n: "Super-Pharm", a: ["super-pharm", "super pharm", "superpharm", "суперфарм"] },
    { c: "Уход", n: "Douglas", a: ["douglas", "дуглас"] },
    { c: "Уход", n: "Sephora", a: ["sephora", "сефора"] },
    { c: "Уход", n: "Drogeria Natura", a: ["drogeria natura", "дрогерия натура"] },
    { c: "Уход", n: "Ziko Dermo", a: ["ziko dermo"] },
    { c: "Уход", n: "Notino", a: ["notino", "нотино"] },
    { c: "Уход", n: "Inglot", a: ["inglot", "инглот"] },
    { c: "Уход", n: "Yves Rocher", a: ["yves rocher", "ив роше"] },
    { c: "Уход", n: "Oriflame", a: ["oriflame", "орифлейм"] },
    { c: "Уход", n: "Avon", a: ["avon", "эйвон", "ейвон"] },
    // Здоровье (аптеки, клиники)
    { c: "Здоровье", n: "DOZ Apteka", a: ["doz apteka", "doz.pl", "apteka doz"] },
    { c: "Здоровье", n: "Apteka Gemini", a: ["gemini apteka", "apteka gemini", "gemini.pl"] },
    { c: "Здоровье", n: "Dr Max", a: ["dr max", "dr.max", "доктор макс"] },
    { c: "Здоровье", n: "Ziko Apteka", a: ["ziko apteka", "apteka ziko"] },
    { c: "Здоровье", n: "Cefarm", a: ["cefarm"] },
    { c: "Здоровье", n: "Medicover", a: ["medicover", "медиковер"] },
    { c: "Здоровье", n: "LUX MED", a: ["luxmed", "lux med", "люксмед"] },
    { c: "Здоровье", n: "Enel-Med", a: ["enel-med", "enel med"] },
    { c: "Здоровье", n: "Apteka", a: ["apteka", "аптека"] },
    // Транспорт и топливо
    { c: "Транспорт", n: "Orlen", a: ["orlen", "орлен"] },
    { c: "Транспорт", n: "Shell", a: ["shell", "шелл"] },
    { c: "Транспорт", n: "BP", a: ["bp-", "bp stacja", "stacja bp", "бп заправка"] },
    { c: "Транспорт", n: "Circle K", a: ["circle k", "circlek", "серкл к"] },
    { c: "Транспорт", n: "Lotos", a: ["lotos", "лотос"] },
    { c: "Транспорт", n: "Moya", a: ["moya", "моя стацja"] },
    { c: "Транспорт", n: "Amic", a: ["amic", "амик"] },
    { c: "Транспорт", n: "Bolt", a: ["bolt", "болт"] },
    { c: "Транспорт", n: "Uber", a: ["uber", "убер"] },
    { c: "Транспорт", n: "FREE NOW", a: ["free now", "freenow", "фринау"] },
    { c: "Транспорт", n: "iTaxi", a: ["itaxi"] },
    { c: "Транспорт", n: "MPK", a: ["mpk", "мпк"] },
    { c: "Транспорт", n: "ZTM", a: ["ztm", "зтм"] },
    { c: "Транспорт", n: "PKP", a: ["pkp", "пкп", "intercity", "koleje"] },
    { c: "Транспорт", n: "FlixBus", a: ["flixbus", "фликсбус"] },
    { c: "Транспорт", n: "Lime", a: ["lime", "лайм"] },
    { c: "Транспорт", n: "Tier", a: ["tier", "тиер"] },
    { c: "Транспорт", n: "Dott", a: ["dott"] },
    { c: "Транспорт", n: "Mevo", a: ["mevo", "мево"] },
    { c: "Транспорт", n: "Veturilo", a: ["veturilo"] },
    { c: "Транспорт", n: "Traficar", a: ["traficar"] },
    { c: "Транспорт", n: "Panek", a: ["panek"] },
    { c: "Транспорт", n: "jakdojade", a: ["jakdojade", "koleo", "skycash"] },
    { c: "Транспорт", n: "Парковка", a: ["parking", "паркинг", "паркомат"] },
    { c: "Транспорт", n: "Топливо", a: ["paliwo", "топливо", "бензин"] },
    // Еда (рестораны, кафе)
    { c: "Еда", n: "McDonald's", a: ["mcdonald", "макдональдс", "макдоналдс", "мкдоналдс", "мак"] },
    { c: "Еда", n: "KFC", a: ["kfc", "кфс"] },
    { c: "Еда", n: "Burger King", a: ["burger king", "бургер кинг"] },
    { c: "Еда", n: "Starbucks", a: ["starbucks", "старбакс"] },
    { c: "Еда", n: "Subway", a: ["subway", "сабвей"] },
    { c: "Еда", n: "Pizza Hut", a: ["pizza hut", "пицца хат", "пицца хат"] },
    { c: "Еда", n: "Telepizza", a: ["telepizza", "телепицца"] },
    { c: "Еда", n: "Da Grasso", a: ["da grasso"] },
    { c: "Еда", n: "Sphinx", a: ["sphinx", "сфинкс"] },
    { c: "Еда", n: "North Fish", a: ["north fish", "норт фиш"] },
    { c: "Еда", n: "Costa Coffee", a: ["costa coffee", "коста кофе"] },
    { c: "Еда", n: "Green Caffè Nero", a: ["green caffe", "green caffè"] },
    { c: "Еда", n: "Pasibus", a: ["pasibus"] },
    { c: "Еда", n: "Bobby Burger", a: ["bobby burger"] },
    { c: "Еда", n: "Kebab", a: ["kebab", "кебаб"] },
    { c: "Еда", n: "Sushi", a: ["sushi", "суши"] },
    // Развлечения
    { c: "Развлечения", n: "Cinema City", a: ["cinema city", "синема сити"] },
    { c: "Развлечения", n: "Multikino", a: ["multikino", "мультикино"] },
    { c: "Развлечения", n: "Helios", a: ["helios kino", "helios cinema", "хелиос"] },
    { c: "Развлечения", n: "Empik", a: ["empik", "эмпик"] },
    { c: "Развлечения", n: "Steam", a: ["steam", "steam games", "steampowered"] },
    { c: "Развлечения", n: "PlayStation", a: ["playstation", "плейстейшн", "psn"] },
    { c: "Развлечения", n: "Xbox", a: ["xbox", "иксбокс"] },
    { c: "Развлечения", n: "Nintendo", a: ["nintendo"] },
    { c: "Развлечения", n: "Ticketmaster", a: ["ticketmaster"] },
    { c: "Развлечения", n: "Going", a: ["going.app", "going pl"] },
    { c: "Развлечения", n: "eBilet", a: ["ebilet"] },
    { c: "Развлечения", n: "Zdrofit", a: ["zdrofit", "здрофит"] },
    { c: "Развлечения", n: "McFit", a: ["mcfit"] },
    { c: "Развлечения", n: "CityFit", a: ["cityfit", "сити фит"] },
    { c: "Развлечения", n: "Multisport", a: ["multisport", "benefit systems"] },
    // Одежда и обувь
    { c: "Одежда", n: "Zara", a: ["zara"] },   // без кириллического «зара» — оно ловит «зарахування» (зарплата)
    { c: "Одежда", n: "H&M", a: ["h&m", "hm.com", "эйчэндэм", "хм"] },
    { c: "Одежда", n: "Reserved", a: ["reserved", "резервд"] },
    { c: "Одежда", n: "CCC", a: ["ccc", "обувь ссс"] },
    { c: "Одежда", n: "Deichmann", a: ["deichmann", "дайхманн"] },
    { c: "Одежда", n: "Sinsay", a: ["sinsay", "синсей"] },
    { c: "Одежда", n: "Cropp", a: ["cropp", "кропп"] },
    { c: "Одежда", n: "House", a: ["house brand", "хаус одежда"] },
    { c: "Одежда", n: "Mohito", a: ["mohito", "мохито одежда"] },
    { c: "Одежда", n: "Bershka", a: ["bershka", "бершка"] },
    { c: "Одежда", n: "Pull&Bear", a: ["pull&bear", "pull and bear", "пулл бир"] },
    { c: "Одежда", n: "Zalando", a: ["zalando", "заландо"] },
    { c: "Одежда", n: "Nike", a: ["nike", "найк"] },
    { c: "Одежда", n: "Adidas", a: ["adidas", "адидас"] },
    { c: "Одежда", n: "Decathlon", a: ["decathlon", "декатлон"] },
    { c: "Одежда", n: "4F", a: ["4f"] },
    { c: "Одежда", n: "New Balance", a: ["new balance", "нью баланс"] },
    { c: "Одежда", n: "Answear", a: ["answear", "ансвер"] },
    { c: "Одежда", n: "eobuwie", a: ["eobuwie", "е обувь"] },
    { c: "Одежда", n: "Modivo", a: ["modivo", "модиво"] },
    { c: "Одежда", n: "TK Maxx", a: ["tk maxx", "tkmaxx"] },
    { c: "Одежда", n: "HalfPrice", a: ["halfprice", "half price"] },
    { c: "Одежда", n: "Kazar", a: ["kazar", "казар"] },
    { c: "Одежда", n: "Vinted", a: ["vinted", "винтед"] },
    { c: "Одежда", n: "Shein", a: ["shein", "шейн"] },
    { c: "Одежда", n: "Zalando Lounge", a: ["zalando lounge"] },
    // Дом, ремонт, электроника
    { c: "Дом", n: "IKEA", a: ["ikea", "икеа", "икея"] },
    { c: "Дом", n: "Leroy Merlin", a: ["leroy merlin", "леруа мерлен"] },
    { c: "Дом", n: "Castorama", a: ["castorama", "касторама"] },
    { c: "Дом", n: "OBI", a: ["obi market", "obi pl"] },
    { c: "Дом", n: "Jysk", a: ["jysk", "йиск"] },
    { c: "Дом", n: "Action", a: ["action pl", "action sklep"] },
    { c: "Дом", n: "Pepco", a: ["pepco", "пепко"] },
    { c: "Дом", n: "TEDi", a: ["tedi"] },
    { c: "Дом", n: "Homla", a: ["homla"] },
    { c: "Дом", n: "Agata Meble", a: ["agata meble", "агата мебель"] },
    { c: "Дом", n: "Komfort", a: ["komfort podlogi"] },
    { c: "Дом", n: "Black Red White", a: ["black red white", "brw meble"] },
    { c: "Дом", n: "Bricomarché", a: ["bricomarche", "брикомарше"] },
    { c: "Дом", n: "Mrówka", a: ["mrowka", "mrówka", "psb mrowka"] },
    { c: "Дом", n: "Jula", a: ["jula sklep"] },
    { c: "Дом", n: "Dealz", a: ["dealz"] },
    { c: "Дом", n: "RTV Euro AGD", a: ["euro agd", "rtv euro", "ртв евро"] },
    { c: "Дом", n: "Media Expert", a: ["media expert", "медиа эксперт"] },
    { c: "Дом", n: "MediaMarkt", a: ["mediamarkt", "media markt", "медиамаркт"] },
    { c: "Дом", n: "x-kom", a: ["x-kom", "xkom"] },
    { c: "Дом", n: "Morele", a: ["morele.net", "мореле"] },
    { c: "Дом", n: "Komputronik", a: ["komputronik", "компьютроник"] },
    { c: "Дом", n: "Neonet", a: ["neonet"] },
    // Подписки и связь
    { c: "Подписки", n: "Netflix", a: ["netflix", "нетфликс"] },
    { c: "Подписки", n: "Spotify", a: ["spotify", "спотифай"] },
    { c: "Подписки", n: "YouTube Premium", a: ["youtube", "ютуб"] },
    { c: "Подписки", n: "HBO Max", a: ["hbo max", "hbomax", "max.com"] },
    { c: "Подписки", n: "Disney+", a: ["disney plus", "disney+", "дисней"] },
    { c: "Подписки", n: "Apple", a: ["apple.com", "itunes", "apple com bill"] },
    { c: "Подписки", n: "Google", a: ["google play", "play.google", "google one", "google storage"] },
    { c: "Подписки", n: "iCloud", a: ["icloud", "айклауд"] },
    { c: "Подписки", n: "Amazon Prime", a: ["amazon prime", "prime video"] },
    { c: "Подписки", n: "Microsoft 365", a: ["microsoft", "office 365", "microsoft 365"] },
    { c: "Подписки", n: "OpenAI", a: ["openai", "chatgpt"] },
    { c: "Подписки", n: "Telegram", a: ["telegram premium", "telegram"] },
    { c: "Подписки", n: "Patreon", a: ["patreon"] },
    { c: "Подписки", n: "Adobe", a: ["adobe"] },
    { c: "Подписки", n: "Notion", a: ["notion labs", "notion.so"] },
    { c: "Подписки", n: "Tidal", a: ["tidal music"] },
    { c: "Подписки", n: "Audioteka", a: ["audioteka"] },
    { c: "Подписки", n: "Legimi", a: ["legimi"] },
    { c: "Подписки", n: "Storytel", a: ["storytel"] },
    { c: "Подписки", n: "Empik Go", a: ["empik go"] },
    { c: "Подписки", n: "Canal+", a: ["canal plus", "canal+"] },
    { c: "Подписки", n: "Player.pl", a: ["player.pl"] },
    { c: "Подписки", n: "Orange", a: ["orange polska", "orange pl"] },
    { c: "Подписки", n: "Play", a: ["play sp", "p4 play", "play mobile"] },
    { c: "Подписки", n: "Plus", a: ["plus gsm", "plus.pl"] },
    { c: "Подписки", n: "T-Mobile", a: ["t-mobile", "tmobile", "тимобайл"] },
    { c: "Подписки", n: "nju mobile", a: ["nju mobile", "njumobile"] },
    { c: "Подписки", n: "Netia", a: ["netia"] },
    { c: "Подписки", n: "Vectra", a: ["vectra"] },
    // Образование
    { c: "Образование", n: "Университет", a: ["uniwersytet", "university", "politechnika",
      "akademia", "uczelnia", "szkoła", "szkola główna", "wydział"] },
    { c: "Образование", n: "Udemy", a: ["udemy"] },
    { c: "Образование", n: "Coursera", a: ["coursera"] },
    // Кафе/рестораны — общие слова + точки из выписки (распознаются и в Adres)
    { c: "Еда", n: "Пиццерия", a: ["pizzeria", "pizza", "pizzatopia", "la primera"] },
    { c: "Еда", n: "Пекарня", a: ["piekarnia", "bakery", "cukiernia", "luca bakery"] },
    { c: "Еда", n: "Кофейня", a: ["kawiarnia", "coffee", "so coffee"] },
    { c: "Еда", n: "Ресторан", a: ["restauracja", "restaurant", "bistro", "osteria", "trattoria"] },
    { c: "Еда", n: "Бургерная", a: ["burger", "pasibus"] },
    { c: "Еда", n: "Бабл-ти", a: ["bubble tea", "big boba", "boba"] },
    { c: "Еда", n: "Sushi", a: ["osama sushi"] },
    { c: "Еда", n: "Kebab", a: ["aladin", "spicy kebab"] },
    // Бары и клубы → Развлечения
    { c: "Развлечения", n: "Бар/клуб", a: ["cocktail bar", "koktajl", "klub", "nightclub", "dyskoteka"] },
    { c: "Развлечения", n: "Pub", a: ["pub ", "sasiedztwo", "sąsiedztwo"] },
    { c: "Развлечения", n: "Punkt Widzenia", a: ["punkt widzenia"] },
    { c: "Развлечения", n: "Euphony", a: ["euphony"] },
    { c: "Развлечения", n: "Energy 2000", a: ["energy 2000", "wejscie energy"] },
    { c: "Развлечения", n: "Chicas and Gorillas", a: ["chicas and gorillas", "chicas"] },
    { c: "Развлечения", n: "Hola Club", a: ["hola club"] },
    { c: "Развлечения", n: "Bavovna", a: ["bavovna"] },
    { c: "Развлечения", n: "Hype Park", a: ["hype park", "hpk hype"] },
    { c: "Развлечения", n: "Park trampolin", a: ["jumpcity", "jumpworld", "park trampolin", "trampolin"] },
    { c: "Развлечения", n: "Ticketshop", a: ["ticketshop"] },
    // Алкомаркеты → Продукты
    { c: "Продукты", n: "Sklep monopolowy", a: ["monopolowy", "duzy ben", "duży ben", "alkohole 24"] },
    { c: "Продукты", n: "Pogoń Market", a: ["pogon market", "pogoń market"] },
    // Электроника/гейминг → Дом
    { c: "Дом", n: "HATOR", a: ["hator"] },
    { c: "Дом", n: "Action", a: ["action"] },
    // Одежда — LPP это владелец House/Reserved/Cropp/Sinsay/Mohito
    { c: "Одежда", n: "LPP", a: ["lpp"] },
    // Аренда
    { c: "Аренда", n: "Аренда", a: ["czynsz", "najem", "wynajem", "rental", "аренда", "квартплата"] },

    // --- Украина (для выписок Monobank / Приват24) ---
    // Продукты
    { c: "Продукты", n: "АТБ", a: ["атб", "atb market", "atb-market"] },
    { c: "Продукты", n: "Сільпо", a: ["сільпо", "сiльпо", "silpo"] },
    { c: "Продукты", n: "Фора", a: ["фора", "fora", "fora market"] },
    { c: "Продукты", n: "Novus", a: ["novus", "новус"] },
    { c: "Продукты", n: "Varus", a: ["varus", "варус"] },
    { c: "Продукты", n: "Метро", a: ["metro ua", "метро кеш"] },
    { c: "Продукты", n: "Копійка", a: ["копійка", "копейка", "kopiyka"] },
    { c: "Продукты", n: "Велика Кишеня", a: ["велика кишеня", "кишеня"] },
    { c: "Продукты", n: "Таврія В", a: ["таврія", "tavria"] },
    { c: "Продукты", n: "Рукавичка", a: ["рукавичка", "rukavychka"] },
    { c: "Продукты", n: "Восторг", a: ["восторг", "vostorg"] },
    { c: "Продукты", n: "Клас Маркет", a: ["клас маркет", "class market"] },
    // Доставка
    { c: "Доставка", n: "Raketa", a: ["raketa", "ракета доставка"] },
    { c: "Доставка", n: "Zakaz.ua", a: ["zakaz.ua", "zakaz ua"] },
    // Транспорт и топливо
    { c: "Транспорт", n: "WOG", a: ["wog", "вог"] },
    { c: "Транспорт", n: "OKKO", a: ["okko", "окко"] },
    { c: "Транспорт", n: "UPG", a: ["upg"] },
    { c: "Транспорт", n: "KLO", a: ["klo", "кло"] },
    { c: "Транспорт", n: "БРСМ", a: ["brsm", "брсм"] },
    { c: "Транспорт", n: "Uklon", a: ["uklon", "уклон"] },
    { c: "Транспорт", n: "Укрзалізниця", a: ["укрзалізниця", "uz.gov", "укрзализныця"] },
    { c: "Транспорт", n: "Метро Київ", a: ["київське метро", "kyivskyi metro", "київ цифровий", "kyiv digital"] },
    // Здоровье (аптеки)
    { c: "Здоровье", n: "Аптека Доброго Дня", a: ["аптека доброго дня", "добра аптека", "add.ua"] },
    { c: "Здоровье", n: "Подорожник", a: ["подорожник", "podorozhnyk"] },
    { c: "Здоровье", n: "АНЦ", a: ["анц аптека", "анц"] },
    // Уход (дрогери)
    { c: "Уход", n: "Watsons", a: ["watsons", "вотсонс", "уотсонс"] },
    { c: "Уход", n: "EVA", a: ["eva", "eva.ua", "ева магазин", "eva drogeria"] },
    { c: "Уход", n: "Prostor", a: ["prostor", "простор магазин"] },
    // Дом, электроника
    { c: "Дом", n: "Rozetka", a: ["rozetka", "розетка"] },
    { c: "Дом", n: "Comfy", a: ["comfy", "комфі"] },
    { c: "Дом", n: "Foxtrot", a: ["foxtrot", "фокстрот"] },
    { c: "Дом", n: "Allo", a: ["allo.ua", "алло магазин"] },
    { c: "Дом", n: "Епіцентр", a: ["епіцентр", "epicentr", "епицентр"] },
    { c: "Дом", n: "Цитрус", a: ["citrus.club", "цитрус"] },
    { c: "Дом", n: "MOYO", a: ["moyo", "мойо"] },
    // Подписки и связь
    { c: "Подписки", n: "Київстар", a: ["київстар", "kyivstar", "киевстар"] },
    { c: "Подписки", n: "Vodafone", a: ["vodafone", "водафон"] },
    { c: "Подписки", n: "lifecell", a: ["lifecell", "лайфселл", "лайфсел"] },
    { c: "Подписки", n: "Megogo", a: ["megogo", "мегого"] },
    { c: "Подписки", n: "Sweet.tv", a: ["sweet.tv", "sweettv"] },
    // Развлечения
    { c: "Развлечения", n: "Планета Кіно", a: ["планета кіно", "planeta kino", "планета кино"] },
    { c: "Развлечения", n: "Multiplex", a: ["multiplex", "мультиплекс"] },
    // Еда (фастфуд/кафе)
    { c: "Еда", n: "Пузата Хата", a: ["пузата хата", "puzata hata"] },
    { c: "Еда", n: "Львівські круасани", a: ["львівські круасани", "lviv croissants", "круасани"] },
    { c: "Еда", n: "McFoxy", a: ["mcfoxy", "макфоксі"] },
    { c: "Еда", n: "Domino's", a: ["dominos", "домінос", "доминос"] },
    { c: "Еда", n: "Celentano", a: ["celentano", "челентано"] },
    { c: "Еда", n: "Аромакава", a: ["аромакава", "aromakava"] },
    // Прочее (посылки/почта)
    { c: "Прочее", n: "Нова Пошта", a: ["нова пошта", "nova poshta", "новая почта", "novaposhta", "novapay"] },
    { c: "Прочее", n: "Укрпошта", a: ["укрпошта", "ukrposhta"] },
  ];

  // Нормализация под поиск: латиница/кириллица/цифры, всё остальное — пробел.
  function normDesc(s) {
    return String(s == null ? "" : s).toLowerCase().replace(/ё/g, "е")
      .replace(/[^a-z0-9а-я]+/g, " ").trim();
  }

  const ALIAS_EXACT = {};        // точный псевдоним → категория (для набора вручную)
  const ALIAS_SUBSTR = [];       // [псевдоним, категория, имя] для поиска в описании
  for (const m of MERCHANTS) {
    for (const raw of [m.n].concat(m.a)) {
      const a = normDesc(raw);
      if (!a) continue;
      if (!(a in ALIAS_EXACT)) ALIAS_EXACT[a] = m.c;
      ALIAS_SUBSTR.push([a, m.c, m.n]);
    }
  }
  // длинные псевдонимы проверяем первыми («bolt food» раньше «bolt»)
  ALIAS_SUBSTR.sort((x, y) => y[0].length - x[0].length);

  // Узнать магазин в описании выписки. Короткие коды (bp, 4f, kfc) — только как
  // отдельное слово, чтобы не ловить их внутри других слов.
  function merchantOf(description) {
    const d = " " + normDesc(description) + " ";
    for (const [a, c, n] of ALIAS_SUBSTR) {
      if (a.length <= 3) { if (d.includes(" " + a + " ")) return { category: c, name: n }; }
      else if (d.includes(a)) return { category: c, name: n };
    }
    return null;
  }

  // Узнать магазин по введённым словам (1–2 слова после суммы): «11 Жабка».
  function matchMerchant(tokens) {
    if (!tokens || !tokens.length) return null;
    if (tokens.length >= 2) {
      const two = normDesc(tokens[0] + " " + tokens[1]);
      if (ALIAS_EXACT[two]) return ALIAS_EXACT[two];
    }
    const one = normDesc(tokens[0]);
    return ALIAS_EXACT[one] || null;
  }

  // Однословные псевдонимы длиной от 6 — для нечёткого поиска (опечатки в названии
  // магазина: «биедронка»≈«бедронка», «макдоналдс»≈«макдональдс»).
  const FUZZY = [];
  for (const a of Object.keys(ALIAS_EXACT)) {
    if (a.length >= 6 && !a.includes(" ")) FUZZY.push([a, ALIAS_EXACT[a]]);
  }

  function matchMerchantFuzzy(token) {
    const w = normDesc(token);
    if (w.length < 6 || w.includes(" ")) return null;
    const maxDist = w.length >= 9 ? 2 : 1;
    let best = null, bestDist = maxDist + 1;
    for (const [a, c] of FUZZY) {
      if (Math.abs(a.length - w.length) > maxDist) continue;
      const d = levenshtein(w, a);
      if (d < bestDist) { best = c; bestDist = d; if (d === 0) break; }
    }
    return bestDist <= maxDist ? best : null;
  }

  function categorize(description, overrides) {
    if (overrides) {
      const d = normDesc(description);
      for (const frag of Object.keys(overrides)) {
        if (frag && d.includes(normDesc(frag))) return overrides[frag];
      }
    }
    const m = merchantOf(description);
    return m ? m.category : "Прочее";
  }

  function guessMerchant(description) {
    let text = String(description || "").trim();
    for (const sep of ["  ", " K.", " NR", " WARSZAWA", " KRAKOW", " GDANSK", " WROCLAW"]) {
      const idx = text.toUpperCase().indexOf(sep);
      if (idx > 2) { text = text.slice(0, idx); break; }
    }
    const parts = text.split(/\s+/).filter((p) =>
      !(p.length >= 4 && /[a-zA-Zа-яА-Я]/.test(p[0]) && /\d/.test(p)));
    return (parts.join(" ") || text).trim().slice(0, 40);
  }

  // --- выписка CSV (statements.py) ---
  const DELIMS = [";", "\t", ","];
  const DATE_KEYS = ["data operacji", "data księgowania", "data ksiegowania", "data transakcji",
    "data waluty", "started date", "completed date", "transaction date", "booking date",
    "дата i час", "дата й час", "дата та час", "дата операції", "дата операцiї", "дата",
    "data", "date"];
  // «сума в валюті картки» (Monobank) первее — там сумма в валюте карты (грн),
  // а не в валюте операции; иначе покупку в грн можно принять за доллары
  const AMOUNT_KEYS = ["сума в валюті картки", "kwota operacji", "kwota w walucie", "kwota",
    "сума операції", "сума", "wartość", "wartosc", "amount"];
  const DEBIT_KEYS = ["obciążenia", "obciazenia", "wydatki", "debit"];
  const CREDIT_KEYS = ["uznania", "wpłaty", "wplaty", "wpływy", "wplywy", "credit"];
  const DESC_KEYS = ["opis operacji", "tytuł", "tytul", "nazwa odbiorcy", "odbiorca", "dane kontrahenta",
    "kontrahent", "szczegóły", "szczegoly", "opis", "nazwa",
    "деталі операції", "деталі", "опис операції", "опис", "призначення", "контрагент", "коментар",
    "description", "title", "details", "payee"];
  const CURRENCY_KEYS = ["валюта картки", "waluta", "currency", "валюта"];
  const TYPE_KEYS = ["typ transakcji", "typ operacji", "rodzaj", "typ", "тип операції", "тип", "type"];
  // колонки баланса/служебные — их НЕ включаем в описание (mcc, курс, кешбек,
  // комиссия, остаток, номер карты, дубли сумм/валют — это шум, а не магазин)
  const SALDO_KEYS = ["saldo", "balance", "stan konta", "fee", "prowizja", "state", "product",
    "nr rachunku", "numer rachunku", "rachunek", "nazwa banku", "kod", "category", "kategoria",
    "mcc", "курс", "кешбек", "кешбеку", "комісі", "залишок", "баланс", "карт", "rate",
    "сума", "kwota", "amount", "wartość", "wartosc", "валюта", "waluta", "currency"];
  // родная категория банка (Приват24 пишет свою «Категорію» в выписке)
  const BANK_CAT_KEYS = ["категорія", "категория", "kategoria"];
  const MCC_KEYS = ["mcc"];

  function decodeBytes(bytes) {
    for (const enc of ["utf-8", "windows-1250", "iso-8859-2"]) {
      try { return new TextDecoder(enc, { fatal: true }).decode(bytes); }
      catch (e) { /* пробуем следующую кодировку */ }
    }
    return new TextDecoder("utf-8").decode(bytes); // последний шанс, без fatal
  }

  function sniffDelimiter(text) {
    const line = (text.split(/\r?\n/).find((l) => l.trim()) || "");
    let best = DELIMS[0], bestCount = -1;
    for (const d of DELIMS) {
      const c = line.split(d).length - 1;
      if (c > bestCount) { best = d; bestCount = c; }
    }
    return best;
  }

  // Простой разбор CSV-строки с поддержкой кавычек.
  function parseCsv(text, delim) {
    const rows = [];
    let row = [], field = "", inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === delim) { row.push(field); field = ""; }
      else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (ch === "\r") { /* пропускаем */ }
      else field += ch;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim()));
  }

  function findCol(headers, keys) {
    const low = headers.map((h) => h.trim().toLowerCase());
    for (const key of keys) for (let i = 0; i < low.length; i++) if (low[i].includes(key)) return i;
    return null;
  }

  // Валюта прямо в шапке столбца суммы: «Сума в валюті картки (UAH)», «Kwota (PLN)».
  // Нужна для Monobank: там сумма — в валюте карты (грн), а столбец «Валюта» держит
  // валюту операции (напр. USD), и без подсказки покупка в грн уехала бы в доллары.
  function currencyFromHeader(h) {
    const s = String(h || "");
    const m = /\(([a-zа-яіїєґ$€₴]{3,5})\)/i.exec(s);
    if (m) { const c = matchCurrency(m[1]); if (c) return c; }
    for (const tok of s.toLowerCase().split(/[^a-zа-яіїєґ$€₴]+/)) {
      const c = matchCurrency(tok); if (c) return c;
    }
    return null;
  }

  function parseAmountCell(text) {
    if (text == null) return null;
    let s = String(text).replace(/ /g, "").replace(/ /g, "");
    s = s.replace(/[^\d,.\-+]/g, "");
    if (!s || s === "-" || s === "+") return null;
    if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(",", ".");
    const v = parseFloat(s);
    return isFinite(v) ? v : null;
  }

  function parseDateCell(text) {
    const raw = String(text || "").trim();
    const s = raw.slice(0, 10);
    let m;
    if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s))) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
    if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s))) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
    // серийная дата Excel (в .xlsx дата бывает числом: дней с 1899-12-30 с учётом
    // бага 1900). Диапазон ~1954..2119 — чтобы не спутать с суммой.
    if (/^\d+(\.\d+)?$/.test(raw)) {
      const serial = Math.floor(parseFloat(raw));
      if (serial >= 20000 && serial <= 80000) {
        const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
        return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
      }
    }
    return "";
  }

  function hash16(str) {
    // FNV-1a 32-бит, дважды с разными сидами → 16 hex. Стабилен для дедупа.
    function fnv(seed) {
      let h = seed >>> 0;
      for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
      return h >>> 0;
    }
    return (fnv(0x811c9dc5).toString(16).padStart(8, "0") + fnv(0x7f4a7c15).toString(16).padStart(8, "0"));
  }

  // Найти строку заголовка в разобранных строках (дата + сумма, ≥3 колонки).
  function findHeader(cand) {
    for (let i = 0; i < Math.min(25, cand.length); i++) {
      const low = cand[i].map((c) => c.trim().toLowerCase());
      const hasDate = DATE_KEYS.some((k) => low.some((c) => c.includes(k)));
      const hasAmt = AMOUNT_KEYS.concat(DEBIT_KEYS).some((k) => low.some((c) => c.includes(k)));
      if (hasDate && hasAmt && cand[i].length >= 3) return i;
    }
    return -1;
  }

  function parseStatement(text) {
    if (!text || !text.trim()) return [];
    // Пробуем каждый разделитель и берём тот, при котором находится заголовок.
    // Надёжнее угадывания по первой строке: у Monobank/Приват перед шапкой бывает
    // преамбула с реквизитами счёта, сбивавшая выбор разделителя.
    for (const delim of DELIMS) {
      const rows = parseCsv(text, delim);
      if (findHeader(rows) >= 0) return parseStatementRows(rows);
    }
    return [];
  }

  // Разобрать готовую таблицу строк (из CSV или XLSX) в список операций.
  function parseStatementRows(rows) {
    if (!rows || !rows.length) return [];
    const headerIdx = findHeader(rows);
    if (headerIdx < 0) return [];
    const headers = rows[headerIdx];

    // все колонки с датой — у PKO «Data operacji» бывает пустой (Blokada), тогда
    // берём «Data waluty»
    const dateIdxs = [];
    headers.forEach((h, i) => {
      const hl = String(h).trim().toLowerCase();
      if (DATE_KEYS.some((k) => hl.includes(k))) dateIdxs.push(i);
    });
    const amtI = findCol(headers, AMOUNT_KEYS);
    const debI = findCol(headers, DEBIT_KEYS);
    const credI = findCol(headers, CREDIT_KEYS);
    const curI = findCol(headers, CURRENCY_KEYS);
    const typeI = findCol(headers, TYPE_KEYS);
    const mccI = findCol(headers, MCC_KEYS);
    const bankCatI = findCol(headers, BANK_CAT_KEYS);
    const amtCurHint = (amtI !== null && amtI < headers.length) ? currencyFromHeader(headers[amtI]) : null;
    if (!dateIdxs.length) return [];

    // «служебные» колонки (даты/сумма/валюта/тип/баланс) — в описание не идут.
    // Описание собираем из ВСЕХ остальных колонок: у PKO магазин в хвостовых
    // столбцах, у ING/Revolut/mBank — в «Dane kontrahenta»/«Description» и т.п.
    const meta = new Set(dateIdxs);
    [amtI, debI, credI, curI, typeI, mccI, bankCatI].forEach((i) => { if (i !== null) meta.add(i); });
    headers.forEach((h, i) => {
      const hl = h.trim().toLowerCase();
      if (SALDO_KEYS.some((k) => hl.includes(k))) meta.add(i);
    });

    const out = [];
    const seenKeys = new Map();   // счётчик одинаковых операций, чтобы не схлопнуть дубли
    for (let r = headerIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      let date = "";
      for (const di of dateIdxs) { if (di < row.length) { date = parseDateCell(row[di]); if (date) break; } }
      if (!date) continue;

      let amount = (amtI !== null && amtI < row.length) ? parseAmountCell(row[amtI]) : null;
      if (amount === null && debI !== null && debI < row.length) {
        const d = parseAmountCell(row[debI]); if (d) amount = -Math.abs(d);
      }
      if (amount === null && credI !== null && credI < row.length) {
        const c = parseAmountCell(row[credI]); if (c) amount = Math.abs(c);
      }
      if (amount === null || amount === 0) continue;

      // описание = все не-служебные колонки (магазин/получатель/назначение)
      let desc = row.map((c, i) => (meta.has(i) ? "" : c))
        .filter((c) => c && c.trim()).join(" ").replace(/\s+/g, " ").trim();
      const type = (typeI !== null && typeI < row.length) ? row[typeI].trim() : "";
      let currency = amtCurHint;
      if (!currency && curI !== null && curI < row.length) {
        const raw = row[curI].trim();
        currency = matchCurrency(raw) || raw;   // неизвестный код (GBP, CZK…) оставляем как есть
      }
      currency = cleanCurrency(currency);        // но чистим до букв: мусор/HTML → PLN
      // дедуп по (дата|сумма|описание), но одинаковые операции в один день разводим
      // порядковым номером — иначе две одинаковые покупки схлопнулись бы в одну
      const mcc = (mccI !== null && mccI < row.length) ? String(row[mccI]).trim() : "";
      const bankCat = (bankCatI !== null && bankCatI < row.length) ? String(row[bankCatI]).trim() : "";
      const baseKey = `${date}|${amount}|${desc}`;
      const occ = seenKeys.get(baseKey) || 0;
      seenKeys.set(baseKey, occ + 1);
      const txId = hash16(occ ? `${baseKey}#${occ}` : baseKey);
      out.push({ id: txId, date, amount, currency, description: desc, type, mcc, bank_category: bankCat });
    }
    return out;
  }

  // --- XLSX (Приват24 и др. отдают выписку в .xlsx) ---
  // Мини-читалка ZIP + OOXML на чистом браузере: нужные части разжимаем через
  // DecompressionStream('deflate-raw'), таблицу разбираем через DOMParser, а
  // дальше — та же parseStatementRows, что и для CSV.
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

  async function inflateRaw(bytes) {
    const ds = new DecompressionStream("deflate-raw");
    const w = ds.writable.getWriter(); w.write(bytes); w.close();
    return new Uint8Array(await new Response(ds.readable).arrayBuffer());
  }

  // Разбор ZIP по центральному каталогу → ленивый доступ к содержимому по имени.
  function unzip(bytes) {
    let eocd = -1;
    for (let i = bytes.length - 22; i >= 0 && i >= bytes.length - 22 - 65536; i--) {
      if (u32(bytes, i) === 0x06054b50) { eocd = i; break; }   // End Of Central Directory
    }
    if (eocd < 0) throw new Error("bad zip");
    const cdCount = u16(bytes, eocd + 10);
    let off = u32(bytes, eocd + 16);
    const files = {};
    for (let n = 0; n < cdCount; n++) {
      if (u32(bytes, off) !== 0x02014b50) break;                // Central Directory header
      const method = u16(bytes, off + 10);
      const compSize = u32(bytes, off + 20);
      const nameLen = u16(bytes, off + 28);
      const extraLen = u16(bytes, off + 30);
      const commentLen = u16(bytes, off + 32);
      const localOff = u32(bytes, off + 42);
      const name = new TextDecoder().decode(bytes.subarray(off + 46, off + 46 + nameLen));
      const lNameLen = u16(bytes, localOff + 26);
      const lExtraLen = u16(bytes, localOff + 28);
      const dataStart = localOff + 30 + lNameLen + lExtraLen;
      files[name] = { method, comp: bytes.subarray(dataStart, dataStart + compSize) };
      off += 46 + nameLen + extraLen + commentLen;
    }
    return {
      has(name) { return name in files; },
      names() { return Object.keys(files); },
      async get(name) {
        const f = files[name]; if (!f) return null;
        if (f.method === 0) return f.comp;               // STORE
        if (f.method === 8) return inflateRaw(f.comp);   // DEFLATE
        throw new Error("zip method " + f.method);
      },
    };
  }

  function colNumOf(ref) {                 // «B12» → 1 (индекс колонки, 0-based)
    const m = /^([A-Z]+)/.exec(ref || "");
    if (!m) return -1;
    let n = 0; for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }

  async function parseXlsx(bytes) {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("Это устройство не умеет читать XLSX — выгрузи выписку в CSV");
    }
    const zip = unzip(bytes);
    const parser = new DOMParser();
    const decode = (u8) => new TextDecoder().decode(u8);

    // таблица общих строк (в XLSX текст обычно вынесен в sharedStrings)
    let shared = [];
    const ssU8 = await zip.get("xl/sharedStrings.xml");
    if (ssU8) {
      const doc = parser.parseFromString(decode(ssU8), "application/xml");
      shared = [...doc.getElementsByTagName("si")].map((si) =>
        [...si.getElementsByTagName("t")].map((t) => t.textContent).join(""));
    }

    // берём первый лист (sheet1, иначе любой worksheets/*.xml)
    let sheetPath = "xl/worksheets/sheet1.xml";
    if (!zip.has(sheetPath)) {
      sheetPath = zip.names().find((n) => /^xl\/worksheets\/.*\.xml$/.test(n));
      if (!sheetPath) return [];
    }
    const shU8 = await zip.get(sheetPath);
    if (!shU8) return [];
    const doc = parser.parseFromString(decode(shU8), "application/xml");

    const rows = [];
    for (const row of doc.getElementsByTagName("row")) {
      const arr = [];
      let ci = -1;
      for (const c of row.getElementsByTagName("c")) {
        const ref = c.getAttribute("r");
        ci = ref ? colNumOf(ref) : ci + 1;
        if (ci < 0) continue;
        const t = c.getAttribute("t");
        let val = "";
        if (t === "s") {                                   // индекс в sharedStrings
          const v = c.getElementsByTagName("v")[0];
          val = v ? (shared[+v.textContent] || "") : "";
        } else if (t === "inlineStr") {
          val = [...c.getElementsByTagName("t")].map((x) => x.textContent).join("");
        } else {                                            // число / серийная дата / str
          const v = c.getElementsByTagName("v")[0];
          val = v ? v.textContent : "";
        }
        arr[ci] = String(val);
      }
      for (let i = 0; i < arr.length; i++) if (arr[i] == null) arr[i] = "";  // дырки → пусто
      if (arr.some((x) => x && x.trim())) rows.push(arr);
    }
    return parseStatementRows(rows);
  }

  // Единая точка входа для импорта: сырые байты файла → операции. XLSX (ZIP,
  // сигнатура «PK\x03\x04») читаем как таблицу, иначе — как текстовый CSV.
  async function parseStatementFile(bytes) {
    if (bytes && bytes.length > 3 &&
        bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
      return parseXlsx(bytes);
    }
    return parseStatement(decodeBytes(bytes));
  }

  // Из «мусорного» описания выписки вытащить чистое имя места/получателя.
  function cleanName(s) {
    let n = String(s || "").split("*")[0]; // «UBER *ONE MEMBERSHIP» → «UBER »
    n = n.replace(/\b(sp\.?\s*z\.?\s*o\.?\s*o\.?|s\.\s*a\.|s\.\s*c\.)\b/gi, " ");
    n = n.replace(/\b[a-z]{0,3}\d{2,}[a-z0-9]*\b/gi, " "); // коды Z9119, 352357, 103
    n = n.replace(/\bk\.?\s*\d\b/gi, " ");                 // K.1
    n = n.replace(/[_/\\|]+/g, " ");
    n = n.replace(/\s+/g, " ").trim();
    return n;
  }

  // «Adres: <магазин>» — это место оплаты картой (категоризуем по нему).
  function adresOf(desc) {
    const m = /adres:\s*(.+?)(?:\s+miasto:|\s+kraj:|\s+operacja:|\s+numer\b|$)/i.exec(String(desc || ""));
    return m ? m[1] : "";
  }
  // «Nazwa odbiorcy: <кому>» — получатель перевода (только для заметки).
  function odbiorcaOf(desc) {
    const m = /nazwa odbiorcy:\s*(.+?)(?:\s+tytu|\s+rachunek|\s+numer\b|\s+adres\b|\s+lokal|$)/i.exec(String(desc || ""));
    return m ? m[1] : "";
  }
  // «Nazwa nadawcy: <от кого>» — отправитель (для заметки поступления/дохода).
  function nadawcaOf(desc) {
    const m = /nazwa nadawcy:\s*(.+?)(?:\s+tytu|\s+rachunek|\s+numer\b|\s+adres\b|\s+lokal|$)/i.exec(String(desc || ""));
    return m ? m[1] : "";
  }
  // Заметка для дохода из выписки: отправитель/название, иначе по типу.
  function statementIncomeNote(desc, type) {
    const nad = cleanName(nadawcaOf(desc));
    if (nad && !/^[\d\s.]+$/.test(nad)) return nad.slice(0, 48);
    const odb = cleanName(odbiorcaOf(desc));
    if (odb && !/^[\d\s.]+$/.test(odb)) return odb.slice(0, 48);
    // украинские банки: «від YEVA POLIAKOVA», «Від: Ім'я», «P24 *Name»
    const ua = cleanName(String(desc || "").replace(/^\s*(від|vid|od|from)\s*[: ]\s*/i, "")
      .replace(/^\s*p24\s*\*\s*/i, ""));
    if (ua && ua !== cleanName(desc) && !/^[\d\s.]+$/.test(ua)) return ua.slice(0, 48);
    const t = (type || "").toLowerCase();
    if (/wp[łl]ata/.test(t)) return "Внесение наличных";
    if (/kantor|wymiana|uznanie/.test(t)) return "Обмен валюты";
    if (/telefon/.test(t)) return "Перевод на телефон";
    if (/przelew/.test(t)) return "Перевод";
    const c = cleanName(desc);
    if (c && !/^[\d\s.]+$/.test(c)) return c.slice(0, 48);
    return "Поступление";
  }

  // Убрать платёжных посредников — они не магазины (иначе категория уезжает).
  function stmtNoise(s) {
    return String(s || "")
      .replace(/\b(pep|p24|sumup|zettle|izettle)\s*\*\s*/gi, " ")  // «PeP*Fuego» → «Fuego»
      .replace(/\b(google|apple|garmin|fitbit|android|samsung)\s*pay\b/gi, " ")
      .replace(/\b(blik|payu|pay u|przelewy24|p24|paypal|tpay|dotpay|revolut)\b/gi, " ");
  }
  // Признак перевода (а не покупки) — тогда категорию не угадываем.
  function isTransfer(desc, type) {
    return !!odbiorcaOf(desc) || /rachunek\s+(odbiorcy|nadawcy)/i.test(desc || "")
      || /przelew/i.test(type || "");
  }

  // Категория траты. У PKO магазин в «Adres:»; у Santander и др. — прямо в
  // описании, поэтому если адреса нет и это не перевод, ищем магазин по описанию.
  // Последняя попытка: узнать категорию по слову в описании («кафе», «ресторан»,
  // «аптека», «продукти») — помогает, когда магазина в словаре нет, но у банка
  // (например, у Приват24) есть колонка категории или понятное описание.
  function categoryWordOf(desc) {
    for (const tok of normDesc(desc).split(" ")) {
      if (tok.length < 3) continue;
      const c = CAT_IDX.exact[normalize(tok)];
      if (c) return c;
    }
    return null;
  }

  // Родные категории Приват24 («Категорія» в выписке) → наши. Ключи — normDesc.
  const UA_BANK_CATS = {
    "супермаркети та продукти": "Продукты",
    "ресторани кафе бари": "Еда",
    "кафе та ресторани": "Еда",
    "фастфуд": "Еда",
    "доставка їжі": "Доставка",
    "таксі": "Транспорт",
    "транспорт": "Транспорт",
    "азс": "Транспорт",
    "парковка": "Транспорт",
    "цифрові товари": "Подписки",
    "мобільний зв язок": "Подписки",
    "інтернет тб": "Подписки",
    "готелі": "Аренда",
    "оренда житла": "Аренда",
    "комунальні послуги": "Дом",
    "дім та ремонт": "Дом",
    "техніка": "Дом",
    "краса": "Уход",
    "краса та догляд": "Уход",
    "аптеки": "Здоровье",
    "медицина": "Здоровье",
    "спорт та здоров я": "Здоровье",
    "одяг та взуття": "Одежда",
    "книги та канцтовари": "Образование",
    "освіта": "Образование",
    "розваги": "Развлечения",
    "кіно": "Развлечения",
    "квіти": "Прочее",
    "подарунки": "Прочее",
    "перекази": "Прочее",
  };
  function bankCategoryOf(bankCat) {
    const b = normDesc(bankCat);
    if (!b) return null;
    if (UA_BANK_CATS[b]) return UA_BANK_CATS[b];
    for (const k of Object.keys(UA_BANK_CATS)) if (b.includes(k)) return UA_BANK_CATS[k];
    return null;
  }

  // MCC (код типа заведения из выписки Monobank) → категория. Надёжный fallback,
  // когда магазина нет в словаре: 5411 — супермаркет, 5814 — фастфуд и т.д.
  const MCC_CATS = [
    [[5411, 5422, 5441, 5451, 5462, 5499, 5297, 5298, 5300, 5921], "Продукты"],
    [[5811, 5812, 5813, 5814], "Еда"],
    [[4111, 4112, 4121, 4131, 4784, 4789, 5541, 5542, 7523], "Транспорт"],
    [[5912, 8011, 8021, 8043, 8049, 8062, 8071, 8099], "Здоровье"],
    [[5977, 7230, 7297, 7298], "Уход"],
    [[5611, 5621, 5631, 5641, 5651, 5661, 5691, 5699, 5931, 5948], "Одежда"],
    [[5200, 5211, 5231, 5251, 5712, 5713, 5714, 5719, 5722, 5732, 5734, 5045], "Дом"],
    [[5815, 5817, 5818, 4813, 4814, 4816, 4899], "Подписки"],
    [[5816, 5735, 5945, 7832, 7922, 7929, 7941, 7991, 7994, 7996, 7997, 7998, 7999], "Развлечения"],
    [[5942, 5943, 8211, 8220, 8241, 8244, 8249, 8299], "Образование"],
    [[7011], "Аренда"],
  ];
  function mccCategoryOf(mcc) {
    const n = parseInt(mcc, 10);
    if (!isFinite(n)) return null;
    for (const [codes, cat] of MCC_CATS) if (codes.includes(n)) return cat;
    return null;
  }

  // Категория траты, по убыванию доверия: магазин из словаря → родная категория
  // банка (Приват24) → MCC (Monobank) → слово-категория в описании → Прочее.
  function statementCategory(desc, type, mcc, bankCat) {
    const adres = adresOf(desc);
    if (adres) {
      const mo = merchantOf(adres);
      return mo ? mo.category : (categoryWordOf(adres) || "Прочее");
    }
    const bank = bankCategoryOf(bankCat);
    if (isTransfer(desc, type)) return bank || "Прочее";
    const clean = stmtNoise(desc);
    const mo = merchantOf(clean);
    return (mo && mo.category) || bank || mccCategoryOf(mcc)
      || categoryWordOf(clean) || "Прочее";
  }

  function statementMerchant(desc, type) {
    const adres = adresOf(desc);
    if (adres) {
      const mo = merchantOf(adres);
      if (mo) return mo.name;
      const c = cleanName(adres);
      if (c && !/^[\d\s.]+$/.test(c)) return c.slice(0, 40);
    }
    const odb = cleanName(odbiorcaOf(desc));
    if (odb && !/^[\d\s.]+$/.test(odb)) return odb.slice(0, 40);
    // понятные ярлыки для снятий/обмена раньше, чем разбирать «сырое» описание
    const t = (type || "").toLowerCase();
    if (/bankomat|wyp[łl]ata/.test(t)) return "Снятие наличных";
    if (/wp[łl]ata/.test(t)) return "Внесение наличных";
    if (/kantor|wymiana/.test(t)) return "Обмен валюты";
    if (!isTransfer(desc, type)) {                 // формат не-PKO: описание = магазин
      const mo = merchantOf(stmtNoise(desc));
      if (mo) return mo.name;
      const c = cleanName(stmtNoise(desc));
      if (c && !/^[\d\s.]+$/.test(c)) return c.slice(0, 48);
    }
    if (/przelew|telefon/.test(t)) return "Перевод";
    return "";
  }

  // Что делать со строкой: пропустить (внутреннее), доход или расход.
  // Внутренние перемещения денег самому себе — не траты и не доходы: копилки
  // («Скарбничка» у Привата, «Поповнення „Банка“» у Monobank, Autooszczędzanie у
  // PKO) и переводы между своими картами. Без этого статистика раздувается.
  function statementKind(type, amount, desc, bankCat) {
    const t = (type || "").toLowerCase();
    const bc = normDesc(bankCat);
    const d = normDesc(desc);
    if (/autooszcz/.test(t)) return "skip";
    if (bc === "заощадження" || bc.includes("свою картку") || bc.includes("своєї картки")) return "skip";
    if (/скарбничк/.test(d)) return "skip";                       // копилка Привата
    if (/поповнення (на|" |«)/.test(d) || /^поповнення «/.test(d)) return "skip"; // банка Monobank
    if (/на свою картку|зі своєї картки/.test(d)) return "skip";  // между своими картами
    if (amount >= 0) return "income";
    if (/przychodz|uznanie|зарахування|поповнення|повернення|надходження/.test(t)) return "income";
    return "expense";
  }

  return {
    CATEGORY_FORMS, DEFAULT_CATEGORY, KIND_LABELS, DEFAULT_CURRENCY, CURRENCY_SYMBOLS,
    DEFAULT_RATES, convert, cleanCurrency,
    PERIOD_LABELS, normalize, matchCategory, matchIncome, matchSavings, matchCurrency,
    categoryNames, localISO, ParseError, parseMessage, periodRange,
    categorize, merchantOf, matchMerchant, matchMerchantFuzzy, guessMerchant,
    decodeBytes, parseStatement, parseStatementFile, parseStatementRows, parseXlsx,
    statementMerchant, statementCategory, statementKind,
    statementIncomeNote, hash16,
  };
})();
