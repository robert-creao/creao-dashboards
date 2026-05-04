/* Creao Profit Distribution Dashboard
 * Loads data from window.DASHBOARD_DATA (embedded) or CSV URL,
 * applies day-by-day reveal, supports daily/weekly views, and per-period notes.
 */

const COLOR = {
  ink: '#1E1B2E',
  teal: '#20808D',
  tealSoft: 'rgba(32,128,141,0.18)',
  gold: '#FFC553',
  goldSoft: 'rgba(255,197,83,0.32)',
  muted: '#6B6B7A',
  grid: '#E5E5EC',
};

const fmtUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUSD0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const fmtDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const fmtDateLong = (d) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

let RAW = [];      // all rows
let FILTERED = []; // after period + asOf filter (daily)
let WEEKLY = [];   // weekly aggregates of FILTERED
let lineChart, areaChart;
let VIEW = 'daily'; // 'daily' | 'weekly'

const CFG = (typeof window !== 'undefined' && window.DASHBOARD_CONFIG) || {};
const LIVE_CSV_URL = CFG.csvUrl || '';
const CLIENT_NAME = CFG.clientName || '';
const PRODUCT_NAME = CFG.productName || 'Profit Distribution';
const PERIOD_NOTES = CFG.periodNotes || {}; // { "1": "...", "2": "...", "all": "..." }

/* ---------- CSV parsing ---------- */
function parseCSV(text) {
  const rows = [];
  let cur = [], field = '', inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuote) {
      if (c === '"') {
        if (text[i+1] === '"') { field += '"'; i++; }
        else inQuote = false;
      } else field += c;
    } else {
      if (c === '"') inQuote = true;
      else if (c === ',') { cur.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (field !== '' || cur.length) { cur.push(field); rows.push(cur); cur = []; field = ''; }
        if (c === '\r' && text[i+1] === '\n') i++;
      } else field += c;
    }
  }
  if (field !== '' || cur.length) { cur.push(field); rows.push(cur); }
  return rows;
}

function parseFlexibleDate(s) {
  if (!s) return null;
  if (s instanceof Date) return s;
  s = String(s).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(+m[3], +m[1]-1, +m[2]);
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function parseRowsFromCSV(text) {
  const rows = parseCSV(text);
  const header = rows.shift();
  return rows.filter(r => r.length >= 11 && r[0]).map(r => ({
    date: parseFlexibleDate(r[0]),
    dateStr: r[0],
    revenue: +r[1],
    adspend: +r[2],
    cog: +r[3],
    fees: +r[4],
    netProfit: +r[5],
    cumPayout: +r[6],
    dayNum: +r[7],
    target: +r[8],
    periodNum: +r[9],
    periodLabel: r[10],
  })).filter(r => r.date && !isNaN(r.revenue));
}

function parseRowsFromJSON(arr) {
  return arr.map(r => ({
    date: parseFlexibleDate(r.date),
    dateStr: r.date,
    revenue: +r.revenue,
    adspend: +r.adspend,
    cog: +r.cog,
    fees: +r.fees,
    netProfit: +r.net_profit,
    cumPayout: +r.cum_payout,
    dayNum: +r.day_num,
    target: +r.partner_share_target,
    periodNum: +r.period_num,
    periodLabel: r.period_label,
  })).filter(r => r.date && !isNaN(r.revenue));
}

function loadData() {
  if (Array.isArray(window.DASHBOARD_DATA) && window.DASHBOARD_DATA.length) {
    RAW = parseRowsFromJSON(window.DASHBOARD_DATA);
    RAW.sort((a,b) => a.periodNum - b.periodNum || a.dayNum - b.dayNum);
    return Promise.resolve();
  }
  if (!LIVE_CSV_URL) {
    return Promise.reject(new Error('No data source configured (config.js)'));
  }
  return fetch(LIVE_CSV_URL, { cache: 'no-store', redirect: 'follow' })
    .then(r => { if (!r.ok) throw new Error('live ' + r.status); return r.text(); })
    .then(text => {
      RAW = parseRowsFromCSV(text);
      RAW.sort((a,b) => a.periodNum - b.periodNum || a.dayNum - b.dayNum);
    });
}

/* ---------- Weekly aggregation ----------
 * Group filtered rows into weeks (Mon-Sun, ISO week). Each week shows the sum.
 */
function startOfWeek(d) {
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = dt.getDay(); // 0=Sun ... 6=Sat
  const offset = (day === 0 ? -6 : 1 - day); // Monday as start
  dt.setDate(dt.getDate() + offset);
  return dt;
}

function buildWeekly(rows) {
  const buckets = new Map();
  rows.forEach(r => {
    const ws = startOfWeek(r.date);
    const key = ws.toISOString().slice(0,10);
    if (!buckets.has(key)) {
      buckets.set(key, {
        date: ws,
        weekStart: ws,
        weekEnd: new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + 6),
        revenue: 0, adspend: 0, cog: 0, fees: 0, netProfit: 0,
        days: 0,
        cumPayout: 0,
        periodLabels: new Set(),
      });
    }
    const b = buckets.get(key);
    b.revenue += r.revenue;
    b.adspend += r.adspend;
    b.cog += r.cog;
    b.fees += r.fees;
    b.netProfit += r.netProfit;
    b.days += 1;
    b.cumPayout = Math.max(b.cumPayout, r.cumPayout); // last in week
    b.periodLabels.add(r.periodLabel);
  });
  return [...buckets.values()].sort((a,b) => a.weekStart - b.weekStart);
}

/* ---------- Filters ---------- */
function applyFilters() {
  const periodSel = document.getElementById('period-filter').value;
  const asOfStr = document.getElementById('as-of').value;
  const asOf = asOfStr ? new Date(asOfStr + 'T23:59:59') : new Date();

  FILTERED = RAW.filter(r => {
    if (periodSel !== 'all' && String(r.periodNum) !== periodSel) return false;
    if (r.date > asOf) return false;
    return true;
  });
  WEEKLY = buildWeekly(FILTERED);

  // Status line: show days remaining until the current period ends, or
  // a "closed" state for completed periods. Falls back gracefully when no
  // active period can be identified.
  const periodSelStatus = document.getElementById('period-filter').value;
  let activeNumStatus = null;
  if (periodSelStatus !== 'all') {
    activeNumStatus = parseInt(periodSelStatus, 10);
  } else {
    const periodsStatus = [...new Set(RAW.map(r => r.periodNum))].sort((a,b) => a - b);
    for (const p of periodsStatus) {
      const rs = RAW.filter(r => r.periodNum === p);
      const start = rs[0].date, end = rs[rs.length - 1].date;
      if (asOf >= start && asOf <= end) { activeNumStatus = p; break; }
      if (asOf < start) { activeNumStatus = p; break; }
      activeNumStatus = p;
    }
  }
  let statusText = `as of ${fmtDateLong(asOf)}`;
  if (activeNumStatus !== null) {
    const rs = RAW.filter(r => r.periodNum === activeNumStatus);
    if (rs.length) {
      const start = rs[0].date, end = rs[rs.length - 1].date;
      const MS_PER_DAY = 1000 * 60 * 60 * 24;
      if (asOf < start) {
        const days = Math.ceil((start - asOf) / MS_PER_DAY);
        statusText = `${rs[0].periodLabel} starts in ${days} day${days === 1 ? '' : 's'} · as of ${fmtDateLong(asOf)}`;
      } else if (asOf > end) {
        statusText = `${rs[0].periodLabel} closed · as of ${fmtDateLong(asOf)}`;
      } else {
        const days = Math.ceil((end - asOf) / MS_PER_DAY);
        statusText = `${days} day${days === 1 ? '' : 's'} until period end · as of ${fmtDateLong(asOf)}`;
      }
    }
  }
  document.getElementById('reveal-status').textContent = statusText;
}

function sum(arr, key) { return arr.reduce((a,r) => a + r[key], 0); }

/* ---------- KPIs ---------- */
function updateKPIs() {
  const totalRev = sum(FILTERED, 'revenue');
  const totalAds = sum(FILTERED, 'adspend');
  const totalNP  = sum(FILTERED, 'netProfit');

  const periodSel = document.getElementById('period-filter').value;
  const asOfStr = document.getElementById('as-of').value;
  const asOf = asOfStr ? new Date(asOfStr + 'T23:59:59') : new Date();

  // Helper: classify a period (by num) relative to asOf as current / upcoming / completed.
  function classifyPeriod(periodNum) {
    const rs = RAW.filter(r => r.periodNum === periodNum);
    if (!rs.length) return 'none';
    const start = rs[0].date, end = rs[rs.length - 1].date;
    if (asOf < start) return 'upcoming';
    if (asOf > end) return 'completed';
    return 'current';
  }

  let activeRow = null, activeState = 'current';
  if (periodSel !== 'all') {
    activeRow = RAW.find(r => String(r.periodNum) === periodSel) || null;
    activeState = activeRow ? classifyPeriod(activeRow.periodNum) : 'none';
  } else {
    const periods = [...new Set(RAW.map(r => r.periodNum))].sort((a,b) => a - b);
    for (const p of periods) {
      const rs = RAW.filter(r => r.periodNum === p);
      const start = rs[0].date, end = rs[rs.length - 1].date;
      if (asOf >= start && asOf <= end) { activeRow = rs[0]; activeState = 'current'; break; }
      if (asOf < start) { activeRow = rs[0]; activeState = 'upcoming'; break; }
      activeRow = rs[0]; activeState = 'completed';
    }
  }
  const target = activeRow ? activeRow.target : 0;
  const targetLabel = activeRow ? activeRow.periodLabel : '—';

  let cumToDate = 0;
  if (activeRow) {
    const inPeriod = FILTERED.filter(r => r.periodNum === activeRow.periodNum);
    if (inPeriod.length) cumToDate = inPeriod[inPeriod.length - 1].cumPayout;
  }

  document.getElementById('kpi-sales').textContent = fmtUSD.format(totalRev);
  document.getElementById('kpi-revenue').textContent = fmtUSD.format(totalRev);
  document.getElementById('kpi-adspend').textContent = fmtUSD.format(totalAds);
  document.getElementById('kpi-netprofit').textContent = fmtUSD.format(totalNP);

  // Hide the payout target while a period is active — only show it once the period
  // has closed (completed). For active/current and upcoming periods the final payout
  // hasn't been determined yet, so showing a target is misleading.
  const isActiveOrUpcoming = activeState === 'current' || activeState === 'upcoming';
  document.getElementById('kpi-target').textContent = isActiveOrUpcoming ? '—' : fmtUSD.format(target);

  const avgDaily = FILTERED.length ? totalRev / FILTERED.length : 0;
  document.getElementById('kpi-sales-sub').textContent  = FILTERED.length ? `Avg ${fmtUSD.format(avgDaily)} / day` : '—';
  document.getElementById('kpi-revenue-sub').textContent  = `${FILTERED.length} day${FILTERED.length === 1 ? '' : 's'} shown`;
  document.getElementById('kpi-adspend-sub').textContent  = totalRev > 0 ? `${((totalAds/totalRev)*100).toFixed(1)}% of revenue` : '—';
  document.getElementById('kpi-netprofit-sub').textContent = activeRow ? `Partner cum. ${fmtUSD.format(cumToDate)} this period` : '—';

  let stateBadge = '';
  if (activeState === 'current') stateBadge = ' · finalized after period closes';
  else if (activeState === 'upcoming') stateBadge = ' · upcoming';
  else if (activeState === 'completed') stateBadge = ' · completed';
  document.getElementById('kpi-target-sub').textContent = targetLabel + stateBadge;
}

/* ---------- Notes ---------- */
function updateNotes() {
  const sel = document.getElementById('period-filter').value;
  const body = document.getElementById('notes-body');
  const hint = document.getElementById('notes-hint');
  let key = sel;
  let label = '';
  if (sel === 'all') {
    label = 'All periods';
  } else {
    const row = RAW.find(r => String(r.periodNum) === sel);
    label = row ? row.periodLabel : `Period ${sel}`;
  }
  hint.textContent = `Status & commentary · ${label}`;
  const note = PERIOD_NOTES[key] || PERIOD_NOTES['all'] || '';
  if (note && note.trim()) {
    body.innerHTML = note;
    body.classList.remove('empty');
  } else {
    body.textContent = 'No notes for this period yet.';
    body.classList.add('empty');
  }
}

/* ---------- Charts ---------- */
function chartDefaults() {
  Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.color = COLOR.muted;
  Chart.defaults.borderColor = COLOR.grid;
}

function drawLine() {
  const ctx = document.getElementById('line-chart').getContext('2d');
  const useWeekly = (VIEW === 'weekly');
  const data = useWeekly ? WEEKLY : FILTERED;
  const labels = data.map(r => useWeekly
    ? `Wk of ${fmtDate(r.weekStart)}`
    : fmtDate(r.date));
  const cfg = {
    type: useWeekly ? 'bar' : 'line',
    data: {
      labels,
      datasets: [
        { label: 'Revenue', data: data.map(r => r.revenue), borderColor: COLOR.teal, backgroundColor: useWeekly ? COLOR.teal : COLOR.tealSoft, tension: 0.35, borderWidth: 2.4, pointRadius: 3, pointHoverRadius: 5, pointBackgroundColor: COLOR.teal, borderRadius: 6 },
        { label: 'Adspend', data: data.map(r => r.adspend), borderColor: COLOR.gold, backgroundColor: useWeekly ? COLOR.gold : COLOR.goldSoft, tension: 0.35, borderWidth: 2.4, pointRadius: 3, pointHoverRadius: 5, pointBackgroundColor: COLOR.gold, borderRadius: 6 },
        { label: 'Net Profit', data: data.map(r => r.netProfit), borderColor: COLOR.ink, backgroundColor: useWeekly ? COLOR.ink : 'rgba(30,27,46,0.08)', tension: 0.35, borderWidth: 2.4, pointRadius: 3, pointHoverRadius: 5, pointBackgroundColor: COLOR.ink, borderRadius: 6 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', align: 'end', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: useWeekly ? 'rect' : 'circle' } },
        tooltip: {
          backgroundColor: COLOR.ink, padding: 12, cornerRadius: 8, titleFont: { weight: '600' },
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtUSD.format(ctx.parsed.y)}` },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 16 }, stacked: false },
        y: { grid: { color: COLOR.grid }, ticks: { callback: v => fmtUSD0.format(v) }, beginAtZero: useWeekly },
      },
    },
  };
  if (lineChart) lineChart.destroy();
  lineChart = new Chart(ctx, cfg);
}

function drawArea() {
  const ctx = document.getElementById('area-chart').getContext('2d');
  const periods = [...new Set(RAW.map(r => r.periodNum))].sort((a,b) => a - b);
  const visibleByPeriod = {};
  FILTERED.forEach(r => {
    if (!visibleByPeriod[r.periodNum]) visibleByPeriod[r.periodNum] = [];
    visibleByPeriod[r.periodNum].push(r);
  });
  const maxDays = Math.max(...RAW.map(r => r.dayNum));
  const labels = Array.from({ length: maxDays }, (_, i) => `Day ${i+1}`);
  const palette = {
    1: { line: COLOR.teal, fill: 'rgba(32,128,141,0.20)' },
    2: { line: COLOR.gold, fill: 'rgba(255,197,83,0.30)' },
    3: { line: '#7E57C2', fill: 'rgba(126,87,194,0.20)' },
    4: { line: '#26A69A', fill: 'rgba(38,166,154,0.20)' },
    5: { line: '#EF6C00', fill: 'rgba(239,108,0,0.20)' },
  };

  const datasets = periods.map(p => {
    const rows = visibleByPeriod[p] || [];
    const map = new Map(rows.map(r => [r.dayNum, r.cumPayout]));
    const label = (RAW.find(r => r.periodNum === p) || {}).periodLabel || `Period ${p}`;
    return {
      label,
      data: labels.map((_, i) => map.has(i+1) ? map.get(i+1) : null),
      borderColor: (palette[p] || {}).line || COLOR.ink,
      backgroundColor: (palette[p] || {}).fill || 'rgba(30,27,46,0.12)',
      borderWidth: 2.4,
      tension: 0.3,
      fill: true,
      pointRadius: 2.5,
      pointHoverRadius: 5,
      spanGaps: false,
    };
  });

  const cfg = {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', align: 'end', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle' } },
        tooltip: {
          backgroundColor: COLOR.ink, padding: 12, cornerRadius: 8,
          callbacks: { label: (ctx) => ctx.parsed.y == null ? '' : `${ctx.dataset.label}: ${fmtUSD.format(ctx.parsed.y)}` },
        },
      },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: COLOR.grid }, ticks: { callback: v => fmtUSD0.format(v) }, beginAtZero: true },
      },
    },
  };
  if (areaChart) areaChart.destroy();
  areaChart = new Chart(ctx, cfg);
}

/* ---------- Table ---------- */
function drawTable() {
  const tbody = document.querySelector('#data-table tbody');
  const thDate = document.getElementById('th-date');
  tbody.innerHTML = '';

  if (VIEW === 'weekly') {
    thDate.textContent = 'Week';
    if (!WEEKLY.length) {
      tbody.innerHTML = '<tr class="empty"><td colspan="5">No weeks unlocked yet.</td></tr>';
      return;
    }
    [...WEEKLY].reverse().forEach(w => {
      const tr = document.createElement('tr');
      const range = `${fmtDate(w.weekStart)} – ${fmtDate(w.weekEnd)}`;
      tr.innerHTML = `
        <td>${range} <span style="color:var(--muted);font-size:11px">(${w.days}d)</span></td>
        <td class="num">${fmtUSD.format(w.revenue)}</td>
        <td class="num">${fmtUSD.format(w.adspend)}</td>
        <td class="num">${fmtUSD.format(w.netProfit)}</td>
        <td class="num">${fmtUSD.format(w.cumPayout)}</td>
      `;
      tbody.appendChild(tr);
    });
  } else {
    thDate.textContent = 'Date';
    if (!FILTERED.length) {
      tbody.innerHTML = '<tr class="empty"><td colspan="5">No days unlocked yet for this view.</td></tr>';
      return;
    }
    [...FILTERED].reverse().forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${fmtDate(r.date)}, ${r.date.getFullYear()}</td>
        <td class="num">${fmtUSD.format(r.revenue)}</td>
        <td class="num">${fmtUSD.format(r.adspend)}</td>
        <td class="num">${fmtUSD.format(r.netProfit)}</td>
        <td class="num">${fmtUSD.format(r.cumPayout)}</td>
      `;
      tbody.appendChild(tr);
    });
  }
}

function updateChartLabels() {
  const ct = document.getElementById('chart-title');
  const ch = document.getElementById('chart-hint');
  const tt = document.getElementById('table-title');
  const th = document.getElementById('table-hint');
  if (VIEW === 'weekly') {
    ct.textContent = 'Weekly Revenue, Adspend & Net Profit';
    ch.textContent = 'Each bar is one ISO week (Mon–Sun) of unlocked days.';
    tt.textContent = 'Week-by-Week Breakdown';
    th.textContent = 'Weeks build as days unlock.';
  } else {
    ct.textContent = 'Daily Revenue, Adspend & Net Profit';
    ch.textContent = 'Updates daily — only days that have already arrived are shown.';
    tt.textContent = 'Day-by-Day Breakdown';
    th.textContent = 'New rows unlock automatically each day.';
  }
}

/* ---------- Wire up ---------- */
function buildPeriodOptions() {
  const sel = document.getElementById('period-filter');
  // Clear extra existing options (preserve "all")
  [...sel.querySelectorAll('option:not([value="all"])')].forEach(o => o.remove());
  const seen = new Set();
  RAW.forEach(r => {
    if (seen.has(r.periodNum)) return;
    seen.add(r.periodNum);
    const o = document.createElement('option');
    o.value = String(r.periodNum);
    o.textContent = r.periodLabel;
    sel.appendChild(o);
  });
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function refresh() {
  applyFilters();
  updateKPIs();
  updateNotes();
  updateChartLabels();
  drawLine();
  drawArea();
  drawTable();
}

function applyClientBranding() {
  if (!CLIENT_NAME) return;
  const titleEl = document.querySelector('.brand h1');
  if (titleEl) titleEl.textContent = `Creao · ${CLIENT_NAME}`;
  const tagEl = document.querySelector('.brand .tag');
  if (tagEl) tagEl.textContent = `${PRODUCT_NAME} · Bi-weekly partner payouts`;
  document.title = `Creao · ${CLIENT_NAME}`;
}

document.addEventListener('DOMContentLoaded', () => {
  chartDefaults();
  applyClientBranding();
  document.getElementById('as-of').value = todayISO();

  // View toggle
  document.querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.seg-btn').forEach(b => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
      });
      VIEW = btn.dataset.view;
      refresh();
    });
  });

  loadData()
    .then(() => {
      buildPeriodOptions();
      refresh();
      document.getElementById('period-filter').addEventListener('change', refresh);
      document.getElementById('as-of').addEventListener('change', refresh);
      document.getElementById('reset-asof').addEventListener('click', () => {
        document.getElementById('as-of').value = todayISO();
        refresh();
      });
    })
    .catch(err => {
      console.error(err);
      document.getElementById('reveal-status').textContent = 'Error loading data';
    });
});
