/* Shared logic: timetable parsing + import planning. Inlined into the app and reused by the seeding/test scripts. */

function ttPad(n) { return String(n).padStart(2, '0'); }

function ttToISODate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return v.getFullYear() + '-' + ttPad(v.getMonth() + 1) + '-' + ttPad(v.getDate());
  if (typeof v === 'number') {
    if (v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);
    return null;
  }
  const s = String(v).trim();
  let m;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) return m[1] + '-' + m[2] + '-' + m[3];
  if ((m = /^(\d{1,2})[-\/ .]([A-Za-z]{3,9})[-\/ .,]*(\d{4})$/.exec(s))) {
    const mi = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[2].slice(0, 3).toLowerCase());
    if (mi >= 0) return m[3] + '-' + ttPad(mi + 1) + '-' + ttPad(+m[1]);
  }
  if ((m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(s))) return m[3] + '-' + ttPad(+m[2]) + '-' + ttPad(+m[1]); // dd/mm/yyyy
  return null;
}

/* One class cell: "Name\nCODE 1234\nFaculty\nSession 3  |  2 Credits". Returns null when the cell is not a class. */
function ttParseCell(txt) {
  const L = String(txt).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (L.length < 2) return null;
  const code = L[1].replace(/\s+/g, ' ');
  if (!/^[A-Z]{2,5} ?\d{3,4}[A-Z]?$/.test(code)) return null;
  const last = L[L.length - 1];
  const sm = /Session\s*(\d+)/i.exec(last);
  const cm = /(\d+(?:\.\d+)?)\s*Credit/i.exec(last);
  const hasFac = L.length >= 4 || (L.length === 3 && !sm);
  return {
    name: L[0],
    code: code.replace(/^([A-Z]+)\s?(\d)/, '$1 $2'),
    faculty: hasFac ? L[2].replace(/^Faculty:\s*/i, '') : '',
    n: sm ? +sm[1] : null,
    credits: cm ? +cm[1] : null,
  };
}

function ttCourseKey(code) { return code.replace(/\s+/g, ''); }
function ttSessionKey(x) { return x.d.replace(/-/g, '') + '-' + x.s + '-' + x.c; }

function parseTimetable(rows) {
  const warn = [];
  const hi = rows.findIndex(r => r && String(r[0] == null ? '' : r[0]).trim().toLowerCase() === 'date');
  if (hi < 0) throw new Error('Could not find a header row that starts with "Date". Check the file matches the timetable layout.');
  const head = rows[hi];
  const slots = [];
  head.forEach((v, c) => { const t = String(v == null ? '' : v).trim(); if (/\d{1,2}:\d{2}/.test(t)) slots.push({ c, t }); });
  if (!slots.length) throw new Error('No time-slot columns found in the header row (expected headings like "8:45 - 10:00").');
  let typeCol = head.findIndex(v => /day\s*type/i.test(String(v == null ? '' : v)));
  if (typeCol < 0) typeCol = 2;

  const head4 = rows.slice(0, hi).map(r => (r || []).filter(v => typeof v === 'string').join(' ')).join(' ');
  const info = {};
  let m;
  if ((m = /\((S\d+)\)/i.exec(head4))) info.section = m[1].toUpperCase();
  if ((m = /TERM\s*(\d+)/i.exec(head4))) info.term = 'Term ' + m[1];
  if ((m = /Venue:\s*([A-Za-z0-9\-]+)/i.exec(head4))) info.venue = m[1];

  const courses = {}, sessions = [], days = {};
  let seenDate = false;
  for (let i = hi + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const d = ttToISODate(row[0]);
    if (!d) { if (seenDate) break; continue; }
    seenDate = true;
    const rec = { type: String(row[typeCol] == null ? '' : row[typeCol]).trim() };
    const texts = [];
    let hasClass = false;
    const seen = new Set();
    slots.forEach((sl, idx) => {
      const v = row[sl.c];
      if (v == null || String(v).trim() === '') return;
      const pc = ttParseCell(v);
      if (pc) {
        const ck = ttCourseKey(pc.code);
        const prev = courses[ck];
        if (prev && pc.credits != null && prev.credits !== pc.credits) warn.push(pc.code + ' shows different credit counts (' + prev.credits + ' and ' + pc.credits + '); using ' + pc.credits + '.');
        courses[ck] = {
          code: pc.code,
          name: pc.name || (prev && prev.name) || pc.code,
          faculty: pc.faculty || (prev && prev.faculty) || '',
          credits: pc.credits != null ? pc.credits : (prev ? prev.credits : null),
        };
        if (courses[ck].credits == null) warn.push(pc.code + ': no credits found in "' + String(v).replace(/\s+/g, ' ').slice(0, 60) + '"; counted as 1 credit.');
        const sk = d + '|' + idx + '|' + ck;
        if (seen.has(sk)) return;
        seen.add(sk);
        sessions.push({ d, s: idx, t: sl.t, c: ck, n: pc.n });
        hasClass = true;
      } else {
        texts.push({ s: idx, t: sl.t, x: String(v).replace(/\s+/g, ' ').trim() });
      }
    });
    const labels = [], ev = [];
    texts.forEach(tx => {
      if (!hasClass || /^(weekly off|holiday|no\b.*session)/i.test(tx.x)) { if (!labels.includes(tx.x)) labels.push(tx.x); }
      else ev.push(tx);
    });
    if (labels.length) rec.label = labels.join(' · ');
    if (ev.length) rec.ev = ev;
    days[d] = rec;
  }
  Object.keys(courses).forEach(k => { if (courses[k].credits == null) courses[k].credits = 1; });
  if (!Object.keys(days).length) throw new Error('No dated rows found under the header.');
  const dates = Object.keys(days).sort();
  return { info, courses, sessions, days, range: [dates[0], dates[dates.length - 1]], warn };
}

/* Works out what an import changes. `state` = {courses, info, months:{ym:{sessions,days}}, marks:{ym:{key:status}}}.
   Dates inside the file's date range are replaced; everything outside is kept. Marks survive for classes that still exist. */
function planImport(state, P) {
  const [lo, hi] = P.range;
  const inR = d => d >= lo && d <= hi;
  const ymOf = d => d.slice(0, 7);
  const touched = new Set();
  P.sessions.forEach(x => touched.add(ymOf(x.d)));
  Object.keys(P.days).forEach(d => touched.add(ymOf(d)));
  Object.keys(state.months).forEach(ym => { if (ym >= ymOf(lo) && ym <= ymOf(hi)) touched.add(ym); });

  const months = {}, marks = {};
  const oldKeys = new Set(), newKeys = new Set();
  touched.forEach(ym => {
    const old = state.months[ym] || { sessions: [], days: {} };
    old.sessions.forEach(x => { if (inR(x.d)) oldKeys.add(ttSessionKey(x)); });
    const sessions = old.sessions.filter(x => !inR(x.d)).concat(P.sessions.filter(x => ymOf(x.d) === ym));
    sessions.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : a.s - b.s || (a.c < b.c ? -1 : 1));
    const days = {};
    Object.keys(old.days || {}).forEach(d => { if (!inR(d)) days[d] = old.days[d]; });
    Object.keys(P.days).forEach(d => { if (ymOf(d) === ym) days[d] = P.days[d]; });
    months[ym] = { sessions, days };
  });
  P.sessions.forEach(x => newKeys.add(ttSessionKey(x)));

  let added = 0, kept = 0, removed = 0, removedMarked = 0;
  newKeys.forEach(k => { oldKeys.has(k) ? kept++ : added++; });
  const gone = [];
  oldKeys.forEach(k => { if (!newKeys.has(k)) { removed++; gone.push(k); } });
  gone.forEach(k => {
    const ym = k.slice(0, 4) + '-' + k.slice(4, 6);
    const mk = (state.marks || {})[ym];
    if (mk && mk[k]) removedMarked++;
  });
  if (gone.length) {
    const goneSet = new Set(gone);
    touched.forEach(ym => {
      const mk = (state.marks || {})[ym];
      if (!mk) return;
      let changed = false;
      const next = {};
      Object.keys(mk).forEach(k => { if (goneSet.has(k)) changed = true; else next[k] = mk[k]; });
      if (changed) marks[ym] = next;
    });
  }

  const courses = JSON.parse(JSON.stringify(state.courses || {}));
  const newCourses = [];
  const used = new Set(Object.values(courses).map(c => c.col));
  Object.keys(P.courses).forEach(k => {
    const inc = P.courses[k];
    if (courses[k]) { Object.assign(courses[k], { code: inc.code, name: inc.name, faculty: inc.faculty, credits: inc.credits }); delete courses[k].hidden; }
    else {
      let col = 0;
      while (used.has(col) && col < 7) col++;
      used.add(col);
      courses[k] = { code: inc.code, name: inc.name, faculty: inc.faculty, credits: inc.credits, col };
      newCourses.push(inc.code);
    }
  });
  const info = Object.assign({}, state.info || {}, P.info || {});
  return { months, marks, courses, info, diff: { added, kept, removed, removedMarked, newCourses, range: P.range, total: P.sessions.length } };
}


/* ---------- academic calendar ---------- */
var TT_KIND_RE = /(MID[\s-]*TERM\s+EXAM|END[\s-]*TERM\s+EXAM|LAST\s+DAY\s+OF\s+CLASSES|TERM\s+STARTS|RESULTS|REGISTRATION\s*\/\s*REGULAR\s+CLASSES)/gi;
function ttKindOf(m) {
  const k = m.toLowerCase().replace(/\s+/g, ' ');
  if (/^mid/.test(k)) return 'mid';
  if (/^end/.test(k)) return 'end';
  if (/^last/.test(k)) return 'last';
  if (/^term starts/.test(k)) return 'start';
  if (/^results/.test(k)) return 'res';
  return 'reg';
}
function ttTidy(s) {
  s = String(s).replace(/\s+/g, ' ').trim();
  if (s === 'TEDX') return 'TEDx';
  if (s === s.toUpperCase() && /[A-Z]/.test(s)) {
    s = s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/\b(Ib|Ai|Mba|Tac|Rfac)\b/g, m => m.toUpperCase());
  }
  return s;
}
function ttCalKind(cat) {
  const c = String(cat == null ? '' : cat).toLowerCase();
  if (/holiday|festival/.test(c)) return 'holiday';
  if (/exam/.test(c)) return 'exam';
  if (/milestone|term/.test(c)) return 'term';
  if (/fest|event/.test(c)) return 'fest';
  return 'other';
}
function ttDetectKind(rows) {
  const hi = rows.findIndex(r => r && String(r[0] == null ? '' : r[0]).trim().toLowerCase() === 'date');
  if (hi < 0) throw new Error('Could not find a header row that starts with "Date".');
  return rows[hi].some(v => /categor/i.test(String(v == null ? '' : v))) ? 'calendar' : 'timetable';
}

function parseCalendar(rows) {
  const hi = rows.findIndex(r => r && String(r[0] == null ? '' : r[0]).trim().toLowerCase() === 'date');
  if (hi < 0) throw new Error('Could not find a header row that starts with "Date".');
  const head = rows[hi].map(v => String(v == null ? '' : v));
  let catCol = head.findIndex(v => /categor/i.test(v));
  let noteCol = head.findIndex(v => /event|note/i.test(v));
  if (catCol < 0) throw new Error('No "Category" column found in the calendar.');
  if (noteCol < 0) noteCol = catCol + 1;
  const events = [], warn = [], dates = [], seen = new Set();
  const push = (e) => { const k = e.d + '|' + e.k + '|' + (e.kd || '') + '|' + (e.tm || '') + '|' + (e.t || ''); if (!seen.has(k)) { seen.add(k); events.push(e); } };
  for (let i = hi + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const d = ttToISODate(row[0]);
    if (!d) continue;
    dates.push(d);
    const text = String(row[noteCol] == null ? '' : row[noteCol]).replace(/\s+/g, ' ').trim();
    const cat = row[catCol];
    if (!text && (cat == null || String(cat).trim() === '')) continue;
    const rowKind = ttCalKind(cat);
    if (!text) { warn.push(d + ': category "' + cat + '" has no event name.'); continue; }
    const hits = []; let mm;
    TT_KIND_RE.lastIndex = 0;
    while ((mm = TT_KIND_RE.exec(text))) hits.push({ pos: mm.index, kd: ttKindOf(mm[0]) });
    if (!hits.length) { push({ d, k: rowKind, t: ttTidy(text) }); continue; }
    hits.forEach((h, idx) => {
      const seg = text.slice(h.pos, idx + 1 < hits.length ? hits[idx + 1].pos : text.length);
      const tm = [];
      seg.replace(/\bTERM\s*(\d)/gi, (_, n) => { if (!tm.includes(+n)) tm.push(+n); return _; });
      tm.sort();
      const ev = { d, k: (h.kd === 'mid' || h.kd === 'end') ? 'exam' : 'term', kd: h.kd };
      if (tm.length) ev.tm = tm;
      push(ev);
    });
  }
  if (!dates.length) throw new Error('No dated rows found in the calendar.');
  dates.sort();
  const byKind = {};
  events.forEach(e => { byKind[e.k] = (byKind[e.k] || 0) + 1; });
  return { events, range: [dates[0], dates[dates.length - 1]], byKind, warn };
}

/* Replaces the shared calendar events inside the file's date range. state.evs = {ym: [events]} */
function planCalendar(state, C) {
  const [lo, hi] = C.range, inR = d => d >= lo && d <= hi, ymOf = d => d.slice(0, 7);
  const touched = new Set();
  C.events.forEach(e => touched.add(ymOf(e.d)));
  Object.keys(state.evs || {}).forEach(ym => { if (ym >= ymOf(lo) && ym <= ymOf(hi)) touched.add(ym); });
  const evs = {};
  let replaced = 0;
  touched.forEach(ym => {
    const old = (state.evs || {})[ym] || [];
    replaced += old.filter(e => inR(e.d)).length;
    const next = old.filter(e => !inR(e.d)).concat(C.events.filter(e => ymOf(e.d) === ym));
    next.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0);
    evs[ym] = next;
  });
  return { evs, diff: { total: C.events.length, replaced, byKind: C.byKind, range: C.range } };
}

/* ---------- attendance forecasting ----------
   `list` = a subject's classes, each with st: 'A' attended, 'M' missed, 'C' condonation, 'X' cancelled (not held),
   or falsy for classes not marked yet. Cancelled classes count for nothing. Percentages are over held classes. */
const TT_MIN = 85;
function ttOk(good, n) { return n === 0 || good * 100 >= TT_MIN * n; }   // integer maths: no rounding surprises at exactly 85%
function ttForecast(list, allowed) {
  let A = 0, M = 0, C = 0, X = 0, R = 0;
  list.forEach(x => { if (x.st === 'A') A++; else if (x.st === 'M') M++; else if (x.st === 'C') C++; else if (x.st === 'X') X++; else R++; });
  const held = A + M + C, good = A + C, n = held + R;
  const f = { A, M, C, X, R, held, allowed, total: n, pct: held ? good * 100 / held : null,
              best: n ? (good + R) * 100 / n : null, worst: n ? good * 100 / n : null };
  f.overLimit = M > allowed;
  f.unreachable = !ttOk(good + R, n);              // below 85% even if every remaining class is attended
  let afford = -1;                                 // most of the remaining classes you can still miss
  for (let m = 0; m <= R; m++) { if (M + m <= allowed && ttOk(good + R - m, n)) afford = m; else break; }
  f.afford = afford;
  f.need = null;                                   // classes in a row to attend to get back to 85% (only when below it now)
  if (held > 0 && !ttOk(good, held)) for (let k = 1; k <= R; k++) if (ttOk(good + k, held + k)) { f.need = k; break; }
  f.low = held > 0 && !ttOk(good, held);
  return f;
}
function ttSkip(f) {                               // one class not yet held and not marked
  const good = f.A + f.C, n = f.held + f.R;
  let verdict, why;
  if (f.M + 1 > f.allowed) { verdict = 'bad'; why = 'limit'; }
  else if (!ttOk(good + f.R - 1, n)) { verdict = 'bad'; why = 'pct'; }
  else if (f.M + 1 === f.allowed) { verdict = 'warn'; why = 'last'; }
  else { verdict = 'ok'; why = 'safe'; }
  return { att: (good + 1) * 100 / (f.held + 1), miss: good * 100 / (f.held + 1), bestIfMiss: n ? (good + f.R - 1) * 100 / n : null,
           verdict, why, left: f.allowed - f.M - 1 };
}

if (typeof module !== 'undefined') module.exports = { parseTimetable, planImport, ttSessionKey, ttToISODate, ttParseCell, parseCalendar, planCalendar, ttDetectKind, ttForecast, ttSkip, ttOk };
