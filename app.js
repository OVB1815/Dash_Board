/* Personal Dashboard — v2.
   Everything runs on the device. Data lives in IndexedDB; nothing is uploaded.
   New in v2: Work + Personal task lists, and calendar import (.ics). */

'use strict';

/* ------------------------------------------------------------------ */
/*  Storage (IndexedDB)                                               */
/* ------------------------------------------------------------------ */
const DB_NAME = 'personal-dashboard';
const DB_VERSION = 3;
let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      const tx = e.target.transaction;
      if (!db.objectStoreNames.contains('tasks')) db.createObjectStore('tasks', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('weights')) db.createObjectStore('weights', { keyPath: 'date' });
      if (!db.objectStoreNames.contains('events')) db.createObjectStore('events', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'id' });
      // v1 -> v2: existing tasks had no list; default them to Personal.
      if (e.oldVersion >= 1 && db.objectStoreNames.contains('tasks')) {
        const store = tx.objectStore('tasks');
        const cur = store.openCursor();
        cur.onsuccess = (ev) => {
          const c = ev.target.result;
          if (c) {
            const v = c.value;
            if (!v.list) { v.list = 'personal'; c.update(v); }
            c.continue();
          }
        };
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return _dbPromise;
}

function reqP(request) {
  return new Promise((res, rej) => {
    request.onsuccess = () => res(request.result);
    request.onerror = () => rej(request.error);
  });
}
function txDone(t) {
  return new Promise((res, rej) => {
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}
async function getAll(store) {
  const db = await openDB();
  return reqP(db.transaction(store).objectStore(store).getAll());
}
async function putItem(store, obj) {
  const db = await openDB();
  const t = db.transaction(store, 'readwrite');
  t.objectStore(store).put(obj);
  return txDone(t);
}
async function delItem(store, key) {
  const db = await openDB();
  const t = db.transaction(store, 'readwrite');
  t.objectStore(store).delete(key);
  return txDone(t);
}
async function clearStore(store) {
  const db = await openDB();
  const t = db.transaction(store, 'readwrite');
  t.objectStore(store).clear();
  return txDone(t);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */
const $ = (sel, root = document) => root.querySelector(sel);
const view = () => document.getElementById('view');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const LIST_LABEL = { work: 'Work', personal: 'Personal' };

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtShort(key) {
  const [, m, d] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}
function fmtLong(d) {
  return `${DAYS[d.getDay()]}, ${MONTHS_LONG[d.getMonth()]} ${d.getDate()}`;
}
function fmtEventDate(date) {
  return `${DAYS_SHORT[date.getDay()]} ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}
function startOfToday() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}
function relLabel(date) {
  const d0 = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((d0 - startOfToday()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}
function nextBirthday(month, day) {
  const now = new Date();
  let d = new Date(now.getFullYear(), month - 1, day);
  if (d < startOfToday()) d = new Date(now.getFullYear() + 1, month - 1, day);
  return d;
}

const ICONS = {
  home: '<path d="M5 12l-2 0l9 -9l9 9l-2 0"/><path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1 -1v-7"/><path d="M9 21v-6h6v6"/>',
  chevL: '<path d="M15 6l-6 6l6 6"/>',
  chevR: '<path d="M9 6l6 6l-6 6"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  circle: '<path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/>',
  checkCircle: '<path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/><path d="M9 12l2 2l4 -4"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2 -2l1 -12"/><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"/>',
  moon: '<path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z"/>',
  sun: '<path d="M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"/><path d="M3 12h1"/><path d="M20 12h1"/><path d="M12 3v1"/><path d="M12 20v1"/><path d="M5.6 5.6l.7 .7"/><path d="M17.7 17.7l.7 .7"/><path d="M5.6 18.4l.7 -.7"/><path d="M17.7 6.3l.7 -.7"/>',
  heart: '<path d="M19.5 12.6l-7.5 7.4l-7.5 -7.4a5 5 0 1 1 7.5 -6.6a5 5 0 1 1 7.5 6.6"/>',
  briefcase: '<path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z"/><path d="M9 5v-1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v1"/><path d="M4 12h16"/>',
  user: '<path d="M12 7m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0"/><path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"/>',
  target: '<path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/><path d="M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0 -10 0"/><path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/>',
  cake: '<path d="M3 20h18"/><path d="M4 20v-6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v6"/><path d="M12 5v7"/><path d="M12 4m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/>',
  calendar: '<path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z"/><path d="M16 3v4"/><path d="M8 3v4"/><path d="M4 11h16"/>',
  calEvent: '<path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z"/><path d="M16 3v4"/><path d="M8 3v4"/><path d="M4 11h16"/><path d="M8 15h2v2h-2z"/>',
  download: '<path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2"/><path d="M7 11l5 5l5 -5"/><path d="M12 4v12"/>',
  upload: '<path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2"/><path d="M7 9l5 -5l5 5"/><path d="M12 4v12"/>'
};
function ic(name, cls) {
  return `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

/* ------------------------------------------------------------------ */
/*  Theme                                                             */
/* ------------------------------------------------------------------ */
function storedTheme() { try { return localStorage.getItem('theme'); } catch (e) { return null; } }
function saveTheme(t) { try { localStorage.setItem('theme', t); } catch (e) {} }
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  const meta = document.getElementById('theme-color-meta');
  if (meta) meta.setAttribute('content', t === 'dark' ? '#1C1B19' : '#F6F5F0');
}
function currentTheme() { return document.documentElement.getAttribute('data-theme') || 'light'; }
function initTheme() {
  const saved = storedTheme();
  if (saved === 'light' || saved === 'dark') { applyTheme(saved); return; }
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(prefersDark ? 'dark' : 'light');
}
function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  saveTheme(next);
}

/* ------------------------------------------------------------------ */
/*  Weight graph                                                      */
/* ------------------------------------------------------------------ */
function buildGraph(weights) {
  const pts = weights.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-14);
  if (pts.length === 0) return '';
  const W = 288, H = 96, padX = 6, padTop = 12, padBot = 16;
  const vals = pts.map((p) => p.value);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const n = pts.length;
  const xAt = (i) => (n === 1 ? W / 2 : padX + (i * (W - 2 * padX)) / (n - 1));
  const yAt = (v) => padTop + ((max - v) / (max - min)) * (H - padTop - padBot);
  const coords = pts.map((p, i) => [xAt(i), yAt(p.value)]);
  const last = coords[coords.length - 1];
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight trend">`;
  s += `<line x1="${padX}" y1="${H - 8}" x2="${W - padX}" y2="${H - 8}" style="stroke:var(--line)" stroke-width="1"/>`;
  if (n > 1) {
    const poly = coords.map((c) => `${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(' ');
    s += `<polyline points="${poly}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  s += `<circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.5" fill="currentColor"/></svg>`;
  return s;
}

/* ------------------------------------------------------------------ */
/*  Calendar import (.ics via ICAL)                                   */
/* ------------------------------------------------------------------ */
function parseICS(text, source) {
  const out = [];
  const comp = new ICAL.Component(ICAL.parse(text));
  const vevents = comp.getAllSubcomponents('vevent');
  const t0 = startOfToday();
  const horizon = new Date(t0.getTime() + 400 * 86400000);
  for (const ve of vevents) {
    let ev;
    try { ev = new ICAL.Event(ve); } catch (e) { continue; }
    const id = source + '|' + (ev.uid || ev.summary + Math.random());
    const title = ev.summary || 'Untitled';
    const rrule = ve.getFirstPropertyValue('rrule');
    const yearly = rrule && String(rrule.freq) === 'YEARLY';
    if (yearly && ev.startDate) {
      out.push({ id, source, kind: 'birthday', title, month: ev.startDate.month, day: ev.startDate.day });
      continue;
    }
    let when = null, allDay = false;
    try {
      if (ev.isRecurring()) {
        const it = ev.iterator();
        let tm, guard = 0;
        while ((tm = it.next()) && guard++ < 800) {
          const d = tm.toJSDate();
          if (d >= t0) { when = d; allDay = tm.isDate; break; }
          if (d > horizon) break;
        }
      } else if (ev.startDate) {
        const d = ev.startDate.toJSDate();
        if (d >= t0) { when = d; allDay = ev.startDate.isDate; }
      }
    } catch (e) { when = null; }
    if (when && when <= horizon) {
      out.push({ id, source, kind: 'event', title, when: when.toISOString(), allDay });
    }
  }
  return out;
}

async function importICS(file) {
  if (typeof ICAL === 'undefined') { toast('Calendar reader did not load'); return; }
  let text;
  try { text = await file.text(); } catch (e) { toast('Could not read that file'); return; }
  let records;
  try { records = parseICS(text, file.name); } catch (e) { toast('That is not a calendar file'); return; }
  const existing = await getAll('events');
  for (const ex of existing) if (ex.source === file.name) await delItem('events', ex.id);
  for (const r of records) await putItem('events', r);
  toast(records.length ? `Imported ${records.length} date${records.length === 1 ? '' : 's'}` : 'No upcoming dates found');
  go('calendar');
}

async function upcomingEvents(limit) {
  const evs = await getAll('events');
  const t0 = startOfToday();
  const list = [];
  for (const e of evs) {
    let date;
    if (e.kind === 'birthday') date = nextBirthday(e.month, e.day);
    else { date = new Date(e.when); if (date < t0) continue; }
    list.push({ kind: e.kind, title: e.title, source: e.source, date });
  }
  list.sort((a, b) => a.date - b.date);
  return limit ? list.slice(0, limit) : list;
}

/* ------------------------------------------------------------------ */
/*  Screens                                                           */
/* ------------------------------------------------------------------ */
async function renderToday() {
  const [tasks, weights, up] = await Promise.all([getAll('tasks'), getAll('weights'), upcomingEvents(2)]);
  const open = tasks.filter((t) => !t.done).sort((a, b) => a.created - b.created);
  const today = weights.find((w) => w.date === todayKey());
  const latest = weights.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0];

  let comingHtml = '';
  if (up.length) {
    comingHtml = `<div class="sec">Coming up</div>` + up.map((e) => `
      <div class="card"><span class="lead">${ic(e.kind === 'birthday' ? 'cake' : 'calEvent')}</span>
        <div class="grow"><div>${esc(e.title)}</div><div class="meta">${fmtEventDate(e.date)} · ${relLabel(e.date)}</div></div></div>`).join('');
  }

  let taskHtml;
  if (open.length === 0) {
    taskHtml = `<div class="empty">Nothing open. Add tasks in Work or Personal.</div>`;
  } else {
    taskHtml = open.slice(0, 5).map((t) => `
      <div class="row" data-id="${t.id}">
        <button class="check" data-act="toggle" aria-label="Mark done">${ic('circle')}</button>
        <span class="label">${esc(t.text)}</span>
        <span class="meta">${LIST_LABEL[t.list] || 'Personal'}</span>
      </div>`).join('');
    if (open.length > 5) taskHtml += `<div class="meta" style="padding:10px 2px">+${open.length - 5} more</div>`;
  }

  let healthHtml;
  if (today) healthHtml = `<div class="card"><span class="lead">${ic('heart')}</span><div class="grow"><div>${today.value} lb</div><div class="meta">logged this morning</div></div></div>`;
  else if (latest) healthHtml = `<div class="card"><span class="lead">${ic('heart')}</span><div class="grow"><div>${latest.value} lb</div><div class="meta">last logged ${fmtShort(latest.date)}</div></div></div>`;
  else healthHtml = `<div class="empty">No weight logged yet. Start in the Health area.</div>`;

  const isDark = currentTheme() === 'dark';
  view().innerHTML = `
    <div class="top">
      <div><h1 class="h1">Today</h1><div class="sub">${fmtLong(new Date())}</div></div>
      <button class="iconbtn" id="theme-toggle" aria-label="Toggle dark mode">${ic(isDark ? 'sun' : 'moon')}</button>
    </div>
    ${comingHtml}
    <div class="sec">To-do</div>
    ${taskHtml}
    <div class="sec">Health</div>
    ${healthHtml}
  `;

  $('#theme-toggle').addEventListener('click', () => { toggleTheme(); renderToday(); });
  view().querySelectorAll('.row').forEach((row) => {
    row.querySelector('[data-act="toggle"]').addEventListener('click', async () => {
      const t = (await getAll('tasks')).find((x) => x.id === row.dataset.id);
      if (t) { t.done = true; await putItem('tasks', t); renderToday(); }
    });
  });
}

async function renderAreas() {
  const [tasks, weights] = await Promise.all([getAll('tasks'), getAll('weights')]);
  const openWork = tasks.filter((t) => !t.done && (t.list || 'personal') === 'work').length;
  const openPersonal = tasks.filter((t) => !t.done && (t.list || 'personal') === 'personal').length;
  const amt = (n) => (n ? n + ' open' : 'none open');
  view().innerHTML = `
    <h1 class="h1">Areas</h1>
    <div class="sub">Your topics and trackers</div>
    <div style="margin-top:14px">
      <button class="arow" data-go="health"><span class="lead">${ic('heart')}</span><span class="name">Health</span><span class="amt">${weights.length ? weights.length + ' logged' : '—'}</span><span class="chev">${ic('chevR')}</span></button>
      <button class="arow" data-go="work"><span class="lead">${ic('briefcase')}</span><span class="name">Work</span><span class="amt">${amt(openWork)}</span><span class="chev">${ic('chevR')}</span></button>
      <button class="arow" data-go="personal"><span class="lead">${ic('user')}</span><span class="name">Personal</span><span class="amt">${amt(openPersonal)}</span><span class="chev">${ic('chevR')}</span></button>
      <button class="arow" data-go="goals"><span class="lead">${ic('target')}</span><span class="name">Goals</span><span class="amt">notepad</span><span class="chev">${ic('chevR')}</span></button>
    </div>
    <div class="note">Birthdays and imported calendars live under the <strong>Calendar</strong> tab.</div>
  `;
  view().querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
}

async function renderHealth() {
  const weights = await getAll('weights');
  const sorted = weights.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const today = weights.find((w) => w.date === todayKey());
  const latest = sorted[0];

  let headline;
  if (today) headline = `<div class="label-min">This morning</div><div class="big">${today.value}<span class="u">lb</span></div><div class="logged">logged today</div>`;
  else if (latest) headline = `<div class="label-min">Last logged ${fmtShort(latest.date)}</div><div class="big">${latest.value}<span class="u">lb</span></div><div class="logged">not logged yet today</div>`;
  else headline = `<div class="empty">Log your weight each morning and a trend line will build here.</div>`;

  const graph = weights.length ? `<div class="graph">${buildGraph(weights)}</div>` : '';
  let recent = '';
  if (sorted.length) {
    recent = `<div class="sec">Recent</div>` + sorted.slice(0, 10).map((w) => `
      <div class="entry" data-date="${w.date}"><span class="d">${fmtShort(w.date)}</span><span class="v">${w.value} lb</span>
        <button class="del" data-act="del" aria-label="Delete entry">${ic('trash')}</button></div>`).join('');
  }

  view().innerHTML = `
    <button class="back" data-back>${ic('chevL')} Areas</button>
    <h1 class="h1">Health</h1>
    ${headline}${graph}
    <div class="field">
      <input id="w-input" type="text" inputmode="decimal" placeholder="${today ? 'Update today’s weight' : 'Weight this morning (lb)'}" />
      <button class="btn" id="w-log">${today ? 'Update' : 'Log'}</button>
    </div>
    ${recent}
  `;

  $('[data-back]').addEventListener('click', () => go('areas'));
  const input = $('#w-input');
  const log = async () => {
    const v = parseFloat(String(input.value).replace(',', '.'));
    if (isNaN(v) || v <= 0) { toast('Enter a number'); return; }
    await putItem('weights', { date: todayKey(), value: Math.round(v * 10) / 10, logged: Date.now() });
    toast('Logged'); renderHealth();
  };
  $('#w-log').addEventListener('click', log);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') log(); });
  view().querySelectorAll('[data-act="del"]').forEach((b) =>
    b.addEventListener('click', async () => { await delItem('weights', b.closest('.entry').dataset.date); renderHealth(); }));
}

async function renderTaskList(list) {
  const label = LIST_LABEL[list] || 'Personal';
  const all = (await getAll('tasks')).filter((t) => (t.list || 'personal') === list)
    .sort((a, b) => (a.done !== b.done ? (a.done ? 1 : -1) : a.created - b.created));

  let listHtml;
  if (all.length === 0) listHtml = `<div class="empty">No ${label.toLowerCase()} tasks yet. Add one below.</div>`;
  else listHtml = all.map((t) => `
    <div class="row ${t.done ? 'done' : ''}" data-id="${t.id}">
      <button class="check" data-act="toggle" aria-label="${t.done ? 'Mark not done' : 'Mark done'}">${ic(t.done ? 'checkCircle' : 'circle')}</button>
      <span class="label">${esc(t.text)}</span>
      <button class="del" data-act="del" aria-label="Delete task">${ic('trash')}</button>
    </div>`).join('');

  view().innerHTML = `
    <button class="back" data-back>${ic('chevL')} Areas</button>
    <h1 class="h1">${label}</h1>
    <div class="field">
      <input id="t-input" type="text" placeholder="Add a ${label.toLowerCase()} task" autocomplete="off" />
      <button class="btn" id="t-add">Add</button>
    </div>
    <div style="margin-top:6px">${listHtml}</div>
  `;

  $('[data-back]').addEventListener('click', () => go('areas'));
  const input = $('#t-input');
  const add = async () => {
    const text = input.value.trim();
    if (!text) return;
    await putItem('tasks', { id: uid(), text, done: false, created: Date.now(), list });
    renderTaskList(list);
  };
  $('#t-add').addEventListener('click', add);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  view().querySelectorAll('.row').forEach((row) => {
    row.querySelector('[data-act="toggle"]').addEventListener('click', async () => {
      const t = (await getAll('tasks')).find((x) => x.id === row.dataset.id);
      if (t) { t.done = !t.done; await putItem('tasks', t); renderTaskList(list); }
    });
    row.querySelector('[data-act="del"]').addEventListener('click', async () => {
      await delItem('tasks', row.dataset.id); renderTaskList(list);
    });
  });
  if (all.length === 0) input.focus();
}
const renderWork = () => renderTaskList('work');
const renderPersonal = () => renderTaskList('personal');

async function renderGoals() {
  const notes = await getAll('notes');
  const goals = notes.find((n) => n.id === 'goals');
  const text = goals ? goals.text : '';
  view().innerHTML = `
    <button class="back" data-back>${ic('chevL')} Areas</button>
    <h1 class="h1">Goals</h1>
    <div class="sub">A blank page for whatever you're working toward. Saves as you type.</div>
    <textarea id="goals-text" class="notepad" placeholder="Write your goals, plans, or notes to yourself…" spellcheck="true">${esc(text)}</textarea>
    <div class="savehint" id="save-hint">${text ? 'Saved' : ''}</div>
  `;
  $('[data-back]').addEventListener('click', () => go('areas'));
  const ta = $('#goals-text');
  const hint = $('#save-hint');
  let timer = null;
  ta.addEventListener('input', () => {
    hint.textContent = 'Saving…';
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try { await putItem('notes', { id: 'goals', text: ta.value }); hint.textContent = 'Saved'; }
      catch (e) { hint.textContent = 'Not saved'; }
    }, 500);
  });
}

async function renderCalendar() {
  const up = await upcomingEvents(60);
  let body;
  if (up.length === 0) {
    body = `<div class="empty">No dates yet. Import a calendar file (<code>.ics</code>) exported from iCloud or Outlook, and your upcoming birthdays and events will appear here.</div>
      <button class="btn block" id="do-import-ics">${ic('upload')} &nbsp;Import calendar file</button>`;
  } else {
    body = up.map((e) => `
      <div class="evrow"><span class="lead">${ic(e.kind === 'birthday' ? 'cake' : 'calEvent')}</span>
        <div class="grow"><div>${esc(e.title)}</div><div class="meta">${fmtEventDate(e.date)} · ${relLabel(e.date)}</div></div></div>`).join('');
    body += `<button class="btn block" id="do-import-ics">${ic('upload')} &nbsp;Import / refresh a calendar</button>
      <button class="btn block ghost" id="do-clear-ics">Remove all imported dates</button>`;
  }

  view().innerHTML = `
    <h1 class="h1">Calendar</h1>
    <div class="sub">Birthdays and important dates</div>
    <div style="margin-top:14px">${body}</div>
    <div class="note">Imported dates are a snapshot. Re-import the file to refresh after your calendar changes.</div>
  `;

  const imp = $('#do-import-ics');
  if (imp) imp.addEventListener('click', () => document.getElementById('ics-file').click());
  const clr = $('#do-clear-ics');
  if (clr) clr.addEventListener('click', async () => {
    if (!confirm('Remove all imported calendar dates? Your tasks and health data are not affected.')) return;
    await clearStore('events'); toast('Imported dates removed'); renderCalendar();
  });
}

async function renderBackup() {
  const [tasks, weights, events] = await Promise.all([getAll('tasks'), getAll('weights'), getAll('events')]);
  view().innerHTML = `
    <h1 class="h1">Backup</h1>
    <div class="sub">Your data lives only on this device. Back it up so you never lose it.</div>
    <div class="card" style="margin-top:18px"><span class="lead">${ic('download')}</span>
      <div class="grow"><div>${tasks.length} task${tasks.length === 1 ? '' : 's'} · ${weights.length} weight ${weights.length === 1 ? 'entry' : 'entries'}</div>
      <div class="meta">${events.length} imported date${events.length === 1 ? '' : 's'}</div></div></div>
    <button class="btn block" id="do-export">${ic('download')} &nbsp;Download backup</button>
    <button class="btn block ghost" id="do-import">${ic('upload')} &nbsp;Restore from backup</button>
    <div class="note"><strong>Download backup</strong> saves one readable file you can keep in Files, iCloud Drive, or email to yourself. <strong>Restore</strong> reads it back in — after clearing browser data, or on a new phone. Restoring replaces what's currently in the app.</div>
  `;
  $('#do-export').addEventListener('click', exportData);
  $('#do-import').addEventListener('click', () => document.getElementById('import-file').click());
}

async function exportData() {
  try {
    const [tasks, weights, events, notes] = await Promise.all([getAll('tasks'), getAll('weights'), getAll('events'), getAll('notes')]);
    const bundle = { app: 'personal-dashboard', version: 3, exported: new Date().toISOString(), data: { tasks, weights, events, notes } };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `dashboard-backup-${todayKey()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast('Backup downloaded');
  } catch (e) { toast('Could not export'); }
}

async function importBackup(file) {
  let bundle;
  try { bundle = JSON.parse(await file.text()); } catch (e) { toast('That file could not be read'); return; }
  if (!bundle || !bundle.data) { toast('Not a dashboard backup'); return; }
  if (!confirm('Restore this backup? It replaces the data currently in the app.')) return;
  try {
    await clearStore('tasks'); await clearStore('weights'); await clearStore('events'); await clearStore('notes');
    for (const t of bundle.data.tasks || []) await putItem('tasks', t);
    for (const w of bundle.data.weights || []) await putItem('weights', w);
    for (const ev of bundle.data.events || []) await putItem('events', ev);
    for (const n of bundle.data.notes || []) await putItem('notes', n);
    toast('Backup restored'); go('today');
  } catch (e) { toast('Restore failed'); }
}

/* ------------------------------------------------------------------ */
/*  Router                                                            */
/* ------------------------------------------------------------------ */
const ROUTES = {
  today: renderToday, areas: renderAreas, health: renderHealth,
  work: renderWork, personal: renderPersonal, goals: renderGoals, calendar: renderCalendar, backup: renderBackup
};
const NAV_OF = { today: 'today', areas: 'areas', health: 'areas', work: 'areas', personal: 'areas', goals: 'areas', calendar: 'calendar', backup: 'backup' };

let current = 'today';
async function go(route) {
  current = ROUTES[route] ? route : 'today';
  updateNav();
  try { await ROUTES[current](); }
  catch (e) {
    view().innerHTML = `<h1 class="h1">Something went wrong</h1>
      <div class="empty">This app needs to run from a web address (not opened as a file). Once it's on GitHub Pages it will work. If it already is, try reloading.</div>`;
  }
  window.scrollTo(0, 0);
}
function updateNav() {
  const active = NAV_OF[current];
  document.querySelectorAll('.nav-btn').forEach((b) => {
    const on = b.dataset.route === active;
    b.classList.toggle('active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
}

/* ------------------------------------------------------------------ */
/*  Boot                                                              */
/* ------------------------------------------------------------------ */
function boot() {
  initTheme();
  document.querySelectorAll('.nav-btn').forEach((b) => b.addEventListener('click', () => go(b.dataset.route)));
  document.getElementById('import-file').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) importBackup(f);
  });
  document.getElementById('ics-file').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) importICS(f);
  });
  go('today');
  if ('serviceWorker' in navigator) {
    let refreshing = false;
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // Only auto-reload for genuine updates, not the first install.
      if (refreshing || !hadController) return;
      refreshing = true;
      window.location.reload();
    });
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js')
        .then((reg) => { reg.update(); })
        .catch(() => {});
    });
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
