// Клиент SpendTrack. Без сборки. Диаграмму рисуем сами на SVG, как в Obsidian.
"use strict";

const CAT_COLORS = {
  "Еда": "#ff6b6b", "Доставка": "#ffa94d", "Продукты": "#ffd43b", "Транспорт": "#74c0fc",
  "Ева": "#f783ac", "Аренда": "#9775fa", "Развлечения": "#4dd4ac", "Одежда": "#63e6be",
  "Дом": "#a9e34b", "Уход": "#f06595", "Здоровье": "#20c997", "Образование": "#3bc9db",
  "Подписки": "#748ffc", "Прочее": "#adb5bd", "Доход": "#60a5fa", "Сбережения": "#c084fc",
};
// Значки встроенных категорий (эмодзи); свои категории несут свой значок и цвет.
const CAT_ICONS = {
  "Еда": "🍽️", "Доставка": "🛵", "Продукты": "🛒", "Транспорт": "🚌", "Ева": "💖",
  "Аренда": "🔑", "Развлечения": "🎬", "Одежда": "👕", "Дом": "🛋️", "Уход": "🧴",
  "Здоровье": "💊", "Образование": "🎓", "Подписки": "📺", "Прочее": "📦",
  "Доход": "💰", "Сбережения": "🐷",
};
const ICON_CHOICES = ["🍽️", "🛒", "🚌", "🏠", "🎬", "👕", "🧴", "💊", "🎓", "📺", "🎮",
  "🐶", "🎁", "✈️", "💪", "📚", "🍺", "☕", "💅", "💖", "🚬", "⛽", "🧾", "💰", "🐷", "📦"];
const COLOR_CHOICES = ["#ff6b6b", "#ffa94d", "#ffd43b", "#a9e34b", "#20c997", "#4dd4ac",
  "#74c0fc", "#748ffc", "#9775fa", "#c084fc", "#f06595", "#f783ac", "#adb5bd"];

// Названия месяцев/дней — через Intl под текущую локаль.
const monthShort = (m) => new Intl.DateTimeFormat(I18N.locale(), { month: "short" }).format(new Date(2021, m, 1));
const monthLong = (m) => new Intl.DateTimeFormat(I18N.locale(), { month: "long" }).format(new Date(2021, m, 1));
const dowShort = (d) => new Intl.DateTimeFormat(I18N.locale(), { weekday: "short" }).format(new Date(2020, 10, 1 + d));

const state = {
  config: null,
  period: localStorage.getItem("st-period") || "month",
  currency: null,
  feedKind: "",
  feedSearch: "",    // строка поиска по ленте
  catFilter: null,   // фильтр ленты по категории (тап по легенде)
  periodOffset: 0,   // 0 — текущий период, -1 — предыдущий, +1 — следующий
  summary: null,
};

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};

// Безопасный цвет: только #hex / rgb() / hsl(), иначе игнорируем (защита от
// внедрения в style при восстановлении чужой/повреждённой копии).
const SAFE_COLOR = /^(#[0-9a-fA-F]{3,8}|rgb\([\d\s.,%]+\)|hsl\([\d\s.,%]+\))$/;
// Цвет и значок категории: встроенные дефолты → свои (config.custom_meta) → хеш.
function catMeta(name) {
  const cm = (state.config && state.config.custom_meta && state.config.custom_meta[name]) || null;
  // свой цвет/значок имеет приоритет — так можно перекрасить и встроенную категорию
  let color = (cm && SAFE_COLOR.test(String(cm.color || "")) ? cm.color : "") || CAT_COLORS[name] || "";
  if (!color) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
    color = `hsl(${h} 60% 62%)`;
  }
  let icon = (cm && cm.icon) || CAT_ICONS[name] || "";
  icon = String(icon).replace(/[<>"'`&]/g, "").slice(0, 8); // только безобидный значок
  return { color, icon };
}
function catColor(name) { return catMeta(name).color; }
function catIcon(name) { return catMeta(name).icon; }
function catName(key) { return I18N.catLabel(key); }   // перевод названия категории
// маркер слева от названия: значок-эмодзи, иначе цветная точка
function catMark(name) {
  const ic = catIcon(name);
  return ic ? `<span class="cat-ic">${escapeHtml(ic)}</span>`
    : `<span class="dot" style="background:${catColor(name)}"></span>`;
}

function sym(cur) {
  return (state.config && state.config.currency_symbols[cur]) || cur;
}
function money(amount, cur) {
  cur = cur || state.currency;
  const n = Number(amount || 0).toLocaleString(I18N.locale(), { maximumFractionDigits: 2 });
  return `${n} ${escapeHtml(sym(cur))}`;
}

/* API — теперь локальный: всё считается на устройстве (см. localapi.js) */
async function api(path, opts = {}) {
  try {
    return await LocalAPI.localApi(path, opts);
  } catch (e) {
    throw new Error((e && e.message) || "Ошибка запроса");
  }
}

/* Сохранение файла наружу. content — строка или Uint8Array (для .gz).
   Android → нативный мост в «Загрузки»; iOS → лист «Поделиться»; иначе — Blob. */
function bytesToBase64(content) {
  if (typeof content === "string") return btoa(unescape(encodeURIComponent(content)));
  let bin = "";
  for (let i = 0; i < content.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, content.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}
function saveFile(filename, content, mime) {
  if (window.AndroidBridge && typeof AndroidBridge.saveToDownloads === "function") {
    try {
      const where = AndroidBridge.saveToDownloads(filename, bytesToBase64(content), mime || "application/octet-stream");
      if (where) { toast(I18N.t("saved_to", { w: where }), "success"); return; }
    } catch (e) { /* падаем на обычную загрузку */ }
  }
  if (window.webkit && webkit.messageHandlers && webkit.messageHandlers.saveFile) {
    try {
      webkit.messageHandlers.saveFile.postMessage({ filename, base64: bytesToBase64(content), mime: mime || "application/octet-stream" });
      toast(I18N.t("sharing"), "success");
      return;
    } catch (e) { /* падаем дальше */ }
  }
  // iOS Safari / PWA: системный лист «Поделиться» с файлом (в standalone-режиме
  // обычная <a download> ненадёжна и может увести из приложения).
  const blob = new Blob([content], { type: mime || "application/octet-stream" });
  try {
    const file = new File([blob], filename, { type: mime || "application/octet-stream" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: filename }).catch(() => {});
      toast(I18N.t("sharing"), "success");
      return;
    }
  } catch (e) { /* падаем на обычную загрузку */ }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.target = "_blank"; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* Своё окно подтверждения — вместо системного confirm(), который в WebView
   показывает уродливое «The page at file:// says». Возвращает Promise<bool>. */
function confirmDialog(message, opts = {}) {
  return new Promise((resolve) => {
    const modal = $("#confirmModal");
    $("#confirmText").textContent = message;
    const ok = $("#confirmOk"), cancel = $("#confirmCancel");
    ok.textContent = opts.okText || I18N.t("delete");
    ok.className = "btn " + (opts.danger === false ? "btn--primary" : "btn--danger");
    modal.classList.remove("hidden");
    const done = (val) => {
      modal.classList.add("hidden");
      ok.removeEventListener("click", onOk);
      cancel.removeEventListener("click", onCancel);
      modal.removeEventListener("click", onBackdrop);
      resolve(val);
    };
    const onOk = () => done(true);
    const onCancel = () => done(false);
    const onBackdrop = (e) => { if (e.target === modal) done(false); };
    ok.addEventListener("click", onOk);
    cancel.addEventListener("click", onCancel);
    modal.addEventListener("click", onBackdrop);
  });
}

/* gzip/gunzip для резервных копий — файлы получаются в несколько раз меньше. */
async function gzipString(str) {
  if (!window.CompressionStream) return null;
  const cs = new CompressionStream("gzip");
  const w = cs.writable.getWriter();
  w.write(new TextEncoder().encode(str)); w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}
async function gunzipBytes(bytes) {
  const ds = new DecompressionStream("gzip");
  const w = ds.writable.getWriter();
  w.write(bytes); w.close();
  return new TextDecoder().decode(await new Response(ds.readable).arrayBuffer());
}

/* Toast (с необязательной кнопкой-действием, напр. «Вернуть») */
let toastTimer = null;
function toast(msg, kind = "", action) {
  const t = $("#toast");
  clearTimeout(toastTimer);
  if (action) {
    t.textContent = "";
    const span = document.createElement("span"); span.textContent = msg;
    const btn = document.createElement("button"); btn.className = "toast-action"; btn.textContent = action.label;
    btn.onclick = () => { t.className = "toast " + kind; action.fn(); };
    t.appendChild(span); t.appendChild(btn);
  } else {
    t.textContent = msg;
  }
  t.className = "toast show " + kind;
  toastTimer = setTimeout(() => { t.className = "toast " + kind; }, action ? 6000 : 2600);
}

/* Dates */
function parseDay(s) {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}
function fmtDay(dt) {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
function addDays(dt, n) { const x = new Date(dt); x.setDate(x.getDate() + n); return x; }
function startOfDay(dt) { const x = new Date(dt); x.setHours(0, 0, 0, 0); return x; }
function daysBetween(a, b) { return Math.round((startOfDay(b) - startOfDay(a)) / 86400000); }

function headingForDate(dateStr) {
  const d = parseDay(dateStr);
  const today = startOfDay(new Date());
  const diff = daysBetween(d, today);
  if (diff === 0) return { label: I18N.t("today"), dow: dowShort(d.getDay()) };
  if (diff === 1) return { label: I18N.t("yesterday"), dow: dowShort(d.getDay()) };
  return { label: `${d.getDate()} ${monthLong(d.getMonth())}`, dow: dowShort(d.getDay()) };
}

/* Periods nav */
function renderPeriods() {
  const nav = $("#periods");
  nav.innerHTML = "";
  state.config.periods.forEach((p) => {
    const b = el("button", state.period === p.key ? "active" : "", I18N.periodLabel(p.key));
    b.onclick = () => {
      state.period = p.key;
      state.catFilter = null;   // фильтр по категории сбрасываем при смене периода
      state.periodOffset = 0;   // и возвращаемся к текущему периоду
      localStorage.setItem("st-period", p.key);
      renderPeriods();
      refresh();
    };
    nav.appendChild(b);
  });
}

/* Stats */
function renderStats(s) {
  const box = $("#stats");
  const plabel = I18N.periodLabel(state.period);
  let deltaHtml = "";
  if (state.prevExpense != null && state.prevExpense > 0) {
    const d = Math.round((s.expense_total - state.prevExpense) / state.prevExpense * 100);
    if (d !== 0) {
      const up = d > 0;  // больше трат = хуже (красным), меньше = лучше (зелёным)
      deltaHtml = ` · <span class="delta ${up ? "up" : "down"}" title="${I18N.t("vs_prev")}">${up ? "↑" : "↓"}${Math.abs(d)}%</span>`;
    }
  }
  const cards = [
    { cls: "expense", label: I18N.t("expenses"), dot: "var(--text)", value: money(s.expense_total),
      sub: `${s.entry_count} ${I18N.pluralEntries(s.entry_count)}${deltaHtml}` },
    { cls: "income", label: I18N.t("income"), dot: "var(--income)", value: money(s.income_total), sub: plabel },
    { cls: "savings", label: I18N.t("saved"), dot: "var(--savings)", value: money(s.savings_total), sub: plabel },
    { cls: "balance", label: I18N.t("balance"), dot: "var(--brand)", value: money(s.balance),
      sub: I18N.t("balance_sub") },
  ];
  box.innerHTML = "";
  cards.forEach((c) => {
    const card = el("div", `stat stat--${c.cls}`);
    card.innerHTML =
      `<div class="label"><span class="pin" style="background:${c.dot}"></span>${c.label}</div>` +
      `<div class="value">${c.value}</div><div class="sub">${c.sub}</div>`;
    box.appendChild(card);
  });
}
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

/* Donut */
const R = 72, C = 2 * Math.PI * 72;
function renderDonut(s) {
  const svg = $("#donut");
  const wrap = svg.parentElement;
  let center = wrap.querySelector(".donut-center");
  if (!center) { center = el("div", "donut-center"); wrap.appendChild(center); }

  svg.innerHTML = "";
  const track = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  track.setAttribute("class", "track");
  track.setAttribute("cx", 100); track.setAttribute("cy", 100); track.setAttribute("r", R);
  svg.appendChild(track);

  const cats = s.categories;
  $("#chartEmpty").hidden = cats.length > 0;
  const total = cats.reduce((a, c) => a + c.total, 0);
  // размер шрифта по длине суммы, чтобы «10 627,96 zł» не вылезало за кольцо
  const totalStr = money(total);
  const fs = totalStr.length > 13 ? 16 : totalStr.length > 11 ? 18
    : totalStr.length > 9 ? 21 : totalStr.length > 7 ? 24 : 28;
  center.innerHTML = `<div><div class="total" style="font-size:${fs}px">${totalStr}</div>` +
    `<div class="cap">${escapeHtml(I18N.periodLabel(state.period))}</div></div>`;

  let acc = 0;
  const circles = [];
  cats.forEach((c) => {
    const frac = total ? c.total / total : 0;
    const circ = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circ.setAttribute("cx", 100); circ.setAttribute("cy", 100); circ.setAttribute("r", R);
    circ.setAttribute("stroke", catColor(c.category));
    circ.setAttribute("stroke-dasharray", `0 ${C}`);
    circ.setAttribute("stroke-dashoffset", `${-acc * C}`);
    circ.dataset.target = `${frac * C} ${C - frac * C}`;
    circ.dataset.cat = c.category;
    svg.appendChild(circ);
    circles.push(circ);
    acc += frac;
  });
  requestAnimationFrame(() => circles.forEach((c) => {
    c.setAttribute("stroke-dasharray", c.dataset.target);
  }));

  renderLegend(s, circles);
}

function renderLegend(s, circles) {
  const list = $("#legend");
  list.innerHTML = "";
  s.categories.forEach((c) => {
    const li = el("li", state.catFilter === c.category ? "active" : "");
    li.innerHTML =
      catMark(c.category) +
      `<span class="name">${escapeHtml(catName(c.category))}</span>` +
      `<span class="amt">${money(c.total)}</span>` +
      `<span class="pct">${c.percent}%</span>`;
    li.onmouseenter = () => circles.forEach((ci) =>
      ci.style.opacity = ci.dataset.cat === c.category ? "1" : "0.25");
    li.onmouseleave = () => circles.forEach((ci) => ci.style.opacity = "1");
    li.onclick = () => {            // тап по категории — фильтр ленты по ней
      state.catFilter = state.catFilter === c.category ? null : c.category;
      renderLegend(s, circles);
      renderFeed();
    };
    list.appendChild(li);
  });
  if (s.other_currencies && s.other_currencies.length) {
    const note = el("li", "muted", I18N.t("other_cur") + " " +
      s.other_currencies.map((o) => money(o.total, o.currency)).join(", "));
    note.style.gridColumn = "1 / -1";
    list.appendChild(note);
  }
}

/* Trend */
function buildTrend(s) {
  const byDay = {};
  s.daily.forEach((d) => { byDay[d.day] = d.total; });
  const today = startOfDay(new Date());
  let end = s.until ? addDays(parseDay(s.until), -1) : today;
  if (end > today) end = today;
  let start = s.since ? parseDay(s.since)
    : (s.daily.length ? parseDay(s.daily[0].day) : addDays(end, -13));
  if (daysBetween(start, end) < 6) start = addDays(end, -6);

  if (daysBetween(start, end) > 62) {           // длинный период → по месяцам
    const buckets = {};
    for (let dt = new Date(start); dt <= end; dt = addDays(dt, 1)) {
      const key = `${dt.getFullYear()}-${dt.getMonth()}`;
      buckets[key] = (buckets[key] || 0) + (byDay[fmtDay(dt)] || 0);
    }
    return Object.entries(buckets).map(([k, total]) => {
      const [yr, mo] = k.split("-").map(Number);
      return { label: monthShort(mo), total, tip: cap(monthLong(mo)) + " " + yr };
    });
  }
  const out = [];                                // короткий период → по дням
  for (let dt = new Date(start); dt <= end; dt = addDays(dt, 1)) {
    out.push({ label: dt.getDate(), total: byDay[fmtDay(dt)] || 0,
      tip: `${dt.getDate()} ${monthShort(dt.getMonth())} ${dt.getFullYear()}` });
  }
  return out;
}

// сглаженная линия (Catmull-Rom → кубические Безье) — как на биржевых графиках
function smoothPath(pts) {
  if (!pts.length) return "";
  if (pts.length === 1) return `M ${pts[0][0]} ${pts[0][1]}`;
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

function renderTrend(s) {
  $("#trendLabel").textContent = I18N.periodLabel(state.period);
  const box = $("#trend");
  box.innerHTML = "";
  box.classList.remove("show-hover");
  const data = buildTrend(s);
  if (!data.length) return;

  const W = Math.max(200, box.clientWidth || 320);
  const H = Math.max(120, box.clientHeight || 182);
  const padX = 8, padTop = 16, padBot = 22;
  const max = Math.max(1, ...data.map((d) => d.total));
  const n = data.length;
  const baseY = H - padBot;
  const xAt = (i) => n === 1 ? W / 2 : padX + (i / (n - 1)) * (W - 2 * padX);
  const yAt = (v) => padTop + (1 - v / max) * (H - padTop - padBot);
  const pts = data.map((d, i) => [xAt(i), yAt(d.total)]);
  const line = smoothPath(pts);
  const area = line ? `${line} L ${xAt(n - 1).toFixed(1)} ${baseY} L ${xAt(0).toFixed(1)} ${baseY} Z` : "";

  const NS = "http://www.w3.org/2000/svg";
  const mk = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const svg = mk("svg", { class: "trend-svg", viewBox: `0 0 ${W} ${H}` });

  const gid = "trendGrad";
  const defs = mk("defs", {});
  const grad = mk("linearGradient", { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.appendChild(mk("stop", { offset: "0", "stop-color": "var(--brand)", "stop-opacity": "0.35" }));
  grad.appendChild(mk("stop", { offset: "1", "stop-color": "var(--brand)", "stop-opacity": "0" }));
  defs.appendChild(grad); svg.appendChild(defs);

  svg.appendChild(mk("line", { class: "trend-grid", x1: padX, y1: baseY, x2: W - padX, y2: baseY }));
  svg.appendChild(mk("path", { class: "trend-area", d: area, fill: `url(#${gid})` }));
  svg.appendChild(mk("path", { class: "trend-line", d: line, "vector-effect": "non-scaling-stroke" }));

  // подписи оси X — до ~6 штук, чтобы не наслаивались
  const step = Math.max(1, Math.ceil(n / 6));
  data.forEach((d, i) => {
    if (i % step !== 0 && i !== n - 1) return;
    const t = mk("text", { class: "trend-axis", x: xAt(i).toFixed(1), y: H - 6,
      "text-anchor": i === 0 ? "start" : i === n - 1 ? "end" : "middle" });
    t.textContent = d.label; svg.appendChild(t);
  });

  const cross = mk("line", { class: "trend-cross", x1: 0, y1: padTop - 8, x2: 0, y2: baseY });
  const hot = mk("circle", { class: "trend-hot", cx: 0, cy: 0, r: 4 });
  svg.appendChild(cross); svg.appendChild(hot);
  box.appendChild(svg);

  const tip = el("div", "trend-tip");
  box.appendChild(tip);

  function showAt(idx) {
    idx = Math.max(0, Math.min(n - 1, idx));
    const [px, py] = pts[idx];
    cross.setAttribute("x1", px); cross.setAttribute("x2", px);
    hot.setAttribute("cx", px); hot.setAttribute("cy", py);
    tip.innerHTML = `<div class="tv">${money(data[idx].total)}</div><div class="tp">${escapeHtml(data[idx].tip)}</div>`;
    const r = svg.getBoundingClientRect(), b = box.getBoundingClientRect();
    const left = (r.left - b.left) + (px / W) * r.width;
    const top = (r.top - b.top) + (py / H) * r.height;
    tip.style.left = Math.max(48, Math.min((box.clientWidth || W) - 48, left)) + "px";
    tip.style.top = top + "px";
    box.classList.add("show-hover");
  }
  function onMove(ev) {
    const r = svg.getBoundingClientRect();
    const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
    const vx = (clientX - r.left) / r.width * W;              // экранные px → координаты viewBox
    const idx = n === 1 ? 0 : Math.round((vx - padX) / (W - 2 * padX) * (n - 1));
    showAt(idx);
  }
  svg.addEventListener("pointerdown", onMove);
  svg.addEventListener("pointermove", onMove);
  svg.addEventListener("pointerleave", () => box.classList.remove("show-hover"));
  svg.addEventListener("touchmove", onMove, { passive: true });
}

/* Budgets */
async function renderBudgets() {
  const box = $("#budgets");
  const { budgets } = await api(`/budgets?poffset=${state.periodOffset || 0}`);
  box.innerHTML = "";
  if (!budgets.length) {
    box.appendChild(el("div", "empty", I18N.t("budgets_empty")));
    return;
  }
  budgets.forEach((b) => {
    const pct = Math.min(100, b.percent);
    const cls = b.over ? "over" : (b.percent >= 80 ? "warn" : "");
    const card = el("div", `budget ${cls}`);
    card.innerHTML =
      `<div class="top"><span class="cat">${catMark(b.category)}${escapeHtml(catName(b.category))}</span>` +
      `<span class="nums">${money(b.spent, b.currency)} / ${money(b.monthly_limit, b.currency)}</span></div>` +
      `<div class="bar"><div class="fill" style="width:${pct}%"></div></div>` +
      `<div class="pct">${b.percent}%${b.over ? " · " + I18N.t("over") : ""}</div>`;
    card.onclick = () => openBudget(b.category, b.monthly_limit);
    box.appendChild(card);
  });
}

// чип активного фильтра ленты по категории (с крестиком сброса)
function renderFeedFilter() {
  let chip = document.getElementById("feedFilter");
  if (!state.catFilter) { if (chip) chip.remove(); return; }
  if (!chip) {
    chip = el("div", "feed-filter"); chip.id = "feedFilter";
    const feed = $("#feed"); feed.parentElement.insertBefore(chip, feed);
  }
  chip.innerHTML = catMark(state.catFilter) +
    `<span>${escapeHtml(catName(state.catFilter))}</span>` +
    `<button class="chip-x" aria-label="${I18N.t("close")}">✕</button>`;
  chip.querySelector(".chip-x").onclick = () => { state.catFilter = null; refresh(); };
}

/* Feed */
async function renderFeed() {
  const box = $("#feed");
  let { entries } = await api(`/entries?period=${state.period}&poffset=${state.periodOffset || 0}` +
    (state.feedKind ? `&kind=${state.feedKind}` : ""));
  if (state.catFilter) entries = entries.filter((e) => e.category === state.catFilter);
  if (state.feedSearch) {
    const q = state.feedSearch.toLowerCase();
    entries = entries.filter((e) =>
      (e.note || "").toLowerCase().includes(q) ||
      catName(e.category).toLowerCase().includes(q) ||
      String(e.category).toLowerCase().includes(q) ||
      String(e.amount).includes(q));
  }
  renderFeedFilter();
  box.innerHTML = "";
  $("#feedEmpty").hidden = entries.length > 0;

  const groups = {};
  entries.forEach((e) => { (groups[e.date] = groups[e.date] || []).push(e); });
  const days = Object.keys(groups).sort().reverse();

  days.forEach((date) => {
    const items = groups[date];
    // сумма дня — с конвертацией в валюту отображения: записи могут быть в разных
    // валютах (грн + злотые), и «130 ₴» не должна превращаться в «130 zł»
    const rates = (state.config && state.config.rates) || Core.DEFAULT_RATES;
    const daySum = items.filter((e) => e.kind === "expense")
      .reduce((a, e) => a + Core.convert(e.amount, e.currency, state.currency, rates), 0);
    const { label, dow } = headingForDate(date);
    const group = el("div", "day-group");
    const head = el("div", "day-head");
    head.innerHTML = `<div><span class="date">${label}</span><span class="dow">${dow}</span></div>` +
      `<span class="sum">${money(daySum)}</span>`;
    group.appendChild(head);

    items.forEach((e) => {
      const row = el("div", `row ${e.kind}`);
      const badge = e.kind === "income" ? `<span class="kind-badge">${I18N.t("b_income")}</span>`
        : e.kind === "savings" ? `<span class="kind-badge">${I18N.t("b_saved")}</span>` : "";
      const sign = e.kind === "expense" ? "−" : "+";
      row.innerHTML =
        `<span class="id">#${e.id}</span>` +
        `<span class="time">${e.time}</span>` +
        `<span class="body"><span class="cat">${catMark(e.category)}${escapeHtml(catName(e.category))}</span>` +
        `${badge}<span class="note">${escapeHtml(e.note)}</span></span>` +
        `<span class="amt">${sign}${money(e.amount, e.currency)}</span>` +
        `<button class="del" title="${I18N.t("delete")}" aria-label="${I18N.t("delete")}">✕</button>`;
      row.querySelector(".del").onclick = (ev) => { ev.stopPropagation(); deleteEntry(e); };
      row.onclick = () => openEdit(e);
      group.appendChild(row);
    });
    box.appendChild(group);
  });
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/* Quick add */
let previewTimer = null;
function onComposerInput() {
  const text = $("#addInput").value.trim();
  const box = $("#preview");
  clearTimeout(previewTimer);
  if (!text) { box.hidden = true; return; }
  previewTimer = setTimeout(async () => {
    try {
      const res = await api("/parse-preview", { method: "POST", body: JSON.stringify({ text }) });
      if (!res.ok) { box.hidden = false; box.className = "preview error"; box.textContent = "⚠️ " + res.error; return; }
      const p = res.parsed;
      box.hidden = false; box.className = "preview";
      const kindWord = p.kind === "income" ? I18N.t("b_income") : p.kind === "savings" ? I18N.t("f_savings").toLowerCase() : "";
      box.innerHTML =
        `<span class="chip">${catMark(p.category)}${escapeHtml(catName(p.category))}</span>` +
        `<span class="amount">${money(p.amount, p.currency)}</span>` +
        (kindWord ? `<span class="chip">${kindWord}</span>` : "") +
        (p.note ? `<span class="muted-note">${escapeHtml(p.note)}</span>` : "") +
        (p.backdated ? `<span class="chip">🗓 ${p.created_at.slice(0, 10).split("-").reverse().join(".")}</span>` : "");
    } catch (e) { /* auth handled elsewhere */ }
  }, 220);
}

async function submitComposer(ev) {
  ev.preventDefault();
  const input = $("#addInput");
  const text = input.value.trim();
  if (!text) return;
  try {
    const { entry } = await api("/entries", { method: "POST", body: JSON.stringify({ text }) });
    input.value = ""; $("#preview").hidden = true;
    toast(I18N.t("added_toast", { id: entry.id, c: catName(entry.category), m: money(entry.amount, entry.currency) }), "success");
    await refresh();
    input.focus();
  } catch (e) {
    if (e.message !== "auth") toast("⚠️ " + e.message, "error");
  }
}

/* Delete / Edit — удаляем сразу, даём «Вернуть» (undo) на 6 секунд */
async function deleteEntry(e) {
  const snapshot = Object.assign({}, e);
  try {
    await api(`/entries/${e.id}`, { method: "DELETE" });
    await refresh();
    toast(I18N.t("deleted_toast", { id: e.id }), "success",
      { label: I18N.t("undo"), fn: () => undoDelete(snapshot) });
  } catch (err) { if (err.message !== "auth") toast("⚠️ " + err.message, "error"); }
}
async function undoDelete(e) {
  try {
    await api("/entries/restore", { method: "POST", body: JSON.stringify({ entry: {
      amount: e.amount, currency: e.currency, category: e.category, kind: e.kind,
      note: e.note, place: e.place, created_at: e.created_at } }) });
    await refresh();
    toast(I18N.t("restored_one"), "success");
  } catch (err) { if (err.message !== "auth") toast("⚠️ " + err.message, "error"); }
}

let editing = null;
function openEdit(e) {
  editing = e;
  $("#editId").textContent = `#${e.id}`;
  $("#editAmount").value = e.amount;
  fillSelect($("#editCurrency"), state.config.currencies, e.currency);
  // в списке может не быть категории записи (напр. удалённая «Ева») — добавим её
  const cats = state.config.categories.includes(e.category)
    ? state.config.categories : state.config.categories.concat([e.category]);
  fillSelect($("#editCategory"), cats, e.category, catOptionLabel);
  $("#editKind").value = e.kind;
  $("#editNote").value = e.note;
  $("#editDate").value = (e.created_at || "").slice(0, 16);
  $("#editModal").classList.remove("hidden");
}
function closeEdit() { $("#editModal").classList.add("hidden"); editing = null; }

async function saveEdit(ev) {
  ev.preventDefault();
  if (!editing) return;
  const amount = parseFloat($("#editAmount").value);
  if (!(amount > 0)) { toast(I18N.t("amount_gt0"), "error"); return; }
  const dateVal = $("#editDate").value;
  const body = {
    amount,
    currency: $("#editCurrency").value,
    category: $("#editCategory").value,
    kind: $("#editKind").value,
    note: $("#editNote").value,
  };
  // дату трогаем только если поле корректно заполнено (иначе не портим created_at)
  if (dateVal && dateVal.length >= 16) body.created_at = dateVal.slice(0, 16) + ":00";
  try {
    await api(`/entries/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
    toast(I18N.t("saved_toast", { id: editing.id }), "success");
    closeEdit();
    await refresh();
  } catch (err) { if (err.message !== "auth") toast("⚠️ " + err.message, "error"); }
}

/* Budgets modal */
function openBudget(category, limit) {
  fillCategorySelect($("#budgetCategory"), category || state.config.categories[0]);
  $("#budgetLimit").value = limit || "";
  $("#budgetDelete").style.visibility = category ? "visible" : "hidden";
  $("#budgetModal").classList.remove("hidden");
}
function closeBudget() { $("#budgetModal").classList.add("hidden"); }

async function saveBudget(ev) {
  ev.preventDefault();
  const category = $("#budgetCategory").value;
  const monthly_limit = parseFloat($("#budgetLimit").value);
  if (!(monthly_limit > 0)) { toast(I18N.t("limit_gt0"), "error"); return; }
  try {
    await api("/budgets", { method: "PUT",
      body: JSON.stringify({ category, monthly_limit, currency: state.config.default_currency }) });
    closeBudget(); await renderBudgets();
    toast(I18N.t("limit_saved", { c: catName(category) }), "success");
  } catch (err) { if (err.message !== "auth") toast("⚠️ " + err.message, "error"); }
}
async function deleteBudgetCurrent() {
  const category = $("#budgetCategory").value;
  try {
    await api(`/budgets/${encodeURIComponent(category)}`, { method: "DELETE" });
    closeBudget(); await renderBudgets();
    toast(I18N.t("limit_removed", { c: catName(category) }), "success");
  } catch (err) { if (err.message !== "auth") toast("⚠️ " + err.message, "error"); }
}

function fillSelect(sel, options, value, labelFn) {
  sel.innerHTML = "";
  options.forEach((o) => {
    const opt = el("option"); opt.value = o; opt.textContent = labelFn ? labelFn(o) : o;
    if (o === value) opt.selected = true;
    sel.appendChild(opt);
  });
}
// подпись категории в выпадающем списке: значок + переведённое имя
const catOptionLabel = (c) => (catIcon(c) ? catIcon(c) + " " : "") + catName(c);
function fillCategorySelect(sel, value) {
  fillSelect(sel, state.config.categories, value, catOptionLabel);
}

/* Theme / auth — режим auto (по системе) / light / dark */
function systemTheme() {
  return window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}
function resolveTheme(mode) { return mode === "auto" ? systemTheme() : (mode === "light" ? "light" : "dark"); }
function applyTheme(mode) {
  const resolved = resolveTheme(mode);
  document.documentElement.dataset.theme = resolved;
  localStorage.setItem("st-theme", mode);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = resolved === "light" ? "#f4f6fb" : "#0e1016";
}
function toggleTheme() {
  const cur = localStorage.getItem("st-theme") || "auto";
  const next = cur === "auto" ? "light" : cur === "light" ? "dark" : "auto";
  applyTheme(next);
  toast(I18N.t("theme_" + next), "");
}
// если режим «авто» — следим за сменой системной темы
if (window.matchMedia) {
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if ((localStorage.getItem("st-theme") || "auto") === "auto") applyTheme("auto");
  });
}


/* Данные и настройки: импорт выписки, резервная копия, PIN, категории, сброс */
async function openData() {
  $("#dataModal").classList.remove("hidden");
  await renderData();
}
function closeData() { $("#dataModal").classList.add("hidden"); }

let _newCatIcon = ICON_CHOICES[0], _newCatColor = COLOR_CHOICES[0];
let _editingKey = null;   // правим существующую категорию (ключ), иначе создаём новую

async function renderData() {
  const body = $("#dataBody");
  const cfg = state.config || {};
  const cats = cfg.categories || [];
  const custom = cats.filter((c) => !Core.categoryNames().includes(c));
  const T = I18N.t;

  const curOpts = (cfg.currencies || []).map((c) =>
    '<option value="' + c + '"' + (c === cfg.default_currency ? " selected" : "") + ">" + c + "</option>").join("");
  const langOpts = I18N.SUPPORTED.map((l) =>
    '<option value="' + l + '"' + (l === I18N.getLang() ? " selected" : "") + ">" + I18N.LANG_NAMES[l] + "</option>").join("");
  // курсы валют: строка на каждую валюту, кроме базовой PLN
  const RATE_BASE = "PLN";
  const rates = cfg.rates || {};
  const rateRows = (cfg.currencies || []).filter((c) => c !== RATE_BASE).map((c) =>
    '<div class="row-inline" style="align-items:center;margin-top:6px">' +
      '<span style="min-width:96px">1 ' + c + " = </span>" +
      '<input class="input rate-inp" data-cur="' + c + '" type="number" step="0.0001" min="0" ' +
        'style="max-width:120px" value="' + (Number(rates[c]) || "") + '" />' +
      "<span>" + RATE_BASE + "</span></div>").join("");

  const customHtml = custom.length
    ? custom.map((c) => '<span class="chip cat-chip">' +
        '<span class="chip-body" data-edit="' + escapeHtml(c) + '">' +
          (catIcon(c) ? catIcon(c) + " " : "") + escapeHtml(c) + "</span>" +
        '<span class="chip-x" data-del="' + escapeHtml(c) + '" title="' + T("delete") + '">✕</span></span>').join("")
    : '<span class="muted">' + T("none_yet") + "</span>";
  // встроенные категории — тоже редактируемые (значок/цвет), без удаления
  const builtinHtml = Core.categoryNames().map((c) => '<span class="chip cat-chip">' +
    '<span class="chip-body" data-edit="' + escapeHtml(c) + '">' +
    (catIcon(c) ? catIcon(c) + " " : "") + escapeHtml(catName(c)) + "</span></span>").join("");
  const iconGrid = ICON_CHOICES.map((ic) =>
    '<button type="button" class="ic-pick' + (ic === _newCatIcon ? " on" : "") + '" data-ic="' + ic + '">' + ic + "</button>").join("");
  const colorGrid = COLOR_CHOICES.map((col) =>
    '<button type="button" class="col-pick' + (col === _newCatColor ? " on" : "") + '" data-col="' + col + '" style="background:' + col + '"></button>').join("");
  const installHtml = _deferredInstall
    ? '<div style="margin-bottom:14px"><button class="btn btn--primary btn--sm" id="installBtn">📲 ' + T("install_app") + "</button></div>"
    : "";

  // регулярные траты и правила категорий
  const recurring = (await api("/recurring").catch(() => ({ recurring: [] }))).recurring || [];
  const recMonthly = recurring.filter((r) => r.kind === "expense")
    .reduce((a, r) => a + Core.convert(r.amount || 0, r.currency, cfg.default_currency, cfg.rates || Core.DEFAULT_RATES), 0);
  const recHtml = recurring.length
    ? recurring.map((r) => '<span class="chip cat-chip"><span class="chip-body">' +
        escapeHtml(money(r.amount, r.currency)) + " " + escapeHtml(catName(r.category)) +
        " · " + T("recurring_day") + " " + r.day + "</span>" +
        '<span class="chip-x" data-rec="' + r.id + '" title="' + T("delete") + '">✕</span></span>').join("")
    : '<span class="muted">' + T("recurring_none") + "</span>";
  const rules = cfg.rules || [];
  const rulesHtml = rules.length
    ? rules.map((r) => '<span class="chip cat-chip"><span class="chip-body">' +
        escapeHtml(r.match) + " → " + escapeHtml(catName(r.category)) + "</span>" +
        '<span class="chip-x" data-rule="' + escapeHtml(r.match) + '" title="' + T("delete") + '">✕</span></span>').join("")
    : '<span class="muted">' + T("none_yet") + "</span>";
  const ruleCatOpts = (cfg.categories || []).map((c) =>
    '<option value="' + escapeHtml(c) + '">' + escapeHtml(catName(c)) + "</option>").join("");

  body.innerHTML =
    installHtml +
    '<div class="bank-import">' +
      '<h3 class="bank-h">' + T("import_csv") + "</h3>" +
      '<p class="muted">' + T("import_hint") + "</p>" +
      '<input type="file" id="stmtFile" accept=".csv,.txt,.xlsx,text/csv,text/comma-separated-values,application/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,application/octet-stream" class="input" />' +
      '<div id="stmtPreview" class="muted" style="margin-top:8px;"></div>' +
      '<button class="btn btn--primary btn--sm" id="stmtConfirm" hidden style="margin-top:10px;">' + T("import_btn") + "</button>" +
    "</div>" +

    '<hr class="bank-sep"><div><h3 class="bank-h">' + T("backup") + "</h3>" +
      '<p class="muted">' + T("backup_hint") + "</p>" +
      '<div class="modal-actions" style="justify-content:flex-start;gap:8px;flex-wrap:wrap">' +
        '<button class="btn btn--primary btn--sm" id="backupBtn">' + T("backup_save") + "</button>" +
        '<button class="btn btn--ghost btn--sm" id="exportCsvBtn">' + T("export_csv") + "</button>" +
        '<label class="btn btn--ghost btn--sm" style="cursor:pointer">' + T("backup_restore") +
          '<input type="file" id="restoreFile" accept=".json,.gz,application/json,application/gzip" hidden /></label>' +
      "</div></div>" +

    '<hr class="bank-sep"><div><h3 class="bank-h">' + T("categories_title") + "</h3>" +
      '<p class="muted" style="margin:0 0 8px">' + T("cat_edit_hint") + "</p>" +
      '<div class="chips" style="margin-bottom:8px">' + builtinHtml + "</div>" +
      '<div id="customCats" class="chips">' + customHtml + "</div>" +
      '<div class="picker"><div class="icon-grid" id="iconGrid">' + iconGrid + "</div>" +
      '<div class="color-grid" id="colorGrid">' + colorGrid + "</div></div>" +
      '<div class="row-inline" style="margin-top:10px">' +
        '<input id="newCat" class="input" placeholder="' + T("new_cat_ph") + '" />' +
        '<button class="btn btn--ghost btn--sm" id="addCatBtn">' + T("add") + "</button>" +
      "</div></div>" +

    '<hr class="bank-sep"><div><h3 class="bank-h">' + T("language") + "</h3>" +
      '<select id="langSelect" class="select">' + langOpts + "</select></div>" +

    '<hr class="bank-sep"><div><h3 class="bank-h">' + T("main_currency") + "</h3>" +
      '<select id="curSelect" class="select">' + curOpts + "</select></div>" +

    '<hr class="bank-sep"><div><h3 class="bank-h">' + T("rates_title") + "</h3>" +
      '<p class="muted" style="margin:0 0 8px">' + T("rates_hint") + "</p>" +
      rateRows +
      '<div class="row-inline" style="margin-top:10px">' +
        '<button class="btn btn--ghost btn--sm" id="saveRatesBtn">' + T("save") + "</button>" +
      "</div></div>" +

    '<hr class="bank-sep"><div><h3 class="bank-h">' + T("recurring_title") + "</h3>" +
      '<p class="muted" style="margin:0 0 8px">' + T("recurring_hint") +
        (recMonthly > 0 ? " <b>" + T("recurring_monthly", { m: money(recMonthly, cfg.default_currency) }) + "</b>" : "") + "</p>" +
      '<div id="recList" class="chips">' + recHtml + "</div>" +
      '<div class="row-inline" style="margin-top:10px">' +
        '<input id="recText" class="input" placeholder="' + T("recurring_text_ph") + '" />' +
        '<input id="recDay" class="input" type="number" min="1" max="28" value="1" style="max-width:70px" />' +
        '<button class="btn btn--ghost btn--sm" id="addRecBtn">' + T("add") + "</button>" +
      "</div></div>" +

    '<hr class="bank-sep"><div><h3 class="bank-h">' + T("rules_title") + "</h3>" +
      '<p class="muted" style="margin:0 0 8px">' + T("rules_hint") + "</p>" +
      '<div id="ruleList" class="chips">' + rulesHtml + "</div>" +
      '<div class="row-inline" style="margin-top:10px">' +
        '<input id="ruleMatch" class="input" placeholder="' + T("rule_match_ph") + '" />' +
        '<select id="ruleCat" class="select">' + ruleCatOpts + "</select>" +
        '<button class="btn btn--ghost btn--sm" id="addRuleBtn">' + T("add") + "</button>" +
      "</div></div>" +

    '<hr class="bank-sep"><div><h3 class="bank-h">' + T("danger") + "</h3>" +
      '<button class="btn btn--danger btn--sm" id="resetBtn">' + T("delete_all") + "</button></div>";

  const ib = $("#installBtn"); if (ib) ib.onclick = doInstall;
  $("#stmtFile").onchange = onStatementFile;
  $("#stmtConfirm").onclick = onStatementConfirm;
  $("#backupBtn").onclick = doBackup;
  $("#exportCsvBtn").onclick = doExportCsv;
  $("#restoreFile").onchange = onRestoreFile;
  $("#addCatBtn").onclick = addCategory;
  $("#newCat").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addCategory(); } });
  $("#newCat").addEventListener("input", () => {   // печатаю имя → создаю новую категорию
    _editingKey = null; $("#addCatBtn").textContent = I18N.t("add");
  });
  document.querySelectorAll("#customCats .chip-x").forEach((x) =>
    x.onclick = () => removeCategory(x.dataset.del));
  document.querySelectorAll("#dataBody .chip-body[data-edit]").forEach((b) =>
    b.onclick = () => editCustomCategory(b.dataset.edit));
  $("#addRecBtn").onclick = addRecurring;
  document.querySelectorAll("#recList .chip-x").forEach((x) => x.onclick = () => removeRecurring(x.dataset.rec));
  $("#addRuleBtn").onclick = addRule;
  document.querySelectorAll("#ruleList .chip-x").forEach((x) => x.onclick = () => removeRule(x.dataset.rule));
  document.querySelectorAll("#iconGrid .ic-pick").forEach((b) => b.onclick = () => {
    _newCatIcon = b.dataset.ic;
    document.querySelectorAll("#iconGrid .ic-pick").forEach((x) => x.classList.toggle("on", x === b));
  });
  document.querySelectorAll("#colorGrid .col-pick").forEach((b) => b.onclick = () => {
    _newCatColor = b.dataset.col;
    document.querySelectorAll("#colorGrid .col-pick").forEach((x) => x.classList.toggle("on", x === b));
  });
  $("#langSelect").onchange = (e) => setLanguage(e.target.value);
  $("#curSelect").onchange = (e) => setDefaultCurrency(e.target.value);
  $("#saveRatesBtn").onclick = saveRates;
  $("#resetBtn").onclick = doReset;
}

// сохранить курсы валют (для конвертации в сводной аналитике)
async function saveRates() {
  const rates = { PLN: 1 };
  document.querySelectorAll(".rate-inp").forEach((i) => {
    const v = parseFloat(i.value); if (v > 0) rates[i.dataset.cur] = v;
  });
  try {
    await api("/settings/rates", { method: "POST", body: JSON.stringify({ rates }) });
    await reloadConfig();
    await refresh();
    toast(I18N.t("rates_saved"), "success");
  } catch (e) { if (e.message !== "auth") toast("⚠️ " + e.message, "error"); }
}

function refreshHints() {
  const hint = $("#hint");
  if (hint) hint.innerHTML = I18N.examples().map((ex) => "<code>" + escapeHtml(ex) + "</code>").join("");
}

async function setLanguage(l) {
  I18N.setLang(l);
  I18N.apply();
  refreshHints();
  renderPeriods();          // кнопки периодов рисуются динамически — обновляем вручную
  await renderData();
  await refresh();
  toast(I18N.t("lang_set"), "success");
}

async function reloadConfig() { state.config = await api("/config"); }

async function doBackup() {
  try {
    const data = await api("/backup");
    const json = JSON.stringify(data);
    const stamp = Core.localISO(new Date()).slice(0, 10);
    const gz = await gzipString(json);  // максимально сжатый файл, бережём память
    if (gz) saveFile(`spendtrack-backup-${stamp}.json.gz`, gz, "application/gzip");
    else saveFile(`spendtrack-backup-${stamp}.json`, json, "application/json");
  } catch (e) { if (e.message !== "auth") toast("⚠️ " + e.message, "error"); }
}

async function doExportCsv() {
  try {
    const { entries } = await api(`/entries?period=${state.period}&limit=100000`);
    let csv = "﻿" + I18N.t("csv_header") + "\n";
    entries.forEach((e) => {
      const note = (e.note || "").replace(/"/g, '""');
      const kind = e.kind === "income" ? I18N.t("t_income") : e.kind === "savings" ? I18N.t("t_savings") : I18N.t("t_expense");
      csv += [e.id, e.date, e.time, kind, catName(e.category), e.amount, e.currency, `"${note}"`].join(";") + "\n";
    });
    saveFile(`spendtrack-${state.period}.csv`, csv, "text/csv;charset=utf-8");
  } catch (e) { if (e.message !== "auth") toast("⚠️ " + e.message, "error"); }
}

function onRestoreFile(ev) {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    let text;
    try {
      const bytes = new Uint8Array(reader.result);
      // .gz распознаём по сигнатуре 1f 8b и распаковываем
      if (bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
        if (!window.DecompressionStream) { toast(I18N.t("no_gz"), "error"); return; }
        text = await gunzipBytes(bytes);
      } else {
        text = new TextDecoder().decode(bytes);
      }
    } catch (e) { toast(I18N.t("read_fail"), "error"); return; }
    let data;
    try { data = JSON.parse(text); }
    catch (e) { toast(I18N.t("not_backup"), "error"); return; }
    if (!(await confirmDialog(I18N.t("restore_confirm"), { okText: I18N.t("backup_restore") }))) return;
    try {
      const r = await api("/restore", { method: "POST", body: JSON.stringify({ data }) });
      toast(I18N.t("restored", { n: r.entries }), "success");
      closeData();
      await boot();
    } catch (e) { if (e.message !== "auth") toast("⚠️ " + e.message, "error"); }
  };
  reader.readAsArrayBuffer(file);
}

// загрузить категорию (встроенную или свою) в форму для правки значка/цвета
function editCustomCategory(name) {
  _editingKey = name;                       // правим именно эту категорию (по ключу)
  $("#newCat").value = catName(name);       // показываем переведённое имя
  _newCatIcon = catIcon(name) || ICON_CHOICES[0];
  _newCatColor = catMeta(name).color || COLOR_CHOICES[0];
  document.querySelectorAll("#iconGrid .ic-pick").forEach((b) => b.classList.toggle("on", b.dataset.ic === _newCatIcon));
  document.querySelectorAll("#colorGrid .col-pick").forEach((b) => b.classList.toggle("on", b.dataset.col === _newCatColor));
  $("#addCatBtn").textContent = I18N.t("save");
  $("#newCat").focus();
}

async function addCategory() {
  const name = _editingKey || $("#newCat").value.trim();   // правка по ключу или новая по имени
  if (!name) return;
  try {
    await api("/settings/category", { method: "POST",
      body: JSON.stringify({ name, icon: _newCatIcon, color: _newCatColor }) });
    _editingKey = null;
    await reloadConfig();
    await renderData();
    await refresh();
    toast(I18N.t("cat_added", { n: catName(name) }), "success");
  } catch (e) { if (e.message !== "auth") toast("⚠️ " + e.message, "error"); }
}

async function removeCategory(name) {
  try {
    await api(`/settings/category/${encodeURIComponent(name)}`, { method: "DELETE" });
    await reloadConfig();
    await renderData();
  } catch (e) { if (e.message !== "auth") toast("⚠️ " + e.message, "error"); }
}

async function addRecurring() {
  const text = $("#recText").value.trim();
  const day = parseInt($("#recDay").value, 10) || 1;
  if (!text) return;
  try {
    await api("/recurring", { method: "POST", body: JSON.stringify({ text, day }) });
    $("#recText").value = "";
    await renderData();
    await refresh();
  } catch (e) { if (e.message !== "auth") toast("⚠️ " + e.message, "error"); }
}
async function removeRecurring(id) {
  try { await api(`/recurring/${id}`, { method: "DELETE" }); await renderData(); }
  catch (e) { if (e.message !== "auth") toast("⚠️ " + e.message, "error"); }
}
async function addRule() {
  const match = $("#ruleMatch").value.trim();
  const category = $("#ruleCat").value;
  if (!match || !category) return;
  try {
    await api("/settings/rule", { method: "POST", body: JSON.stringify({ match, category }) });
    $("#ruleMatch").value = "";
    await reloadConfig();
    await renderData();
  } catch (e) { if (e.message !== "auth") toast("⚠️ " + e.message, "error"); }
}
async function removeRule(match) {
  try {
    await api(`/settings/rule/${encodeURIComponent(match)}`, { method: "DELETE" });
    await reloadConfig();
    await renderData();
  } catch (e) { if (e.message !== "auth") toast("⚠️ " + e.message, "error"); }
}

async function setDefaultCurrency(cur) {
  try {
    await api("/settings/currency", { method: "POST", body: JSON.stringify({ currency: cur }) });
    await reloadConfig();
    state.currency = cur;
    await refresh();
    toast(I18N.t("cur_set", { c: cur }), "success");
  } catch (e) { if (e.message !== "auth") toast("⚠️ " + e.message, "error"); }
}

async function doReset() {
  if (!(await confirmDialog(I18N.t("reset_confirm1"), { okText: I18N.t("delete_all_btn") }))) return;
  if (!(await confirmDialog(I18N.t("reset_confirm2"), { okText: I18N.t("yes_delete") }))) return;
  try {
    await api("/reset", { method: "POST" });
    toast(I18N.t("wiped"), "success");
    closeData();
    await boot();
  } catch (e) { if (e.message !== "auth") toast("⚠️ " + e.message, "error"); }
}

let _stmtB64 = null;
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result);
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      resolve(btoa(bin));
    };
    reader.readAsArrayBuffer(file);
  });
}

async function onStatementFile(ev) {
  const file = ev.target.files && ev.target.files[0];
  const prev = $("#stmtPreview");
  $("#stmtConfirm").hidden = true;
  _stmtB64 = null;
  if (!file) return;
  prev.textContent = I18N.t("reading");
  try {
    _stmtB64 = await fileToBase64(file);
    const r = await api("/import/preview", { method: "POST", body: JSON.stringify({ data_b64: _stmtB64 }) });
    if (!r.count) { prev.innerHTML = '<span class="error">' + I18N.t("import_no_tx") + "</span>"; return; }
    const toImport = (r.new || 0) + (r.new_income || 0);
    const incPart = r.new_income ? " + " + r.new_income + " " + I18N.t("income").toLowerCase() : "";
    prev.innerHTML = I18N.t("import_found", { n: r.count, m: r.new }) + incPart +
      (r.internal ? '<br><span class="muted">' + I18N.t("import_skip", { n: r.internal }) + "</span>" : "") +
      (toImport === 0 ? I18N.t("import_all_done") : "");
    $("#stmtConfirm").hidden = toImport === 0;
  } catch (e) { if (e.message !== "auth") prev.innerHTML = '<span class="error">' + escapeHtml(e.message) + "</span>"; }
}

async function onStatementConfirm() {
  if (!_stmtB64) return;
  const btn = $("#stmtConfirm");
  btn.disabled = true; btn.textContent = I18N.t("importing");
  try {
    const r = await api("/import/confirm", { method: "POST", body: JSON.stringify({ data_b64: _stmtB64 }) });
    const incPart = r.imported_income ? " · +" + r.imported_income + " " + I18N.t("income").toLowerCase() : "";
    toast(I18N.t("import_done", { n: r.imported, s: r.internal_skipped || 0 }) + incPart, "success");
    _stmtB64 = null;
    await refresh();
    await renderData();
  } catch (e) { if (e.message !== "auth") toast("⚠️ " + e.message, "error"); }
  finally { btn.disabled = false; btn.textContent = I18N.t("import_btn"); }
}

/* Refresh / boot */
async function refresh() {
  const po = state.periodOffset || 0;
  const cur = encodeURIComponent(state.currency);
  state.summary = await api(`/summary?period=${state.period}&currency=${cur}&poffset=${po}`);
  // сравнение с предыдущим периодом (для «месяц к месяцу»)
  state.prevExpense = null;
  if (state.period !== "all") {
    const prev = await api(`/summary?period=${state.period}&currency=${cur}&poffset=${po - 1}`);
    state.prevExpense = prev.expense_total;
  }
  renderPeriodNav();
  const title = periodTitle(state.summary);
  $("#chartPeriod").textContent = title;
  renderStats(state.summary);
  renderDonut(state.summary);
  renderTrend(state.summary);
  renderInsights(state.summary);
  await renderFeed();
  await renderBudgets();
  await renderGoals();
}

/* Цели накоплений */
async function renderGoals() {
  const { goals } = await api("/goals");
  const box = $("#goals");
  box.innerHTML = "";
  if (!goals.length) { box.appendChild(el("div", "empty", I18N.t("goals_empty"))); return; }
  goals.forEach((g) => {
    const card = el("div", `budget ${g.percent >= 100 ? "done" : ""}`);
    card.innerHTML =
      `<div class="top"><span class="cat">🐷 ${escapeHtml(g.name)}</span>` +
      `<span class="nums">${money(g.saved, g.currency)} / ${money(g.target, g.currency)}</span></div>` +
      `<div class="bar"><div class="fill" style="width:${Math.min(100, g.percent)}%"></div></div>` +
      `<div class="pct">${g.percent}%${g.percent >= 100 ? " · 🎉" : ""}</div>`;
    card.onclick = () => openGoal(g);
    box.appendChild(card);
  });
}

let editingGoal = null;
function openGoal(g) {
  editingGoal = g || null;
  $("#goalName").value = g ? g.name : "";
  $("#goalTarget").value = g ? g.target : "";
  $("#goalSaved").value = g ? g.saved : "";
  $("#goalDelete").style.visibility = g ? "visible" : "hidden";
  $("#goalModal").classList.remove("hidden");
}
function closeGoal() { $("#goalModal").classList.add("hidden"); editingGoal = null; }
async function saveGoal(ev) {
  ev.preventDefault();
  const name = $("#goalName").value.trim();
  if (!name) { toast(I18N.t("goal_need_name"), "error"); return; }
  const body = { name, target: parseFloat($("#goalTarget").value) || 0,
    saved: parseFloat($("#goalSaved").value) || 0, currency: state.config.default_currency };
  if (editingGoal) body.id = editingGoal.id;
  try {
    await api("/goals", { method: "POST", body: JSON.stringify(body) });
    closeGoal(); await renderGoals();
    toast(I18N.t("goal_saved_t"), "success");
  } catch (e) { if (e.message !== "auth") toast("⚠️ " + e.message, "error"); }
}
async function deleteGoalCurrent() {
  if (!editingGoal) return;
  try {
    await api(`/goals/${editingGoal.id}`, { method: "DELETE" });
    closeGoal(); await renderGoals();
  } catch (e) { if (e.message !== "auth") toast("⚠️ " + e.message, "error"); }
}

// Инсайты: средняя трата в день, самая крупная, прогноз на месяц.
function renderInsights(s) {
  const card = $("#insightsCard");
  if (state.period === "all" || !(s.expense_total > 0) || !s.since) { card.hidden = true; return; }
  const since = parseDay(s.since);
  const today = startOfDay(new Date());
  let until = s.until ? addDays(parseDay(s.until), -1) : today;
  if (until > today) until = today;
  const daysElapsed = Math.max(1, daysBetween(since, until) + 1);
  const avg = s.expense_total / daysElapsed;
  const items = [{ label: I18N.t("ins_avg"), value: money(avg) }];
  if (s.biggest) items.push({ label: I18N.t("ins_biggest"), value: money(s.biggest.amount) + " · " + catName(s.biggest.category) });
  if (state.period === "month") {
    const monthDays = new Date(since.getFullYear(), since.getMonth() + 1, 0).getDate();
    items.push({ label: I18N.t("ins_forecast"), value: money(avg * monthDays) });
  }
  card.hidden = false;
  $("#insights").innerHTML = items.map((it) =>
    `<div class="insight"><div class="ins-v">${escapeHtml(it.value)}</div><div class="ins-l">${escapeHtml(it.label)}</div></div>`).join("");
}

// Конкретная подпись текущего периода («Июнь 2026», «21–27 июн», «2026»).
const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
function periodTitle(s) {
  if (state.period === "all" || !s.since) return I18N.periodLabel("all");
  const d = parseDay(s.since);
  if (state.period === "year") return String(d.getFullYear());
  if (state.period === "month") return cap(monthLong(d.getMonth())) + " " + d.getFullYear();
  if (state.period === "today") return `${d.getDate()} ${monthLong(d.getMonth())}`;
  if (state.period === "week") {
    const e = s.until ? addDays(parseDay(s.until), -1) : addDays(d, 6);
    return `${d.getDate()} ${monthShort(d.getMonth())} – ${e.getDate()} ${monthShort(e.getMonth())}`;
  }
  return I18N.periodLabel(state.period);
}

// Навигатор периода: ‹ Июнь 2026 ›. Для «всё время» стрелки скрыты.
function renderPeriodNav() {
  let nav = document.getElementById("periodNav");
  const host = $("#stats");
  if (!nav) {
    nav = el("div", "period-nav"); nav.id = "periodNav";
    host.parentElement.insertBefore(nav, host);
  }
  const navigable = state.period !== "all";
  const po = state.periodOffset || 0;
  nav.innerHTML =
    (navigable ? `<button class="pn-arrow" id="pnPrev" aria-label="‹">‹</button>` : "") +
    `<span class="pn-title">${escapeHtml(periodTitle(state.summary || {}))}</span>` +
    (navigable ? `<button class="pn-arrow" id="pnNext"${po >= 0 ? " disabled" : ""} aria-label="›">›</button>` : "");
  if (navigable) {
    $("#pnPrev").onclick = () => { state.periodOffset = po - 1; state.catFilter = null; refresh(); };
    const next = $("#pnNext"); if (next && po < 0) next.onclick = () => { state.periodOffset = po + 1; state.catFilter = null; refresh(); };
  }
}

async function boot() {
  const cfg = await api("/config");
  state.config = cfg;
  $("#version").textContent = "v" + cfg.version;
  await api("/recurring/run", { method: "POST" }).catch(() => {});  // авто-добавить регулярные за месяц

  state.currency = state.currency || localStorage.getItem("st-display-cur") || cfg.default_currency;
  if (!cfg.currencies.includes(state.currency)) state.currency = cfg.default_currency;
  // селектор отображаемой валюты (вверху): всё конвертируется в неё, выбор запоминаем
  const cs = $("#currency");
  fillSelect(cs, cfg.currencies, state.currency);
  cs.hidden = cfg.currencies.length <= 1;
  cs.onchange = () => { state.currency = cs.value; localStorage.setItem("st-display-cur", cs.value); refresh(); };

  renderPeriods();
  await refresh();
}

/* Wire up */
function init() {
  I18N.init();
  I18N.apply();             // перевести статическую разметку (data-i18n)
  applyTheme(localStorage.getItem("st-theme") || "auto");
  $("#addForm").addEventListener("submit", submitComposer);
  $("#addInput").addEventListener("input", onComposerInput);
  $("#themeToggle").addEventListener("click", toggleTheme);
  $("#dataBtn").addEventListener("click", openData);
  $("#dataClose").addEventListener("click", closeData);
  $("#exportBtn").addEventListener("click", (e) => { e.preventDefault(); doExportCsv(); });
  $("#editForm").addEventListener("submit", saveEdit);
  $("#editClose").addEventListener("click", closeEdit);
  $("#editDelete").addEventListener("click", () => { if (editing) deleteEntry(editing).then(closeEdit); });
  $("#addBudgetBtn").addEventListener("click", () => openBudget(null, null));
  $("#budgetForm").addEventListener("submit", saveBudget);
  $("#budgetClose").addEventListener("click", closeBudget);
  $("#budgetDelete").addEventListener("click", deleteBudgetCurrent);
  $("#addGoalBtn").addEventListener("click", () => openGoal(null));
  $("#goalForm").addEventListener("submit", saveGoal);
  $("#goalClose").addEventListener("click", closeGoal);
  $("#goalDelete").addEventListener("click", deleteGoalCurrent);
  $("#feedKind").addEventListener("change", (e) => { state.feedKind = e.target.value; renderFeed(); });
  $("#feedSearch").addEventListener("input", (e) => { state.feedSearch = e.target.value.trim(); renderFeed(); });
  refreshHints();
  $("#hint").addEventListener("click", (e) => {
    if (e.target.tagName !== "CODE") return;
    $("#addInput").value = e.target.textContent; $("#addInput").focus(); onComposerInput();
  });
  document.querySelectorAll(".overlay").forEach((o) => o.addEventListener("click", (e) => {
    if (e.target === o && o.id !== "loginOverlay" && o.id !== "confirmModal") o.classList.add("hidden");
  }));
  // блокировка прокрутки фона, пока открыта любая модалка (через наблюдатель за классами)
  const syncScrollLock = () => document.documentElement.classList.toggle(
    "no-scroll", !!document.querySelector(".overlay:not(.hidden)"));
  document.querySelectorAll(".overlay").forEach((o) =>
    new MutationObserver(syncScrollLock).observe(o, { attributes: true, attributeFilter: ["class"] }));
  boot().catch((e) => { if (e.message !== "auth") toast("⚠️ " + e.message, "error"); });
}

document.addEventListener("DOMContentLoaded", init);

// PWA: перехватываем приглашение установки (Android/desktop Chrome). На iOS его
// нет — там «Поделиться → На экран Домой» вручную.
let _deferredInstall = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); _deferredInstall = e; });
async function doInstall() {
  if (!_deferredInstall) return;
  _deferredInstall.prompt();
  await _deferredInstall.userChoice.catch(() => {});
  _deferredInstall = null;
  renderData();
}

// PWA: service worker для офлайна и установки (на file:// не регистрируется — там
// и так всё локально; нужен только для PWA по http/https, например на iOS).
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
