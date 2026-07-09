// Локальный «бэкенд» SpendTrack. Раньше эти ответы отдавал FastAPI; теперь всё
// считается на устройстве из IndexedDB, а формат ответов сохранён — поэтому
// app.js почти не изменился: вместо fetch('/api/...') он зовёт localApi().
"use strict";

const LocalAPI = (() => {
  const VERSION = "1.0.0";   // публичная версия — совпадает с versionName в Play

  class HTTPError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }

  const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

  // Курсы валют для сводной аналитики: дефолты из Core + сохранённые правки
  // пользователя (сколько PLN в 1 единице валюты, база PLN = 1).
  async function ratesGet() {
    const stored = (await Store.getSetting("rates")) || {};
    const out = Object.assign({}, Core.DEFAULT_RATES);
    for (const k of Object.keys(stored)) { const v = Number(stored[k]); if (isFinite(v) && v > 0) out[k] = v; }
    return out;
  }

  // --- представление записи (порт web.app.row_to_dict) ---
  function rowToDict(r) {
    const created = String(r.created_at || "");
    const [datePart, timePart] = created.split("T");
    return {
      id: r.id, amount: r.amount, currency: r.currency, category: r.category,
      kind: r.kind, note: r.note || "", place: r.place || "—",
      created_at: created, date: datePart || "", time: timePart ? timePart.slice(0, 5) : "",
    };
  }

  async function defaultCurrency() { return (await Store.getSetting("currency")) || Core.DEFAULT_CURRENCY; }

  // Свои категории. Старый формат — массив строк; новый — {name, icon, color}.
  async function customCats() {
    const raw = (await Store.getSetting("categories_custom")) || [];
    return raw
      .map((c) => (typeof c === "string"
        ? { name: c, icon: "", color: "" }
        : { name: c.name, icon: c.icon || "", color: c.color || "" }))
      .filter((c) => c.name);
  }
  async function categoriesList() {
    const builtin = Core.categoryNames();
    const custom = (await customCats()).map((c) => c.name).filter((n) => !builtin.includes(n));
    return builtin.concat(custom);
  }
  async function customMeta() {
    const map = {};
    for (const c of await customCats()) map[c.name] = { icon: c.icon, color: c.color };
    return map;
  }

  // Правила «фрагмент описания → категория» (для импорта выписки).
  async function catRules() {
    const raw = (await Store.getSetting("cat_rules")) || [];
    return Array.isArray(raw)
      ? raw.filter((r) => r && r.match && r.category)
        .map((r) => ({ match: String(r.match).slice(0, 60), category: String(r.category).slice(0, 60) }))
      : [];
  }
  function applyRules(desc, rules) {
    const d = (desc || "").toLowerCase();
    for (const r of rules) if (r.match && d.includes(r.match.toLowerCase())) return r.category;
    return null;
  }

  // Разобрать строку и, если первое слово заметки совпало с именем своей
  // категории («30 Питомец корм»), отнести трату к ней.
  async function parseWithCustom(text) {
    const p = Core.parseMessage(text, { defaultCurrency: await defaultCurrency() });
    if (p.kind === "expense" && p.note) {
      const first = p.note.split(/\s+/)[0].toLowerCase();
      for (const c of await customCats()) {
        if (c.name.toLowerCase() === first) {
          p.category = c.name;
          p.note = p.note.split(/\s+/).slice(1).join(" ");
          break;
        }
      }
    }
    return p;
  }

  // --- сводка: все суммы конвертируются в целевую валюту, чтобы видеть аналитику
  // одним числом, даже если траты в разных валютах (грн + злотые + евро). Курсы —
  // из настроек (ratesGet). Если валюта одна, конвертация ничего не меняет. ---
  async function buildSummary(period, currency, offset) {
    const { since, until, label } = Core.periodRange(period, null, offset);
    const target = currency || (await defaultCurrency());
    const rates = await ratesGet();
    const rows = await Store.listEntries({ since, until });

    const catMap = new Map();
    const dayMap = new Map();
    let expense = 0, income = 0, savings = 0;
    let biggest = null, biggestRaw = -1;

    for (const e of rows) {
      const amt = Core.convert(e.amount, e.currency, target, rates);
      if (e.kind === "expense") {
        const cur = catMap.get(e.category) || { category: e.category, total: 0, count: 0 };
        cur.total += amt; cur.count += 1; catMap.set(e.category, cur);
        expense += amt;
        const day = (e.created_at || "").slice(0, 10);
        const d = dayMap.get(day) || { day, total: 0, count: 0 };
        d.total += amt; d.count += 1; dayMap.set(day, d);
        if (amt > biggestRaw) {
          biggestRaw = amt;
          biggest = { amount: round2(amt), category: e.category, note: e.note, date: day };
        }
      } else if (e.kind === "income") income += amt;
      else if (e.kind === "savings") savings += amt;
    }

    const catTotal = expense || 0;
    const categories = [...catMap.values()]
      .sort((a, b) => b.total - a.total)
      .map((r) => ({ category: r.category, total: round2(r.total), count: r.count,
        percent: catTotal ? round2(r.total / catTotal * 100) : 0 }));
    const daily = [...dayMap.values()]
      .sort((a, b) => (a.day < b.day ? -1 : 1))
      .map((r) => ({ day: r.day, total: round2(r.total), count: r.count }));

    return {
      period, label, since, until, currency: target,
      categories,
      expense_total: round2(expense), income_total: round2(income), savings_total: round2(savings),
      balance: round2(income - expense),
      entry_count: categories.reduce((a, r) => a + r.count, 0),
      other_currencies: [],   // всё уже приведено к target
      daily, biggest, converted: true,
    };
  }

  // --- импорт выписки: расходы по категориям, доходы как доход, внутреннее мимо ---
  async function importTransactions(txs, source) {
    let imported = 0, imported_income = 0, skipped = 0, internal_skipped = 0;
    const cur = await defaultCurrency();
    const rules = await catRules();
    // все уже импортированные id — одним чтением (было по чтению на строку выписки)
    const seen = new Set((await Store.listAll("imported_tx")).map((x) => x.id));
    for (const tx of txs) {
      if (seen.has(tx.id)) { skipped++; continue; }
      seen.add(tx.id);
      const kind = Core.statementKind(tx.type, tx.amount, tx.description, tx.bank_category);
      if (kind === "skip") { internal_skipped++; await Store.markTxImported(tx.id, 0); continue; }
      const date = (tx.date || "").slice(0, 10);
      const when = date ? date + "T12:00:00" : Core.localISO(new Date()).slice(0, 10) + "T12:00:00";
      let rec;
      if (kind === "income") {
        rec = {
          amount: round2(Math.abs(tx.amount)),
          currency: tx.currency || cur,
          category: "Доход",
          note: (Core.statementIncomeNote(tx.description, tx.type) || "Поступление").slice(0, 60),
          kind: "income", created_at: when, place: "—",
          raw_text: `${source} · ${tx.description}`.slice(0, 200),
        };
      } else {
        const note = Core.statementMerchant(tx.description, tx.type) || Core.guessMerchant(tx.description) || "—";
        rec = {
          amount: round2(Math.abs(tx.amount)),
          currency: tx.currency || cur,
          category: applyRules(tx.description, rules)
            || Core.statementCategory(tx.description, tx.type, tx.mcc, tx.bank_category),
          note: note.slice(0, 60),
          kind: "expense", created_at: when, place: "—",
          raw_text: `${source} · ${tx.description}`.slice(0, 200),
        };
      }
      const row = await Store.insertEntry(rec);
      await Store.markTxImported(tx.id, row.id);
      if (kind === "income") imported_income++; else imported++;
    }
    return { imported, imported_income, skipped, internal_skipped, total: txs.length };
  }

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  // --- маршрутизатор ---
  async function dispatch(method, path, query, body) {
    if (path === "/config" && method === "GET") {
      return {
        version: VERSION, multiuser: false, bot_username: "",
        auth_required: false, authed: true,
        default_currency: await defaultCurrency(), live_refresh: false, bank: false, offline: true,
        currencies: Object.keys(Core.CURRENCY_SYMBOLS), currency_symbols: Core.CURRENCY_SYMBOLS,
        rates: await ratesGet(),
        categories: await categoriesList(),
        custom_meta: await customMeta(),
        rules: await catRules(),
        periods: Object.keys(Core.PERIOD_LABELS).map((k) => ({ key: k })),
      };
    }

    if (path === "/parse-preview" && method === "POST") {
      try {
        const p = await parseWithCustom(body.text);
        return { ok: true, parsed: {
          amount: p.amount, currency: p.currency, category: p.category, note: p.note,
          kind: p.kind, backdated: p.backdated, created_at: p.created_at } };
      } catch (e) { return { ok: false, error: e.message }; }
    }

    if (path === "/entries" && method === "POST") {
      let p;
      try { p = await parseWithCustom(body.text); }
      catch (e) { throw new HTTPError(400, e.message); }
      const row = await Store.insertEntry({
        amount: p.amount, currency: p.currency, category: p.category, place: p.place,
        kind: p.kind, note: p.note, raw_text: p.raw_text, created_at: p.created_at,
      });
      return { entry: rowToDict(row), backdated: p.backdated };
    }

    if (path === "/entries/restore" && method === "POST") {
      const e = body.entry || {};
      const amount = Number(e.amount);
      if (!isFinite(amount)) throw new HTTPError(400, "Нет суммы");
      const row = await Store.insertEntry({
        amount, currency: String(e.currency || "PLN").slice(0, 8),
        category: String(e.category || "Прочее").slice(0, 60),
        place: String(e.place || "—").slice(0, 60),
        kind: ["expense", "income", "savings"].includes(e.kind) ? e.kind : "expense",
        note: String(e.note || "").slice(0, 300),
        raw_text: String(e.raw_text || "").slice(0, 400),
        created_at: /^\d{4}-\d{2}-\d{2}T/.test(String(e.created_at || "")) ? e.created_at : Core.localISO(new Date()),
      });
      return { entry: rowToDict(row) };
    }

    if (path === "/entries" && method === "GET") {
      const { since, until } = Core.periodRange(query.period || "month", null, +query.poffset || 0);
      const kinds = query.kind ? [query.kind] : null;
      const rows = await Store.listEntries({
        since, until, kinds,
        limit: query.limit ? +query.limit : 500, offset: query.offset ? +query.offset : 0 });
      return { entries: rows.map(rowToDict) };
    }

    if (path === "/summary" && method === "GET") {
      return buildSummary(query.period || "month", query.currency || null, +query.poffset || 0);
    }

    let m;
    if ((m = path.match(/^\/entries\/(\d+)$/))) {
      const id = +m[1];
      if (method === "DELETE") {
        const row = await Store.deleteEntry(id);
        if (!row) throw new HTTPError(404, "Запись не найдена");
        return { ok: true, deleted: id, remote: { remote: false } };
      }
      if (method === "PATCH") {
        const row = await Store.updateEntry(id, body);
        if (!row) throw new HTTPError(404, "Запись не найдена");
        return { entry: rowToDict(row) };
      }
    }

    if (path === "/budgets" && method === "GET") {
      const { since, until } = Core.periodRange("month", null, +query.poffset || 0);
      const rates = await ratesGet();
      const rows = await Store.listEntries({ since, until, kinds: ["expense"] });
      const out = (await Store.getBudgets()).map((b) => {
        const bcur = b.currency || "PLN";
        let used = 0;
        for (const e of rows) if (e.category === b.category) used += Core.convert(e.amount, e.currency, bcur, rates);
        used = round2(used);
        return { category: b.category, monthly_limit: b.monthly_limit, currency: bcur,
          spent: used, percent: b.monthly_limit ? round2(used / b.monthly_limit * 100) : 0,
          over: used > b.monthly_limit };
      });
      return { budgets: out };
    }
    if (path === "/budgets" && method === "PUT") {
      await Store.setBudget(body.category, body.monthly_limit, body.currency || (await defaultCurrency()));
      return { ok: true };
    }
    if ((m = path.match(/^\/budgets\/(.+)$/)) && method === "DELETE") {
      await Store.deleteBudget(decodeURIComponent(m[1]));
      return { ok: true };
    }

    if (path === "/import/preview" && method === "POST") {
      const txs = await Core.parseStatementFile(b64ToBytes(body.data_b64));
      const seen = new Set((await Store.listAll("imported_tx")).map((x) => x.id));
      const rows = [];
      for (const tx of txs.slice(0, 3000)) {
        const k = Core.statementKind(tx.type, tx.amount, tx.description, tx.bank_category);
        const expense = k === "expense";
        rows.push({ date: tx.date, amount: tx.amount, currency: tx.currency, type: tx.type,
          merchant: Core.statementMerchant(tx.description, tx.type) || Core.guessMerchant(tx.description),
          category: expense ? Core.statementCategory(tx.description, tx.type, tx.mcc, tx.bank_category) : "—",
          kind: k, is_expense: expense, already: seen.has(tx.id) });
      }
      return {
        count: txs.length,
        expenses: rows.filter((r) => r.is_expense).length,
        new: rows.filter((r) => r.is_expense && !r.already).length,
        new_income: rows.filter((r) => r.kind === "income" && !r.already).length,
        income: rows.filter((r) => r.kind === "income").length,
        internal: rows.filter((r) => r.kind === "skip").length,
        transactions: rows,
      };
    }
    if (path === "/import/confirm" && method === "POST") {
      const txs = await Core.parseStatementFile(b64ToBytes(body.data_b64));
      if (!txs.length) throw new HTTPError(400, "В файле не найдено транзакций — проверь формат выписки");
      return Object.assign({ ok: true }, await importTransactions(txs, "Выписка"));
    }

    // --- настройки/данные (свои, локальные) ---
    if (path === "/settings/currency" && method === "POST") {
      await Store.setSetting("currency", body.currency || "PLN"); return { ok: true };
    }
    // курсы валют (конвертация в сводной аналитике)
    if (path === "/settings/rates" && method === "POST") {
      const src = body.rates || {};
      const cleaned = {};
      for (const k of Object.keys(Core.DEFAULT_RATES)) {
        const v = Number(src[k]); if (isFinite(v) && v > 0) cleaned[k] = v;
      }
      await Store.setSetting("rates", cleaned);
      return { ok: true, rates: await ratesGet() };
    }
    if (path === "/settings/category" && method === "POST") {
      const name = String(body.name || "").trim();
      if (!name) throw new HTTPError(400, "Пустое имя категории");
      const entry = {
        name,
        icon: String(body.icon || "").slice(0, 8),
        color: /^#[0-9a-fA-F]{3,8}$/.test(body.color || "") ? body.color : "",
      };
      const list = await customCats();
      const idx = list.findIndex((c) => c.name === name);
      if (idx >= 0) list[idx] = entry;                     // правка иконки/цвета
      else list.push(entry);                               // в т.ч. оверрайд встроенной
      await Store.setSetting("categories_custom", list);
      return { ok: true, categories: await categoriesList(), custom_meta: await customMeta() };
    }
    if ((m = path.match(/^\/settings\/category\/(.+)$/)) && method === "DELETE") {
      const name = decodeURIComponent(m[1]);
      const list = (await customCats()).filter((c) => c.name !== name);
      await Store.setSetting("categories_custom", list);
      return { ok: true, categories: await categoriesList(), custom_meta: await customMeta() };
    }
    // --- правила категорий ---
    if (path === "/settings/rule" && method === "POST") {
      const match = String(body.match || "").trim(), category = String(body.category || "").trim();
      if (!match || !category) throw new HTTPError(400, "Нужны фрагмент и категория");
      const list = await catRules();
      const idx = list.findIndex((r) => r.match.toLowerCase() === match.toLowerCase());
      if (idx >= 0) list[idx] = { match, category }; else list.push({ match, category });
      await Store.setSetting("cat_rules", list);
      return { ok: true, rules: await catRules() };
    }
    if ((m = path.match(/^\/settings\/rule\/(.+)$/)) && method === "DELETE") {
      const match = decodeURIComponent(m[1]);
      await Store.setSetting("cat_rules", (await catRules()).filter((r) => r.match !== match));
      return { ok: true, rules: await catRules() };
    }

    // --- цели накоплений ---
    if (path === "/goals" && method === "GET") {
      const goals = (await Store.listAll("goals")).sort((a, b) => a.id - b.id);
      return { goals: goals.map((g) => ({
        id: g.id, name: g.name, icon: g.icon || "", target: g.target, saved: g.saved || 0,
        currency: g.currency || "PLN",
        percent: g.target > 0 ? Math.min(100, round2((g.saved || 0) / g.target * 100)) : 0 })) };
    }
    if (path === "/goals" && method === "POST") {
      const name = String(body.name || "").trim();
      if (!name) throw new HTTPError(400, "Нет названия цели");
      const rec = {
        name: name.slice(0, 60), icon: String(body.icon || "").replace(/[<>"'`&]/g, "").slice(0, 8),
        target: Math.max(0, Number(body.target) || 0), saved: Math.max(0, Number(body.saved) || 0),
        currency: String(body.currency || "PLN").slice(0, 8) };
      if (Number.isInteger(body.id)) rec.id = body.id;
      return { ok: true, goal: await Store.putItem("goals", rec) };
    }
    if ((m = path.match(/^\/goals\/(\d+)\/add$/)) && method === "POST") {
      const g = await Store.getItem("goals", +m[1]);
      if (!g) throw new HTTPError(404, "Цель не найдена");
      g.saved = Math.max(0, (Number(g.saved) || 0) + (Number(body.amount) || 0));
      await Store.putItem("goals", g);
      return { ok: true };
    }
    if ((m = path.match(/^\/goals\/(\d+)$/)) && method === "DELETE") {
      await Store.deleteItem("goals", +m[1]); return { ok: true };
    }

    // --- регулярные траты / подписки ---
    if (path === "/recurring" && method === "GET") {
      const items = (await Store.listAll("recurring")).sort((a, b) => a.id - b.id);
      return { recurring: items.map((r) => ({ id: r.id, text: r.text, amount: r.amount,
        currency: r.currency, category: r.category, kind: r.kind, note: r.note, day: r.day,
        active: r.active !== false })) };
    }
    if (path === "/recurring" && method === "POST") {
      let p;
      try { p = await parseWithCustom(body.text); } catch (e) { throw new HTTPError(400, e.message); }
      const day = Math.min(28, Math.max(1, Number(body.day) || 1));   // ≤28 — есть в каждом месяце
      const rec = { text: String(body.text || "").slice(0, 200), amount: p.amount, currency: p.currency,
        category: p.category, kind: p.kind, note: p.note, day, active: true, last_added: "" };
      if (Number.isInteger(body.id)) {
        rec.id = body.id;
        const old = await Store.getItem("recurring", body.id); if (old) rec.last_added = old.last_added || "";
      }
      return { ok: true, recurring: await Store.putItem("recurring", rec) };
    }
    if ((m = path.match(/^\/recurring\/(\d+)$/)) && method === "DELETE") {
      await Store.deleteItem("recurring", +m[1]); return { ok: true };
    }
    if (path === "/recurring/run" && method === "POST") {
      const now = new Date();
      const ym = Core.localISO(now).slice(0, 7);                       // YYYY-MM
      const items = await Store.listAll("recurring");
      let added = 0;
      for (const r of items) {
        if (r.active === false || r.last_added === ym || now.getDate() < (r.day || 1)) continue;
        const when = `${ym}-${String(r.day || 1).padStart(2, "0")}T12:00:00`;
        await Store.insertEntry({ amount: r.amount, currency: r.currency, category: r.category,
          place: "—", kind: r.kind, note: r.note, raw_text: `↻ ${r.text}`, created_at: when });
        r.last_added = ym; await Store.putItem("recurring", r); added++;
      }
      return { ok: true, added };
    }

    if (path === "/backup" && method === "GET") { return await Store.exportAll(); }
    if (path === "/restore" && method === "POST") {
      const res = await Store.importAll(body.data);
      return Object.assign({ ok: true }, res);
    }
    if (path === "/reset" && method === "POST") {
      await Store.clearAll(); return { ok: true };
    }

    throw new HTTPError(404, "Неизвестный запрос: " + method + " " + path);
  }

  // app.js зовёт это вместо fetch. Возвращает то же, что возвращал JSON-ответ сервера.
  async function localApi(path, opts = {}) {
    const method = (opts.method || "GET").toUpperCase();
    const [rawPath, qs] = path.split("?");
    const query = {};
    if (qs) for (const part of qs.split("&")) {
      const [k, v] = part.split("="); query[decodeURIComponent(k)] = decodeURIComponent(v || "");
    }
    const body = opts.body ? JSON.parse(opts.body) : {};
    await Store.open();
    return dispatch(method, rawPath, query, body);
  }

  return { localApi, HTTPError };
})();
