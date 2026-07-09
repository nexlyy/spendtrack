// Локализация SpendTrack: украинский, польский, английский, русский.
// Внутри данные всегда хранятся каноническими ключами (имена категорий по-русски),
// а на экран выводится перевод — так смена языка не трогает базу.
"use strict";

const I18N = (() => {
  const SUPPORTED = ["uk", "pl", "en", "ru"];
  const LANG_NAMES = { uk: "Українська", pl: "Polski", en: "English", ru: "Русский" };
  const LOCALES = { uk: "uk-UA", pl: "pl-PL", en: "en-GB", ru: "ru-RU" };
  let lang = "en";

  function detect() {
    const cands = navigator.languages || [navigator.language || "en"];
    for (const c of cands) {
      const two = String(c).slice(0, 2).toLowerCase();
      if (SUPPORTED.includes(two)) return two;
    }
    return "en";
  }
  function init() {
    lang = localStorage.getItem("st-lang") || detect();
    if (!SUPPORTED.includes(lang)) lang = "en";
    document.documentElement.lang = lang;
  }
  function setLang(l) {
    if (!SUPPORTED.includes(l)) return;
    lang = l; localStorage.setItem("st-lang", l); document.documentElement.lang = l;
  }
  const getLang = () => lang;
  const locale = () => LOCALES[lang] || "en-GB";

  // Строки интерфейса. Ключ → перевод на 4 языка.
  const S = {
    add: { uk: "Додати", pl: "Dodaj", en: "Add", ru: "Добавить" },
    add_ph: { uk: "50 їжа обід", pl: "50 jedzenie obiad", en: "50 food lunch", ru: "50 еда обед" },
    theme: { uk: "Тема", pl: "Motyw", en: "Theme", ru: "Тема" },
    theme_auto: { uk: "Тема: авто", pl: "Motyw: auto", en: "Theme: auto", ru: "Тема: авто" },
    theme_light: { uk: "Тема: світла", pl: "Motyw: jasny", en: "Theme: light", ru: "Тема: светлая" },
    theme_dark: { uk: "Тема: темна", pl: "Motyw: ciemny", en: "Theme: dark", ru: "Тема: тёмная" },
    logout: { uk: "Вийти", pl: "Wyloguj", en: "Log out", ru: "Выйти" },
    close: { uk: "Закрити", pl: "Zamknij", en: "Close", ru: "Закрыть" },
    period: { uk: "Період", pl: "Okres", en: "Period", ru: "Период" },
    new_expense: { uk: "Нова витрата", pl: "Nowy wydatek", en: "New expense", ru: "Новая трата" },
    chart_aria: { uk: "Діаграма витрат", pl: "Wykres wydatków", en: "Expenses chart", ru: "Диаграмма расходов" },
    expenses: { uk: "Витрати", pl: "Wydatki", en: "Expenses", ru: "Расходы" },
    income: { uk: "Дохід", pl: "Przychód", en: "Income", ru: "Доход" },
    saved: { uk: "Відкладено", pl: "Odłożono", en: "Saved", ru: "Отложено" },
    balance: { uk: "Баланс", pl: "Saldo", en: "Balance", ru: "Баланс" },
    balance_sub: { uk: "дохід − витрати", pl: "przychód − wydatki", en: "income − expenses", ru: "доход − расходы" },
    categories: { uk: "Категорії", pl: "Kategorie", en: "Categories", ru: "Категории" },
    trend: { uk: "Динаміка", pl: "Dynamika", en: "Trend", ru: "Динамика" },
    ins_title: { uk: "Інсайти", pl: "Wnioski", en: "Insights", ru: "Инсайты" },
    ins_avg: { uk: "У середньому на день", pl: "Średnio na dzień", en: "Average per day", ru: "В среднем в день" },
    ins_biggest: { uk: "Найбільша витрата", pl: "Największy wydatek", en: "Biggest expense", ru: "Крупнейшая трата" },
    ins_forecast: { uk: "Прогноз на місяць", pl: "Prognoza na miesiąc", en: "Forecast for month", ru: "Прогноз на месяц" },
    budgets: { uk: "Бюджети", pl: "Budżety", en: "Budgets", ru: "Бюджеты" },
    goals: { uk: "Цілі", pl: "Cele", en: "Goals", ru: "Цели" },
    add_goal: { uk: "+ Ціль", pl: "+ Cel", en: "+ Goal", ru: "+ Цель" },
    goals_empty: { uk: "Цілей немає. Додай ціль накопичення.", pl: "Brak celów. Dodaj cel oszczędzania.", en: "No goals. Add a savings goal.", ru: "Целей нет. Добавь цель накопления." },
    goal_title: { uk: "Ціль накопичення", pl: "Cel oszczędzania", en: "Savings goal", ru: "Цель накопления" },
    goal_name: { uk: "Назва", pl: "Nazwa", en: "Name", ru: "Название" },
    goal_name_ph: { uk: "Напр., На відпустку", pl: "Np. Na wakacje", en: "e.g. Vacation", ru: "Напр., На отпуск" },
    goal_target: { uk: "Ціль (сума)", pl: "Cel (kwota)", en: "Target amount", ru: "Цель (сумма)" },
    goal_saved: { uk: "Вже накопичено", pl: "Już odłożono", en: "Already saved", ru: "Уже накоплено" },
    goal_need_name: { uk: "Вкажи назву цілі", pl: "Podaj nazwę celu", en: "Enter a goal name", ru: "Укажи название цели" },
    goal_saved_t: { uk: "Ціль збережено", pl: "Cel zapisany", en: "Goal saved", ru: "Цель сохранена" },
    recurring_title: { uk: "Регулярні витрати", pl: "Wydatki cykliczne", en: "Recurring expenses", ru: "Регулярные траты" },
    recurring_hint: { uk: "Підписки/оренда — додаватимуться щомісяця автоматично.", pl: "Subskrypcje/czynsz — dodawane co miesiąc automatycznie.", en: "Subscriptions/rent — added automatically each month.", ru: "Подписки/аренда — будут добавляться каждый месяц автоматически." },
    recurring_text_ph: { uk: "120 Підписки Netflix", pl: "120 Subskrypcje Netflix", en: "120 Subscriptions Netflix", ru: "120 Подписки Netflix" },
    recurring_day: { uk: "день", pl: "dzień", en: "day", ru: "день" },
    recurring_none: { uk: "поки немає", pl: "jeszcze brak", en: "none yet", ru: "пока нет" },
    recurring_monthly: { uk: "На місяць: {m}", pl: "Miesięcznie: {m}", en: "Monthly: {m}", ru: "В месяц: {m}" },
    rules_title: { uk: "Правила категорій", pl: "Reguły kategorii", en: "Category rules", ru: "Правила категорий" },
    rules_hint: { uk: "Якщо в описі є фрагмент → ставити категорію (при імпорті).", pl: "Jeśli opis zawiera fragment → ustaw kategorię (przy imporcie).", en: "If description contains text → set category (on import).", ru: "Если в описании есть фрагмент → ставить категорию (при импорте)." },
    rule_match_ph: { uk: "фрагмент опису", pl: "fragment opisu", en: "text fragment", ru: "фрагмент описания" },
    month_lc: { uk: "місяць", pl: "miesiąc", en: "month", ru: "месяц" },
    add_limit: { uk: "+ Ліміт", pl: "+ Limit", en: "+ Limit", ru: "+ Лимит" },
    feed: { uk: "Стрічка", pl: "Lista", en: "Feed", ru: "Лента" },
    f_all: { uk: "Усе", pl: "Wszystko", en: "All", ru: "Всё" },
    f_expense: { uk: "Витрати", pl: "Wydatki", en: "Expenses", ru: "Траты" },
    f_income: { uk: "Дохід", pl: "Przychód", en: "Income", ru: "Доход" },
    f_savings: { uk: "Заощадження", pl: "Oszczędności", en: "Savings", ru: "Сбережения" },
    export_csv: { uk: "Експорт CSV", pl: "Eksport CSV", en: "Export CSV", ru: "Экспорт CSV" },
    search_ph: { uk: "Пошук…", pl: "Szukaj…", en: "Search…", ru: "Поиск…" },
    chart_empty: { uk: "За цей період витрат немає.", pl: "Brak wydatków w tym okresie.", en: "No expenses for this period.", ru: "За этот период трат нет." },
    feed_empty: { uk: "Поки порожньо. Додайте першу витрату вище.", pl: "Pusto. Dodaj pierwszy wydatek powyżej.", en: "Empty. Add your first expense above.", ru: "Пока пусто. Добавьте первую трату выше." },
    budgets_empty: { uk: "Лімітів немає. Додайте, щоб бачити перевитрату.", pl: "Brak limitów. Dodaj, aby widzieć przekroczenia.", en: "No limits. Add one to track overspending.", ru: "Лимитов нет. Добавьте, чтобы видеть перерасход." },
    footer: { uk: "дані зберігаються лише на цьому пристрої", pl: "dane przechowywane tylko na tym urządzeniu", en: "data is stored only on this device", ru: "данные хранятся только на этом устройстве" },
    over: { uk: "перевитрата", pl: "przekroczenie", en: "over budget", ru: "перерасход" },
    other_cur: { uk: "Ще:", pl: "Jeszcze:", en: "Also:", ru: "Ещё:" },
    vs_prev: { uk: "проти попереднього періоду", pl: "vs poprzedni okres", en: "vs previous period", ru: "к предыдущему периоду" },
    b_income: { uk: "дохід", pl: "przychód", en: "income", ru: "доход" },
    b_saved: { uk: "відкладено", pl: "odłożono", en: "saved", ru: "отложено" },
    today: { uk: "Сьогодні", pl: "Dziś", en: "Today", ru: "Сегодня" },
    yesterday: { uk: "Вчора", pl: "Wczoraj", en: "Yesterday", ru: "Вчера" },

    // запись / редактирование
    record: { uk: "Запис", pl: "Wpis", en: "Entry", ru: "Запись" },
    amount: { uk: "Сума", pl: "Kwota", en: "Amount", ru: "Сумма" },
    currency: { uk: "Валюта", pl: "Waluta", en: "Currency", ru: "Валюта" },
    type: { uk: "Тип", pl: "Typ", en: "Type", ru: "Тип" },
    category: { uk: "Категорія", pl: "Kategoria", en: "Category", ru: "Категория" },
    note: { uk: "Нотатка", pl: "Notatka", en: "Note", ru: "Заметка" },
    datetime: { uk: "Дата і час", pl: "Data i godzina", en: "Date & time", ru: "Дата и время" },
    t_expense: { uk: "Витрата", pl: "Wydatek", en: "Expense", ru: "Трата" },
    t_income: { uk: "Дохід", pl: "Przychód", en: "Income", ru: "Доход" },
    t_savings: { uk: "Заощадження", pl: "Oszczędności", en: "Savings", ru: "Сбережения" },
    delete: { uk: "Видалити", pl: "Usuń", en: "Delete", ru: "Удалить" },
    save: { uk: "Зберегти", pl: "Zapisz", en: "Save", ru: "Сохранить" },
    cancel: { uk: "Скасувати", pl: "Anuluj", en: "Cancel", ru: "Отмена" },
    confirm_title: { uk: "Підтвердження", pl: "Potwierdzenie", en: "Confirm", ru: "Подтверждение" },

    // бюджет
    limit_title: { uk: "Ліміт за категорією", pl: "Limit kategorii", en: "Category limit", ru: "Лимит по категории" },
    limit_month: { uk: "Ліміт на місяць", pl: "Limit miesięczny", en: "Monthly limit", ru: "Лимит в месяц" },
    remove: { uk: "Прибрати", pl: "Usuń", en: "Remove", ru: "Убрать" },

    // данные/настройки
    settings: { uk: "Дані та налаштування", pl: "Dane i ustawienia", en: "Data & settings", ru: "Данные и настройки" },
    import_csv: { uk: "Імпорт виписки (CSV)", pl: "Import wyciągu (CSV)", en: "Import statement (CSV)", ru: "Импорт выписки (CSV)" },
    import_hint: { uk: "Вивантаж виписку з банку у CSV або XLSX (PKO, Monobank, Приват24, ING…) і завантаж сюди — розкладу витрати за категоріями.", pl: "Wyeksportuj wyciąg bankowy do CSV lub XLSX (PKO, Monobank, Privat24, ING…) i wgraj tutaj — rozłożę wydatki na kategorie.", en: "Export your bank statement as CSV or XLSX (PKO, Monobank, Privat24, ING…) and upload here — I'll sort expenses into categories.", ru: "Выгрузи выписку из банка в CSV или XLSX (PKO, Monobank, Приват24, ING…) и загрузи сюда — разложу траты по категориям." },
    import_btn: { uk: "Імпортувати", pl: "Importuj", en: "Import", ru: "Импортировать" },
    backup: { uk: "Резервна копія", pl: "Kopia zapasowa", en: "Backup", ru: "Резервная копия" },
    backup_hint: { uk: "Усі дані лише на цьому пристрої. Щоб перенести на інший телефон — збережи копію і віднови на ньому.", pl: "Wszystkie dane tylko na tym urządzeniu. Aby przenieść na inny telefon — zapisz kopię i przywróć ją tam.", en: "All data lives only on this device. To move it to another phone — save a backup and restore it there.", ru: "Все данные хранятся только на этом устройстве. Чтобы перенести их на другой телефон — сохрани копию и восстанови на нём." },
    backup_save: { uk: "Зберегти копію", pl: "Zapisz kopię", en: "Save backup", ru: "Сохранить копию" },
    backup_restore: { uk: "Відновити з копії", pl: "Przywróć z kopii", en: "Restore from backup", ru: "Восстановить из копии" },
    custom_cats: { uk: "Свої категорії", pl: "Własne kategorie", en: "Custom categories", ru: "Свои категории" },
    categories_title: { uk: "Категорії та значки", pl: "Kategorie i ikony", en: "Categories & icons", ru: "Категории и значки" },
    cat_edit_hint: { uk: "Натисни категорію, щоб змінити значок і колір.", pl: "Kliknij kategorię, aby zmienić ikonę i kolor.", en: "Tap a category to change its icon and color.", ru: "Нажми категорию, чтобы сменить значок и цвет." },
    none_yet: { uk: "поки немає", pl: "jeszcze brak", en: "none yet", ru: "пока нет" },
    new_cat_ph: { uk: "Наприклад, Здоров'я", pl: "Np. Zdrowie", en: "e.g. Health", ru: "Например, Здоровье" },
    main_currency: { uk: "Основна валюта", pl: "Waluta główna", en: "Main currency", ru: "Основная валюта" },
    rates_title: { uk: "Курси валют (конвертація)", pl: "Kursy walut (przeliczanie)", en: "Exchange rates (conversion)", ru: "Курсы валют (конвертация)" },
    rates_hint: {
      uk: "Для зведеної аналітики все переводиться в обрану валюту (вгорі). Курси приблизні — задай свої, база — PLN.",
      pl: "Do zbiorczej analizy wszystko przeliczane jest na wybraną walutę (u góry). Kursy orientacyjne — ustaw własne, baza to PLN.",
      en: "For combined analytics everything is converted to the selected currency (top). Rates are approximate — set your own; base is PLN.",
      ru: "Для сводной аналитики всё переводится в выбранную валюту (вверху). Курсы примерные — задай свои, база — PLN.",
    },
    rates_saved: { uk: "Курси збережено", pl: "Kursy zapisane", en: "Rates saved", ru: "Курсы сохранены" },
    language: { uk: "Мова", pl: "Język", en: "Language", ru: "Язык" },
    install_app: { uk: "Встановити застосунок", pl: "Zainstaluj aplikację", en: "Install app", ru: "Установить приложение" },
    pin_protect: { uk: "Захист PIN-кодом", pl: "Ochrona PIN-em", en: "PIN protection", ru: "Защита PIN-кодом" },
    pin_on: { uk: "PIN увімкнено.", pl: "PIN włączony.", en: "PIN is on.", ru: "PIN включён." },
    pin_off: { uk: "PIN не задано — вхід вільний.", pl: "Brak PIN-u — wejście bez hasła.", en: "No PIN — open access.", ru: "PIN не задан — вход свободный." },
    pin_new_ph: { uk: "новий PIN", pl: "nowy PIN", en: "new PIN", ru: "новый PIN" },
    pin_set_ph: { uk: "придумай PIN", pl: "ustaw PIN", en: "set a PIN", ru: "придумай PIN" },
    pin_change: { uk: "Змінити", pl: "Zmień", en: "Change", ru: "Сменить" },
    pin_enable: { uk: "Увімкнути", pl: "Włącz", en: "Enable", ru: "Включить" },
    pin_remove: { uk: "Прибрати", pl: "Usuń", en: "Remove", ru: "Убрать" },
    danger: { uk: "Небезпечна зона", pl: "Strefa niebezpieczna", en: "Danger zone", ru: "Опасная зона" },
    delete_all: { uk: "Видалити всі дані", pl: "Usuń wszystkie dane", en: "Delete all data", ru: "Удалить все данные" },

    // вход
    enter_pin: { uk: "Введіть PIN для входу", pl: "Wprowadź PIN, aby wejść", en: "Enter PIN to continue", ru: "Введите PIN для входа" },
    login: { uk: "Увійти", pl: "Wejdź", en: "Enter", ru: "Войти" },
    wrong_pin: { uk: "Невірний PIN", pl: "Błędny PIN", en: "Wrong PIN", ru: "Неверный PIN" },

    // тосты/подтверждения
    pin_min: { uk: "PIN — щонайменше 4 цифри", pl: "PIN — minimum 4 cyfry", en: "PIN — at least 4 digits", ru: "PIN — минимум 4 цифры" },
    pin_saved: { uk: "PIN збережено", pl: "PIN zapisany", en: "PIN saved", ru: "PIN сохранён" },
    pin_removed: { uk: "PIN прибрано", pl: "PIN usunięty", en: "PIN removed", ru: "PIN убран" },
    cat_added: { uk: "Категорію «{n}» додано", pl: "Dodano kategorię „{n}”", en: "Category “{n}” added", ru: "Категория «{n}» добавлена" },
    cur_set: { uk: "Основна валюта: {c}", pl: "Waluta główna: {c}", en: "Main currency: {c}", ru: "Основная валюта: {c}" },
    lang_set: { uk: "Мову змінено", pl: "Zmieniono język", en: "Language changed", ru: "Язык изменён" },
    saved_to: { uk: "Збережено: {w}", pl: "Zapisano: {w}", en: "Saved: {w}", ru: "Сохранено: {w}" },
    sharing: { uk: "Відкриваю «Поділитися»…", pl: "Otwieram „Udostępnij”…", en: "Opening Share…", ru: "Открываю «Поделиться»…" },
    restored: { uk: "Відновлено: {n} записів", pl: "Przywrócono: {n} wpisów", en: "Restored: {n} entries", ru: "Восстановлено: {n} записей" },
    wiped: { uk: "Усі дані видалено", pl: "Wszystkie dane usunięte", en: "All data deleted", ru: "Все данные удалены" },
    not_backup: { uk: "Файл не схожий на резервну копію", pl: "To nie wygląda na kopię zapasową", en: "This doesn't look like a backup", ru: "Файл не похож на резервную копию" },
    read_fail: { uk: "Не вдалося прочитати файл", pl: "Nie udało się odczytać pliku", en: "Couldn't read the file", ru: "Не удалось прочитать файл" },
    no_gz: { uk: "Цей пристрій не вміє розпакувати .gz", pl: "To urządzenie nie rozpakuje .gz", en: "This device can't unzip .gz", ru: "Это устройство не умеет распаковывать .gz" },
    pick_first: { uk: "Спочатку оберіть категорію/банк", pl: "Najpierw wybierz", en: "Pick first", ru: "Сначала выбери" },
    limit_gt0: { uk: "Вкажіть ліміт більше нуля", pl: "Podaj limit większy od zera", en: "Enter a limit above zero", ru: "Укажите лимит больше нуля" },
    amount_gt0: { uk: "Сума має бути більше нуля", pl: "Kwota musi być większa od zera", en: "Amount must be above zero", ru: "Сумма должна быть больше нуля" },
    added_toast: { uk: "Додано #{id}: {c} · {m}", pl: "Dodano #{id}: {c} · {m}", en: "Added #{id}: {c} · {m}", ru: "Добавлено #{id}: {c} · {m}" },
    deleted_toast: { uk: "Видалено #{id}", pl: "Usunięto #{id}", en: "Deleted #{id}", ru: "Удалено #{id}" },
    undo: { uk: "Вернути", pl: "Cofnij", en: "Undo", ru: "Вернуть" },
    restored_one: { uk: "Запис повернено", pl: "Wpis przywrócony", en: "Entry restored", ru: "Запись возвращена" },
    saved_toast: { uk: "Збережено #{id}", pl: "Zapisano #{id}", en: "Saved #{id}", ru: "Сохранено #{id}" },
    limit_saved: { uk: "Ліміт для «{c}» збережено", pl: "Limit dla „{c}” zapisany", en: "Limit for “{c}” saved", ru: "Лимит для «{c}» сохранён" },
    limit_removed: { uk: "Ліміт для «{c}» прибрано", pl: "Limit dla „{c}” usunięty", en: "Limit for “{c}” removed", ru: "Лимит для «{c}» убран" },
    del_confirm: { uk: "Видалити запис #{id}: {c} {m}?", pl: "Usunąć wpis #{id}: {c} {m}?", en: "Delete entry #{id}: {c} {m}?", ru: "Удалить запись #{id}: {c} {m}?" },
    restore_confirm: { uk: "Відновити з копії? Поточні дані буде замінено.", pl: "Przywrócić z kopii? Bieżące dane zostaną zastąpione.", en: "Restore from backup? Current data will be replaced.", ru: "Восстановить из копии? Текущие данные будут заменены." },
    reset_confirm1: { uk: "Видалити ВСІ записи, бюджети й налаштування на цьому пристрої? Це незворотно.", pl: "Usunąć WSZYSTKIE wpisy, budżety i ustawienia na tym urządzeniu? Nieodwracalne.", en: "Delete ALL entries, budgets and settings on this device? This is irreversible.", ru: "Удалить ВСЕ записи, бюджеты и настройки на этом устройстве? Это необратимо." },
    reset_confirm2: { uk: "Точно видалити все? Зробіть копію заздалегідь.", pl: "Na pewno usunąć wszystko? Zrób wcześniej kopię.", en: "Really delete everything? Make a backup first.", ru: "Точно удалить всё? Сделайте резервную копию заранее." },
    delete_all_btn: { uk: "Видалити все", pl: "Usuń wszystko", en: "Delete all", ru: "Удалить всё" },
    yes_delete: { uk: "Так, видалити", pl: "Tak, usuń", en: "Yes, delete", ru: "Да, удалить" },
    import_found: { uk: "Знайдено {n} операцій. До імпорту: {m} витрат із категоріями.", pl: "Znaleziono {n} operacji. Do importu: {m} wydatków z kategoriami.", en: "Found {n} operations. To import: {m} categorized expenses.", ru: "Найдено {n} операций. К импорту: {m} трат с категориями." },
    import_skip: { uk: "Пропущу внутрішні накопичення: {n}.", pl: "Pominę wewnętrzne oszczędności: {n}.", en: "Skipping internal savings: {n}.", ru: "Пропущу внутренние накопления: {n}." },
    import_all_done: { uk: " Усе вже імпортовано.", pl: " Wszystko już zaimportowane.", en: " Everything already imported.", ru: " Всё уже импортировано." },
    import_no_tx: { uk: "Не знайшов транзакцій — перевір, що це CSV-виписка.", pl: "Nie znalazłem transakcji — sprawdź, czy to wyciąg CSV.", en: "No transactions found — check it's a CSV statement.", ru: "Не нашёл транзакций — проверь, что это CSV-выписка." },
    importing: { uk: "Імпортую…", pl: "Importuję…", en: "Importing…", ru: "Импортирую…" },
    reading: { uk: "Читаю файл…", pl: "Czytam plik…", en: "Reading file…", ru: "Читаю файл…" },
    import_done: { uk: "Імпортовано: {n} витрат · пропущено: {s}", pl: "Zaimportowano: {n} wydatków · pominięto: {s}", en: "Imported: {n} expenses · skipped: {s}", ru: "Импортировано: {n} трат · пропущено: {s}" },
    csv_header: {
      uk: "id;дата;час;тип;категорія;сума;валюта;нотатка",
      pl: "id;data;godzina;typ;kategoria;kwota;waluta;notatka",
      en: "id;date;time;type;category;amount;currency;note",
      ru: "id;дата;время;тип;категория;сумма;валюта;заметка",
    },
  };

  function t(key, params) {
    let s = (S[key] && (S[key][lang] || S[key].en)) || key;
    if (params) for (const k in params) s = s.split("{" + k + "}").join(params[k]);
    return s;
  }

  // Подписи категорий (ключи — канонические русские имена; «Ева»/свои — без перевода).
  const CAT_L = {
    "Еда": { uk: "Їжа", pl: "Jedzenie", en: "Food", ru: "Еда" },
    "Доставка": { uk: "Доставка", pl: "Dostawa", en: "Delivery", ru: "Доставка" },
    "Продукты": { uk: "Продукти", pl: "Zakupy spożywcze", en: "Groceries", ru: "Продукты" },
    "Транспорт": { uk: "Транспорт", pl: "Transport", en: "Transport", ru: "Транспорт" },
    "Аренда": { uk: "Оренда", pl: "Czynsz", en: "Rent", ru: "Аренда" },
    "Развлечения": { uk: "Розваги", pl: "Rozrywka", en: "Entertainment", ru: "Развлечения" },
    "Одежда": { uk: "Одяг", pl: "Odzież", en: "Clothing", ru: "Одежда" },
    "Дом": { uk: "Дім", pl: "Dom", en: "Home", ru: "Дом" },
    "Уход": { uk: "Догляд", pl: "Pielęgnacja", en: "Personal care", ru: "Уход" },
    "Здоровье": { uk: "Здоров'я", pl: "Zdrowie", en: "Health", ru: "Здоровье" },
    "Образование": { uk: "Освіта", pl: "Edukacja", en: "Education", ru: "Образование" },
    "Подписки": { uk: "Підписки", pl: "Subskrypcje", en: "Subscriptions", ru: "Подписки" },
    "Прочее": { uk: "Інше", pl: "Inne", en: "Other", ru: "Прочее" },
    "Доход": { uk: "Дохід", pl: "Przychód", en: "Income", ru: "Доход" },
    "Сбережения": { uk: "Заощадження", pl: "Oszczędności", en: "Savings", ru: "Сбережения" },
  };
  function catLabel(cat) { return (CAT_L[cat] && (CAT_L[cat][lang] || CAT_L[cat].en)) || cat; }

  const PERIOD_L = {
    today: { uk: "Сьогодні", pl: "Dziś", en: "Today", ru: "Сегодня" },
    week: { uk: "Тиждень", pl: "Tydzień", en: "Week", ru: "Неделя" },
    month: { uk: "Місяць", pl: "Miesiąc", en: "Month", ru: "Месяц" },
    year: { uk: "Рік", pl: "Rok", en: "Year", ru: "Год" },
    all: { uk: "Увесь час", pl: "Cały czas", en: "All time", ru: "Всё время" },
  };
  function periodLabel(k) { return (PERIOD_L[k] && (PERIOD_L[k][lang] || PERIOD_L[k].en)) || k; }

  // склонение слова «запись» для счётчика
  function pluralEntries(n) {
    const m10 = n % 10, m100 = n % 100;
    if (lang === "en") return n === 1 ? "entry" : "entries";
    if (lang === "pl") {
      if (n === 1) return "wpis";
      if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return "wpisy";
      return "wpisów";
    }
    if (lang === "uk") {
      if (m10 === 1 && m100 !== 11) return "запис";
      if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return "записи";
      return "записів";
    }
    if (m10 === 1 && m100 !== 11) return "запись";
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return "записи";
    return "записей";
  }

  // Применить переводы к статической разметке (data-i18n / -ph / -aria / -title).
  function apply(root) {
    root = root || document;
    root.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.getAttribute("data-i18n")); });
    root.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.setAttribute("placeholder", t(el.getAttribute("data-i18n-ph"))); });
    root.querySelectorAll("[data-i18n-aria]").forEach((el) => { el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria"))); });
    root.querySelectorAll("[data-i18n-title]").forEach((el) => { el.setAttribute("title", t(el.getAttribute("data-i18n-title"))); });
  }

  // примеры быстрого ввода (кликабельные подсказки) под язык
  const EX = {
    uk: ["50 їжа обід", "120 продукти", "20 eur кава", "4500 зарплата", "200 відклав"],
    pl: ["50 jedzenie obiad", "120 zakupy", "20 eur kawa", "4500 wypłata", "200 oszczędności"],
    en: ["50 food lunch", "120 groceries", "20 eur coffee", "4500 salary", "200 savings"],
    ru: ["50 еда обед", "120 продукты", "20 eur кофе", "4500 зарплата", "200 отложил"],
  };
  const examples = () => EX[lang] || EX.en;

  return { init, setLang, getLang, locale, t, catLabel, periodLabel, pluralEntries, apply, examples, SUPPORTED, LANG_NAMES };
})();
