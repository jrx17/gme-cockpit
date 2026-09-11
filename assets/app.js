const SYMBOL = "GME";
const LS = {
  passHash: "gme_passcode_hash",
  finnhub: "gme_finnhub_key",
  sheet: "gme_sheet_url",
  interval: "gme_refresh_interval",
  theme: "gme_theme",
  unlocked: "gme_unlocked_session",
};

const $ = (id) => document.getElementById(id);

/* ---------- utils ---------- */

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fmtUSD(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("de-DE", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtNum(n, digits = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function parseLocaleNumber(raw) {
  if (raw === undefined || raw === null) return NaN;
  let s = String(raw).trim().replace(/[^0-9.,-]/g, "");
  if (s === "") return NaN;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    s = s.replace(",", ".");
  }
  return parseFloat(s);
}

const CORS_PROXIES = [
  (url) => url,
  (url) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(url),
  (url) => "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(url),
];

// Used only for the Google Sheet CSV (third-party, no CORS guarantee). Tries a direct
// fetch first, then falls back through public CORS proxies since any one of them can be
// temporarily down — the sheet is the one data source here without a first-party CORS-safe API.
async function fetchWithCorsFallback(url) {
  let lastErr;
  for (const wrap of CORS_PROXIES) {
    try {
      const res = await fetch(wrap(url), { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const text = await res.text();
      if (!text || /^<!DOCTYPE html/i.test(text.trim())) throw new Error("kein CSV erhalten");
      return text;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("alle Quellen fehlgeschlagen");
}

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/* ---------- passcode gate ---------- */

const gate = $("gate"), gateInput = $("gate-input"), gateError = $("gate-error"), gateCopy = $("gate-copy");

async function initGate() {
  const hash = localStorage.getItem(LS.passHash);
  if (!hash) {
    gateCopy.textContent = "Noch kein Passwort gesetzt. Lege jetzt eines fest (nur lokal in diesem Browser gespeichert).";
  }
  if (sessionStorage.getItem(LS.unlocked) === "1" && hash) {
    unlockApp();
  }
}

$("gate-submit").addEventListener("click", handleGateSubmit);
gateInput.addEventListener("keydown", (e) => { if (e.key === "Enter") handleGateSubmit(); });

async function handleGateSubmit() {
  const val = gateInput.value;
  if (!val) return;
  const existingHash = localStorage.getItem(LS.passHash);
  if (!existingHash) {
    localStorage.setItem(LS.passHash, await sha256(val));
    unlockApp();
    return;
  }
  const inputHash = await sha256(val);
  if (inputHash === existingHash) {
    sessionStorage.setItem(LS.unlocked, "1");
    unlockApp();
  } else {
    gateError.textContent = "Falsches Passwort.";
    gateInput.value = "";
  }
}

function unlockApp() {
  gate.classList.add("hidden");
  $("app").classList.remove("hidden");
  boot();
}

$("lock-btn").addEventListener("click", () => {
  sessionStorage.removeItem(LS.unlocked);
  gate.classList.remove("hidden");
  gateInput.value = "";
  $("app").classList.add("hidden");
});

/* ---------- theme ---------- */

function initTheme() {
  const saved = localStorage.getItem(LS.theme) || "light";
  document.documentElement.dataset.theme = saved;
  $("theme-toggle").textContent = saved === "dark" ? "☀️" : "🌙";
}
$("theme-toggle").addEventListener("click", () => {
  const cur = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = cur;
  localStorage.setItem(LS.theme, cur);
  $("theme-toggle").textContent = cur === "dark" ? "☀️" : "🌙";
  if (priceChart) updateChartTheme();
});

/* ---------- settings modal ---------- */

const settingsModal = $("settings-modal");
$("settings-btn").addEventListener("click", () => {
  $("finnhub-key").value = localStorage.getItem(LS.finnhub) || "";
  $("sheet-url").value = localStorage.getItem(LS.sheet) || "";
  $("refresh-interval").value = localStorage.getItem(LS.interval) || "15";
  $("new-passcode").value = "";
  $("settings-saved-msg").classList.add("hidden");
  settingsModal.classList.remove("hidden");
});
$("settings-close").addEventListener("click", () => settingsModal.classList.add("hidden"));
settingsModal.addEventListener("click", (e) => { if (e.target === settingsModal) settingsModal.classList.add("hidden"); });

$("settings-save").addEventListener("click", async () => {
  localStorage.setItem(LS.finnhub, $("finnhub-key").value.trim());
  localStorage.setItem(LS.sheet, $("sheet-url").value.trim());
  localStorage.setItem(LS.interval, String(Math.max(5, parseInt($("refresh-interval").value, 10) || 15)));
  const newPass = $("new-passcode").value;
  if (newPass) localStorage.setItem(LS.passHash, await sha256(newPass));
  $("settings-saved-msg").classList.remove("hidden");
  restartDataFlows();
});

/* ---------- nav active state ---------- */

document.querySelectorAll(".sidebar-nav .nav-item").forEach((a) => {
  a.addEventListener("click", () => {
    document.querySelectorAll(".sidebar-nav .nav-item").forEach((n) => n.classList.remove("active"));
    a.classList.add("active");
  });
});

/* ---------- price state & chart ---------- */

let priceChart = null;
let ws = null;
let pollTimer = null;
let newsTimer = null;
let positionsTimer = null;
let lastPrice = null, prevClose = null;
let sessionHistory = []; // [{t, price}], collected live client-side, capped below
const SESSION_HISTORY_MAX = 600;

function setLastUpdated() {
  $("last-updated").textContent = "Aktualisiert: " + new Date().toLocaleTimeString("de-DE");
}

function setPrice(price, source) {
  lastPrice = price;
  $("price-value").textContent = fmtUSD(price);
  if (prevClose) {
    const diff = price - prevClose;
    const pct = (diff / prevClose) * 100;
    const el = $("price-change");
    el.textContent = `${diff >= 0 ? "+" : ""}${fmtNum(diff)} (${diff >= 0 ? "+" : ""}${fmtNum(pct)}%)`;
    el.className = "price-change " + (diff >= 0 ? "positive" : "negative");
  }
  const badge = $("price-badge");
  if (source === "live") { badge.textContent = "LIVE"; badge.className = "badge badge-live"; }
  setLastUpdated();
  renderPortfolio();

  sessionHistory.push({ t: Date.now(), price });
  if (sessionHistory.length > SESSION_HISTORY_MAX) sessionHistory.shift();
  renderChart();
}

function initChart() {
  const ctx = $("price-chart").getContext("2d");
  priceChart = new Chart(ctx, {
    type: "line",
    data: { labels: [], datasets: [{ data: [], borderColor: "#6c5ce7", backgroundColor: "rgba(108,92,231,0.1)", fill: true, tension: 0.25, pointRadius: 0, borderWidth: 2 }] },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 6, color: getComputedStyle(document.documentElement).getPropertyValue("--text-muted") } },
        y: { grid: { color: getComputedStyle(document.documentElement).getPropertyValue("--border") }, ticks: { color: getComputedStyle(document.documentElement).getPropertyValue("--text-muted") } },
      },
    },
  });
}

function updateChartTheme() {
  const muted = getComputedStyle(document.documentElement).getPropertyValue("--text-muted");
  const border = getComputedStyle(document.documentElement).getPropertyValue("--border");
  priceChart.options.scales.x.ticks.color = muted;
  priceChart.options.scales.y.ticks.color = muted;
  priceChart.options.scales.y.grid.color = border;
  priceChart.update();
}

// Historische Intraday/Tages-Candles sind bei Finnhub für US-Aktien im kostenlosen Tier
// nicht zuverlässig verfügbar, und Stooq/Yahoo blockieren automatisierte Browser-Abfragen
// (Bot-Check bzw. keine CORS-Freigabe). Der Chart baut sich daher live aus den seit
// App-Start empfangenen Kursen auf, statt eine fragile historische Quelle vorzutäuschen.
function renderChart() {
  if (!priceChart) return;
  const hasData = sessionHistory.length > 1;
  $("chart-empty-state").classList.toggle("hidden", hasData);
  $("price-chart").classList.toggle("hidden", !hasData);
  if (!hasData) return;
  priceChart.data.labels = sessionHistory.map((p) => new Date(p.t).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
  priceChart.data.datasets[0].data = sessionHistory.map((p) => p.price);
  priceChart.update();
}

/* ---------- live price: finnhub websocket + REST poll ---------- */

function startPriceFeed() {
  stopPriceFeed();
  const key = localStorage.getItem(LS.finnhub);
  loadStats(key);
  if (!key) {
    $("price-badge").textContent = "Kein Finnhub-Key";
    $("price-badge").className = "badge badge-neutral";
    $("chart-empty-state").classList.remove("hidden");
    return;
  }
  startFinnhubWebsocket(key);
  pollTimer = setInterval(() => pollFinnhubQuote(key), 10000);
  pollFinnhubQuote(key);
}

function stopPriceFeed() {
  if (ws) { try { ws.close(); } catch (e) {} ws = null; }
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

function getInterval() {
  return Math.max(5, parseInt(localStorage.getItem(LS.interval), 10) || 15);
}

function startFinnhubWebsocket(key) {
  try {
    ws = new WebSocket(`wss://ws.finnhub.io?token=${key}`);
    ws.addEventListener("open", () => ws.send(JSON.stringify({ type: "subscribe", symbol: SYMBOL })));
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "trade" && msg.data && msg.data.length) {
        const last = msg.data[msg.data.length - 1];
        setPrice(last.p, "live");
      }
    });
    ws.addEventListener("error", () => console.warn("Finnhub WebSocket Fehler, Poll-Fallback aktiv"));
  } catch (e) { console.warn("WebSocket konnte nicht gestartet werden", e); }
}

async function pollFinnhubQuote(key) {
  try {
    const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${SYMBOL}&token=${key}`);
    const q = await res.json();
    if (q.pc) {
      prevClose = q.pc;
      $("stat-prevclose").textContent = fmtUSD(q.pc);
      $("stat-high").textContent = fmtUSD(q.h);
      $("stat-low").textContent = fmtUSD(q.l);
      $("stat-open").textContent = fmtUSD(q.o);
      if (!ws || ws.readyState !== 1) setPrice(q.c, "live");
    }
  } catch (e) { console.warn("Finnhub Quote Fehler", e); }
}

async function loadStats(key) {
  $("stat-earnings").textContent = "—";
  $("stat-mcap").textContent = "—";
  if (!key) {
    $("stat-mcap").textContent = "Nur mit Finnhub-Key";
    $("stat-earnings").textContent = "Nur mit Finnhub-Key";
    return;
  }
  try {
    const res = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${SYMBOL}&token=${key}`);
    const p = await res.json();
    if (p.marketCapitalization) $("stat-mcap").textContent = fmtNum(p.marketCapitalization, 0) + " Mio. USD";
  } catch (e) {}
  try {
    const from = new Date().toISOString().slice(0, 10);
    const to = new Date(Date.now() + 120 * 86400000).toISOString().slice(0, 10);
    const res = await fetch(`https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&symbol=${SYMBOL}&token=${key}`);
    const d = await res.json();
    if (d.earningsCalendar && d.earningsCalendar.length) {
      $("stat-earnings").textContent = new Date(d.earningsCalendar[0].date).toLocaleDateString("de-DE");
    } else {
      $("stat-earnings").textContent = "Kein Termin bekannt";
    }
  } catch (e) {}
}

/* ---------- news (Finnhub company-news, same CORS-safe API as the price feed) ---------- */

async function loadNews() {
  const list = $("news-list");
  const key = localStorage.getItem(LS.finnhub);
  if (!key) {
    list.innerHTML = `<li class="muted">News benötigen einen kostenlosen Finnhub-Key (siehe Einstellungen). <a href="https://finance.yahoo.com/quote/GME/news" target="_blank" rel="noopener">Bis dahin News direkt bei Yahoo Finance ansehen</a>.</li>`;
    $("news-source").textContent = "—";
    return;
  }
  try {
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    const res = await fetch(`https://finnhub.io/api/v1/company-news?symbol=${SYMBOL}&from=${from}&to=${to}&token=${key}`);
    const items = (await res.json()).slice(0, 12);
    if (!Array.isArray(items) || !items.length) throw new Error("keine News");
    list.innerHTML = "";
    items.forEach((item) => {
      const li = document.createElement("li");
      const dateStr = item.datetime ? new Date(item.datetime * 1000).toLocaleString("de-DE") : "";
      li.innerHTML = `<a href="${item.url}" target="_blank" rel="noopener">${item.headline}</a><span class="news-meta">${item.source || ""}${item.source && dateStr ? " · " : ""}${dateStr}</span>`;
      list.appendChild(li);
    });
    $("news-source").textContent = "Finnhub";
  } catch (e) {
    list.innerHTML = `<li class="muted">News konnten nicht geladen werden. <a href="https://finance.yahoo.com/quote/GME/news" target="_blank" rel="noopener">Direkt bei Yahoo Finance nachsehen</a>.</li>`;
    console.warn("News Fehler", e);
  }
}

/* ---------- positions from google sheet csv ---------- */

let positionRows = [];

async function loadPositions() {
  const sheetUrl = localStorage.getItem(LS.sheet);
  const tbody = $("positions-tbody");
  if (!sheetUrl) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted">Noch keine Sheet-URL hinterlegt. Siehe Einstellungen.</td></tr>`;
    positionRows = [];
    renderPortfolio();
    return;
  }
  try {
    const csv = await fetchWithCorsFallback(sheetUrl);
    const rows = parseCSV(csv).filter((r) => r.some((c) => c.trim() !== ""));
    if (!rows.length) throw new Error("leeres Sheet");
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const idx = {
      platform: header.findIndex((h) => h.includes("platt")),
      shares: header.findIndex((h) => h.includes("stück") || h.includes("stueck") || h.includes("anzahl") || h.includes("shares")),
      price: header.findIndex((h) => h.includes("kauf") && h.includes("kurs") || h.includes("preis") || h.includes("price")),
      date: header.findIndex((h) => h.includes("datum") || h.includes("date")),
    };
    positionRows = rows.slice(1).map((r) => ({
      platform: idx.platform > -1 ? (r[idx.platform] || "Unbekannt").trim() : "Unbekannt",
      shares: idx.shares > -1 ? parseLocaleNumber(r[idx.shares]) : NaN,
      price: idx.price > -1 ? parseLocaleNumber(r[idx.price]) : NaN,
      date: idx.date > -1 ? r[idx.date] : "",
    })).filter((r) => r.platform && !Number.isNaN(r.shares) && !Number.isNaN(r.price));
    renderPortfolio();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted">Sheet konnte nicht geladen werden. Prüfe, ob der Link öffentlich per "Im Web veröffentlichen" (CSV) freigegeben ist.</td></tr>`;
    console.warn("Sheet Fehler", e);
  }
}

function renderPortfolio() {
  const tbody = $("positions-tbody");
  if (!positionRows.length) return;

  const byPlatform = {};
  positionRows.forEach((r) => {
    if (!byPlatform[r.platform]) byPlatform[r.platform] = { shares: 0, invested: 0 };
    byPlatform[r.platform].shares += r.shares;
    byPlatform[r.platform].invested += r.shares * r.price;
  });

  tbody.innerHTML = "";
  let totalShares = 0, totalInvested = 0, totalValue = 0;

  Object.entries(byPlatform).forEach(([platform, agg]) => {
    const avgPrice = agg.invested / agg.shares;
    const value = lastPrice ? agg.shares * lastPrice : null;
    const pnl = value !== null ? value - agg.invested : null;
    const pnlPct = value !== null ? (pnl / agg.invested) * 100 : null;
    totalShares += agg.shares;
    totalInvested += agg.invested;
    if (value !== null) totalValue += value;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${platform}</td>
      <td>${fmtNum(agg.shares, 0)}</td>
      <td>${fmtUSD(avgPrice)}</td>
      <td>${value !== null ? fmtUSD(value) : "—"}</td>
      <td class="${pnl >= 0 ? "pnl-positive" : "pnl-negative"}">${pnl !== null ? (pnl >= 0 ? "+" : "") + fmtUSD(pnl) : "—"}</td>
      <td class="${pnl >= 0 ? "pnl-positive" : "pnl-negative"}">${pnlPct !== null ? (pnlPct >= 0 ? "+" : "") + fmtNum(pnlPct) + "%" : "—"}</td>
    `;
    tbody.appendChild(tr);
  });

  const avgAll = totalInvested / totalShares;
  const pnlAll = lastPrice ? totalValue - totalInvested : null;
  const pnlAllPct = pnlAll !== null ? (pnlAll / totalInvested) * 100 : null;

  $("pf-shares").textContent = fmtNum(totalShares, 0);
  $("pf-avg").textContent = fmtUSD(avgAll);
  $("pf-invested").textContent = fmtUSD(totalInvested);
  $("pf-value").textContent = lastPrice ? fmtUSD(totalValue) : "—";
  const pnlEl = $("pf-pnl");
  if (pnlAll !== null) {
    pnlEl.textContent = `${pnlAll >= 0 ? "+" : ""}${fmtUSD(pnlAll)} (${pnlAllPct >= 0 ? "+" : ""}${fmtNum(pnlAllPct)}%)`;
    pnlEl.className = pnlAll >= 0 ? "pnl-positive" : "pnl-negative";
  } else {
    pnlEl.textContent = "—";
  }
}

/* ---------- boot ---------- */

function restartDataFlows() {
  stopPriceFeed();
  if (newsTimer) clearInterval(newsTimer);
  if (positionsTimer) clearInterval(positionsTimer);
  startPriceFeed();
  renderChart();
  loadNews();
  newsTimer = setInterval(loadNews, 5 * 60 * 1000);
  loadPositions();
  positionsTimer = setInterval(loadPositions, 5 * 60 * 1000);
}

function boot() {
  if (!priceChart) initChart();
  restartDataFlows();
}

initTheme();
initGate();
