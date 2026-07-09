// Хранилище SpendTrack на IndexedDB — единственное место с данными. Раньше это
// был SQLite на сервере; теперь база живёт прямо на устройстве, поэтому данные
// у каждого устройства свои и приложению не нужен ни сервер, ни сеть. Перенос
// между устройствами — через резервную копию (экспорт/импорт JSON).
"use strict";

const Store = (() => {
  const DB_NAME = "spendtrack";
  const DB_VERSION = 2;   // v2: добавлены хранилища goals и recurring
  let _db = null;

  function openOnce() {
    return new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); }
      catch (e) { reject(e); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("entries")) {
          db.createObjectStore("entries", { keyPath: "id", autoIncrement: true });
        }
        if (!db.objectStoreNames.contains("budgets")) {
          db.createObjectStore("budgets", { keyPath: "category" });
        }
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("imported_tx")) {
          db.createObjectStore("imported_tx", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("goals")) {
          db.createObjectStore("goals", { keyPath: "id", autoIncrement: true });
        }
        if (!db.objectStoreNames.contains("recurring")) {
          db.createObjectStore("recurring", { keyPath: "id", autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error("indexedDB blocked"));
    });
  }

  // На iOS Safari первый open() иногда «зависает» (не стреляет ни один колбэк) —
  // ставим таймаут и пробуем ещё раз.
  function open() {
    if (_db) return Promise.resolve(_db);
    const withTimeout = () => new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; reject(new Error("idb timeout")); } }, 2500);
      openOnce().then((db) => { if (!done) { done = true; clearTimeout(timer); resolve(db); } },
        (e) => { if (!done) { done = true; clearTimeout(timer); reject(e); } });
    });
    return withTimeout()
      .catch(() => new Promise((r) => setTimeout(r, 200)).then(withTimeout))
      .then((db) => {
        _db = db;
        db.onversionchange = () => { try { db.close(); } catch (e) {} _db = null; };
        return db;
      });
  }

  function tx(stores, mode) {
    return open().then((db) => db.transaction(stores, mode));
  }

  function reqP(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function getAll(storeName) {
    return tx(storeName, "readonly").then((t) => reqP(t.objectStore(storeName).getAll()));
  }

  // --- записи ---
  function allEntries() { return getAll("entries"); }

  function inRange(e, since, until) {
    const c = e.created_at || "";
    if (since && c < since) return false;
    if (until && c >= until) return false;
    return true;
  }

  async function listEntries({ since = null, until = null, kinds = null, limit = null, offset = 0 } = {}) {
    let rows = (await allEntries()).filter((e) => inRange(e, since, until));
    if (kinds && kinds.length) rows = rows.filter((e) => kinds.includes(e.kind));
    rows.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : b.id - a.id));
    if (limit !== null) rows = rows.slice(offset, offset + limit);
    return rows;
  }

  async function insertEntry(record) {
    const t = await tx("entries", "readwrite");
    const rec = Object.assign({ place: "—", note: "", raw_text: "" }, record);
    rec.currency = Core.cleanCurrency(rec.currency);
    delete rec.id; // пусть autoIncrement выдаст id
    const id = await reqP(t.objectStore("entries").add(rec));
    rec.id = id;
    return rec;
  }

  async function getEntry(id) {
    const t = await tx("entries", "readonly");
    return reqP(t.objectStore("entries").get(Number(id)));
  }

  async function updateEntry(id, fields) {
    const t = await tx("entries", "readwrite");
    const store = t.objectStore("entries");
    const row = await reqP(store.get(Number(id)));
    if (!row) return null;
    const editable = ["amount", "currency", "category", "kind", "note", "place", "created_at"];
    for (const k of editable) if (k in fields && fields[k] != null) row[k] = fields[k];
    await reqP(store.put(row));
    return row;
  }

  async function deleteEntry(id) {
    const t = await tx("entries", "readwrite");
    const store = t.objectStore("entries");
    const row = await reqP(store.get(Number(id)));
    if (!row) return null;
    await reqP(store.delete(Number(id)));
    return row;
  }

  // --- агрегации (порт storage.summary_by_category / totals_by_kind / daily_totals) ---
  async function summaryByCategory({ since, until, kind = "expense" } = {}) {
    const rows = (await allEntries()).filter((e) => e.kind === kind && inRange(e, since, until));
    const map = new Map();
    for (const e of rows) {
      const key = e.category + "|" + e.currency;
      const cur = map.get(key) || { category: e.category, currency: e.currency, total: 0, count: 0 };
      cur.total += e.amount; cur.count += 1; map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }

  async function totalsByKind({ since, until } = {}) {
    const rows = (await allEntries()).filter((e) => inRange(e, since, until));
    const map = new Map();
    for (const e of rows) {
      const key = e.kind + "|" + e.currency;
      const cur = map.get(key) || { kind: e.kind, currency: e.currency, total: 0, count: 0 };
      cur.total += e.amount; cur.count += 1; map.set(key, cur);
    }
    return [...map.values()];
  }

  async function dailyTotals({ since, until, kind = "expense", currency = null } = {}) {
    let rows = (await allEntries()).filter((e) => e.kind === kind && inRange(e, since, until));
    if (currency) rows = rows.filter((e) => e.currency === currency);
    const map = new Map();
    for (const e of rows) {
      const day = (e.created_at || "").slice(0, 10);
      const cur = map.get(day) || { day, total: 0, count: 0 };
      cur.total += e.amount; cur.count += 1; map.set(day, cur);
    }
    return [...map.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
  }

  // --- бюджеты ---
  function getBudgets() { return getAll("budgets").then((b) => b.sort((x, y) => x.category.localeCompare(y.category))); }
  async function setBudget(category, monthly_limit, currency = "PLN") {
    const t = await tx("budgets", "readwrite");
    await reqP(t.objectStore("budgets").put({ category, monthly_limit, currency }));
  }
  async function deleteBudget(category) {
    const t = await tx("budgets", "readwrite");
    await reqP(t.objectStore("budgets").delete(category));
  }

  // --- настройки (ключ-значение) ---
  async function getSetting(key, def = null) {
    const t = await tx("settings", "readonly");
    const row = await reqP(t.objectStore("settings").get(key));
    return row ? row.value : def;
  }
  async function setSetting(key, value) {
    const t = await tx("settings", "readwrite");
    await reqP(t.objectStore("settings").put({ key, value }));
  }
  async function allSettings() {
    const rows = await getAll("settings");
    const obj = {};
    for (const r of rows) obj[r.key] = r.value;
    return obj;
  }

  // --- импортированные транзакции (дедуп выписки) ---
  async function isTxImported(txId) {
    const t = await tx("imported_tx", "readonly");
    return !!(await reqP(t.objectStore("imported_tx").get(txId)));
  }
  async function markTxImported(txId, entryId) {
    const t = await tx("imported_tx", "readwrite");
    await reqP(t.objectStore("imported_tx").put({ id: txId, entry_id: entryId, imported_at: Core.localISO(new Date()) }));
  }
  async function countImported() { return (await getAll("imported_tx")).length; }

  // --- цели накоплений и регулярные траты (универсальный CRUD по стору) ---
  async function listAll(store) { return getAll(store); }
  async function putItem(store, item) {
    const t = await tx(store, "readwrite");
    const rec = Object.assign({}, item);
    if (rec.id == null) delete rec.id;             // новый — autoIncrement выдаст id
    const id = await reqP(t.objectStore(store).put(rec));
    rec.id = id; return rec;
  }
  async function getItem(store, id) {
    const t = await tx(store, "readonly"); return reqP(t.objectStore(store).get(Number(id)));
  }
  async function deleteItem(store, id) {
    const t = await tx(store, "readwrite"); await reqP(t.objectStore(store).delete(Number(id)));
  }

  // --- резервная копия: экспорт/импорт/сброс ---
  async function exportAll() {
    const [entries, budgets, settings, imported, goals, recurring] = await Promise.all([
      getAll("entries"), getAll("budgets"), allSettings(), getAll("imported_tx"),
      getAll("goals"), getAll("recurring"),
    ]);
    // В копию кладём только полезные настройки (категории, валюта, курсы, правила).
    const safe = {};
    for (const k of ["categories_custom", "currency", "rates", "cat_rules"]) if (k in settings) safe[k] = settings[k];
    return {
      app: "spendtrack", format: 1, exported_at: Core.localISO(new Date()),
      entries, budgets, settings: safe, imported_tx: imported, goals, recurring,
    };
  }

  const ALL_STORES = ["entries", "budgets", "settings", "imported_tx", "goals", "recurring"];
  async function clearAll() {
    const t = await tx(ALL_STORES, "readwrite");
    await Promise.all(ALL_STORES.map((s) => reqP(t.objectStore(s).clear())));
  }

  // Привести запись из копии к безопасному виду: число — числом, тип — из списка,
  // строки — строками. Кривые записи (без суммы/даты) выбрасываем.
  const KINDS = ["expense", "income", "savings"];
  function cleanEntry(e) {
    if (!e || typeof e !== "object") return null;
    const amount = Number(e.amount);
    if (!isFinite(amount)) return null;
    const created_at = String(e.created_at || "");
    if (!/^\d{4}-\d{2}-\d{2}T/.test(created_at)) return null;
    const out = {
      amount, created_at,
      currency: Core.cleanCurrency(e.currency),
      category: String(e.category || "Прочее").slice(0, 60),
      kind: KINDS.includes(e.kind) ? e.kind : "expense",
      note: String(e.note == null ? "" : e.note).slice(0, 300),
      place: String(e.place == null ? "—" : e.place).slice(0, 60),
      raw_text: String(e.raw_text == null ? "" : e.raw_text).slice(0, 400),
    };
    if (Number.isInteger(e.id) && e.id > 0) out.id = e.id; // сохраняем исходный id
    return out;
  }
  function cleanCustomCats(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map((c) => {
      if (typeof c === "string") return { name: c.slice(0, 40), icon: "", color: "" };
      if (!c || typeof c !== "object" || !c.name) return null;
      const icon = String(c.icon || "").replace(/[<>"'`&]/g, "").slice(0, 8);
      const color = /^#[0-9a-fA-F]{3,8}$/.test(String(c.color || "")) ? c.color : "";
      return { name: String(c.name).slice(0, 40), icon, color };
    }).filter(Boolean);
  }

  async function importAll(data, { keepSettings = false } = {}) {
    if (!data || data.app !== "spendtrack") throw new Error("Это не резервная копия SpendTrack");
    const savedSettings = keepSettings ? await allSettings() : null;
    await clearAll();
    const t = await tx(ALL_STORES, "readwrite");
    const es = t.objectStore("entries");
    let n = 0;
    for (const raw of (data.entries || [])) { const e = cleanEntry(raw); if (e) { es.put(e); n++; } }
    const bs = t.objectStore("budgets");
    for (const b of (data.budgets || [])) {
      if (b && b.category && isFinite(Number(b.monthly_limit))) {
        bs.put({ category: String(b.category).slice(0, 60),
          monthly_limit: Number(b.monthly_limit),
          currency: Core.cleanCurrency(b.currency) });
      }
    }
    const ss = t.objectStore("settings");
    const settings = keepSettings ? savedSettings : (data.settings || {});
    for (const k of Object.keys(settings || {})) {
      if (k === "pin_hash") continue;                       // PIN из копии не принимаем
      let v = settings[k];
      if (k === "categories_custom") v = cleanCustomCats(v); // чистим значки/цвета
      ss.put({ key: k, value: v });
    }
    const ts = t.objectStore("imported_tx");
    for (const x of (data.imported_tx || [])) if (x && x.id) ts.put({ id: String(x.id), entry_id: x.entry_id, imported_at: x.imported_at });
    const gs = t.objectStore("goals");
    for (const g of (data.goals || [])) if (g && g.name) {
      gs.put(Object.assign({}, g, { name: String(g.name).slice(0, 60), currency: Core.cleanCurrency(g.currency) }));
    }
    const rs = t.objectStore("recurring");
    for (const rec of (data.recurring || [])) if (rec) {
      rs.put(Object.assign({}, rec, { currency: Core.cleanCurrency(rec.currency) }));
    }
    await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
    return { entries: n, budgets: (data.budgets || []).length };
  }

  return {
    open, allEntries, listEntries, insertEntry, getEntry, updateEntry, deleteEntry,
    summaryByCategory, totalsByKind, dailyTotals,
    getBudgets, setBudget, deleteBudget,
    getSetting, setSetting, allSettings,
    isTxImported, markTxImported, countImported,
    listAll, putItem, getItem, deleteItem,
    exportAll, importAll, clearAll,
  };
})();
