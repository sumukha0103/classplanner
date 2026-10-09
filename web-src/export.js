/* Report writers with no libraries: a PDF (A4 landscape) and an .xlsx workbook.
   Input (built by the app):
   { name, reg, info, date:'YYYY-MM-DD', min:85, withList:bool,
     courses:[{ name, code, credits, allowed, term, held, A, C, M, X, pct:number|null, status,
                sessions:[{ d:'YYYY-MM-DD', t:'8:45 - 10:00', n:number|null, st:'Attended' }] }] } */

const TT_HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const TT_HELVB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
const TT_WIN = { '–': 150, '—': 151, '·': 183, '‘': 145, '’': 146, '“': 147, '”': 148, '•': 149, '…': 133, '€': 128 };

function ttPdfCode(ch) {
  const c = ch.charCodeAt(0);
  if (c >= 32 && c <= 126) return c;
  if (TT_WIN[ch]) return TT_WIN[ch];
  if (c >= 160 && c <= 255) return c;
  return 63;
}
function ttPdfEsc(s) {
  let o = '';
  for (const ch of String(s)) {
    const c = ttPdfCode(ch);
    if (c === 40 || c === 41 || c === 92) o += '\\' + String.fromCharCode(c);
    else if (c >= 32 && c <= 126) o += String.fromCharCode(c);
    else o += '\\' + c.toString(8).padStart(3, '0');
  }
  return o;
}
function ttPdfW(s, size, bold) {
  let w = 0;
  for (const ch of String(s)) {
    const c = ttPdfCode(ch), t = bold ? TT_HELVB : TT_HELV;
    w += c >= 32 && c <= 126 ? t[c - 32] : 556;
  }
  return w * size / 1000;
}
function ttPdfFit(s, width, size, bold) {
  s = String(s);
  if (ttPdfW(s, size, bold) <= width) return s;
  while (s.length > 1 && ttPdfW(s + '...', size, bold) > width) s = s.slice(0, -1);
  return s.trimEnd() + '...';
}
function ttNiceDate(d) {
  const a = d.split('-').map(Number), dt = new Date(a[0], a[1] - 1, a[2]);
  return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dt.getDay()] + ' ' + a[2] + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][a[1] - 1] + ' ' + a[0];
}
function ttPctText(p) { if (p == null) return '-'; const r = Math.round(p * 10) / 10; return (Number.isInteger(r) ? String(r) : r.toFixed(1)) + '%'; }

function ttPdf(rep) {
  const W = 842, H = 595, M = 40, pages = [];
  let cur = null, y = 0;
  const RED = '0.72 0.11 0.11', AMB = '0.70 0.45 0.02', GRN = '0.10 0.50 0.25', GREY = '0.40 0.40 0.40', INK = '0.10 0.10 0.12';
  function text(x, yy, s, o) {
    o = o || {};
    const size = o.size || 9, bold = !!o.bold;
    let xx = x;
    if (o.align === 'r') xx = x - ttPdfW(s, size, bold);
    cur.push('BT ' + (o.color || INK) + ' rg /' + (bold ? 'F2' : 'F1') + ' ' + size + ' Tf ' + xx.toFixed(2) + ' ' + yy.toFixed(2) + ' Td (' + ttPdfEsc(s) + ') Tj ET');
  }
  function rule(yy, grey) { cur.push((grey || '0.80 0.80 0.82') + ' RG 0.6 w ' + M + ' ' + yy.toFixed(2) + ' m ' + (W - M) + ' ' + yy.toFixed(2) + ' l S'); }
  function newPage() {
    cur = []; pages.push(cur); y = H - M;
    if (pages.length > 1) {
      text(M, y - 6, 'Attendance report' + (rep.name ? ' - ' + rep.name : ''), { size: 8, color: GREY });
      text(W - M, y - 6, 'Page ' + pages.length, { size: 8, color: GREY, align: 'r' });
      y -= 22;
    }
  }
  function need(h) { if (y - h < M + 14) newPage(); }
  newPage();
  text(M, y - 16, 'Attendance report', { size: 20, bold: true }); y -= 30;
  const who = [];
  who.push('Name: ' + (rep.name || '__________________________'));
  who.push('Reg. no: ' + (rep.reg || '________________'));
  text(M, y - 10, who.join('        '), { size: 10 }); y -= 16;
  if (rep.info) { text(M, y - 10, rep.info, { size: 9.5, color: GREY }); y -= 14; }
  text(M, y - 10, 'Generated on ' + ttNiceDate(rep.date) + '.  Minimum attendance required: ' + rep.min + '%.', { size: 9.5, color: GREY }); y -= 22;

  const cx = { cr: 315, term: 365, held: 405, att: 455, cond: 520, miss: 565, canc: 620, pct: 675, st: 690 };
  function head() {
    const yy = y - 9;
    text(M, yy, 'Course', { size: 8, bold: true, color: GREY });
    text(cx.cr, yy, 'Credits', { size: 8, bold: true, color: GREY, align: 'r' });
    text(cx.term, yy, 'In term', { size: 8, bold: true, color: GREY, align: 'r' });
    text(cx.held, yy, 'Held', { size: 8, bold: true, color: GREY, align: 'r' });
    text(cx.att, yy, 'Attended', { size: 8, bold: true, color: GREY, align: 'r' });
    text(cx.cond, yy, 'Condonation', { size: 8, bold: true, color: GREY, align: 'r' });
    text(cx.miss, yy, 'Missed', { size: 8, bold: true, color: GREY, align: 'r' });
    text(cx.canc, yy, 'Cancelled', { size: 8, bold: true, color: GREY, align: 'r' });
    text(cx.pct, yy, 'Attendance', { size: 8, bold: true, color: GREY, align: 'r' });
    text(cx.st, yy, 'Status', { size: 8, bold: true, color: GREY });
    y -= 14; rule(y, '0.35 0.35 0.38'); y -= 3;
  }
  head();
  rep.courses.forEach(function (c) {
    need(20);
    const yy = y - 13;
    text(M, yy, ttPdfFit(c.name + '  (' + c.code + ')', 262, 9, false), { size: 9 });
    text(cx.cr, yy, String(c.credits), { align: 'r' });
    text(cx.term, yy, String(c.term), { align: 'r' });
    text(cx.held, yy, String(c.held), { align: 'r' });
    text(cx.att, yy, String(c.A), { align: 'r' });
    text(cx.cond, yy, String(c.C), { align: 'r' });
    text(cx.miss, yy, c.M + ' of ' + c.allowed, { align: 'r' });
    text(cx.canc, yy, String(c.X), { align: 'r' });
    text(cx.pct, yy, ttPctText(c.pct), { align: 'r', bold: true, color: c.pct != null && Math.round(c.pct * 1e6) / 1e6 < rep.min ? RED : INK });
    text(cx.st, yy, c.status, { size: 8.5, color: /exceeded/i.test(c.status) ? RED : /no misses/i.test(c.status) ? AMB : /not started/i.test(c.status) ? GREY : GRN });
    y -= 20; rule(y);
  });
  y -= 6;
  need(40);
  const notes = [
    'Attendance % = (Attended + Condonation) / classes held. Cancelled classes are not counted. "Missed x of y" shows misses used against the allowed number (equal to the credits).',
    'Sessions in term follow the standard of 8 per credit unless changed for a course.'
  ];
  notes.forEach(function (n) { text(M, y - 9, n, { size: 8, color: GREY }); y -= 12; });

  if (rep.withList) {
    rep.courses.forEach(function (c) {
      if (!c.sessions.length) return;
      need(70); y -= 14;
      text(M, y - 11, c.name + '  (' + c.code + ')', { size: 12, bold: true }); y -= 18;
      text(M, y - 9, c.A + ' attended, ' + c.C + ' condonation, ' + c.M + ' missed' + (c.X ? ', ' + c.X + ' cancelled' : '') + ' - ' + ttPctText(c.pct), { size: 8.5, color: GREY }); y -= 14;
      const col = { d: M, t: M + 130, n: M + 250, s: M + 320 };
      text(col.d, y - 8, 'Date', { size: 8, bold: true, color: GREY }); text(col.t, y - 8, 'Time', { size: 8, bold: true, color: GREY });
      text(col.n, y - 8, 'Session', { size: 8, bold: true, color: GREY }); text(col.s, y - 8, 'Status', { size: 8, bold: true, color: GREY });
      y -= 12; rule(y, '0.35 0.35 0.38');
      c.sessions.forEach(function (s) {
        if (y - 15 < M + 14) {
          newPage();
          text(M, y - 9, c.name + ' (continued)', { size: 9, bold: true }); y -= 16;
        }
        const yy = y - 11;
        text(col.d, yy, ttNiceDate(s.d), { size: 8.5 }); text(col.t, yy, s.t, { size: 8.5 });
        text(col.n, yy, s.n ? String(s.n) : '-', { size: 8.5 });
        text(col.s, yy, s.st, { size: 8.5, color: s.st === 'Missed' ? RED : s.st === 'Attended' ? GRN : s.st === 'Condonation' ? AMB : GREY });
        y -= 14; rule(y, '0.90 0.90 0.92');
      });
    });
  }

  // assemble the file: 1 catalog, 2 pages, 3/4 fonts, 5 info, then (page, content) pairs
  const objs = [];
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  const kids = pages.map(function (_, i) { return (6 + i * 2) + ' 0 R'; }).join(' ');
  objs[2] = '<< /Type /Pages /Kids [' + kids + '] /Count ' + pages.length + ' >>';
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  objs[5] = '<< /Title (' + ttPdfEsc('Attendance report') + ') /Producer (Class Planner) >>';
  pages.forEach(function (ops, i) {
    const body = ops.join('\n');
    objs[6 + i * 2] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + (7 + i * 2) + ' 0 R >>';
    objs[7 + i * 2] = '<< /Length ' + body.length + ' >>\nstream\n' + body + '\nendstream';
  });
  let out = '%PDF-1.4\n';
  const off = [];
  for (let i = 1; i < objs.length; i++) { off[i] = out.length; out += i + ' 0 obj\n' + objs[i] + '\nendobj\n'; }
  const xr = out.length;
  out += 'xref\n0 ' + objs.length + '\n0000000000 65535 f \n';
  for (let i = 1; i < objs.length; i++) out += String(off[i]).padStart(10, '0') + ' 00000 n \n';
  out += 'trailer\n<< /Size ' + objs.length + ' /Root 1 0 R /Info 5 0 R >>\nstartxref\n' + xr + '\n%%EOF\n';
  const u8 = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) u8[i] = out.charCodeAt(i) & 255;
  return u8;
}

/* ---------- .xlsx ---------- */
let TT_CRC = null;
function ttCrc(u8) {
  if (!TT_CRC) { TT_CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; TT_CRC[n] = c >>> 0; } }
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = TT_CRC[(c ^ u8[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function ttZip(files) {          // stored (uncompressed) zip
  const enc = new TextEncoder(), parts = [], central = [];
  let off = 0;
  const u16 = function (v) { return [v & 255, (v >> 8) & 255]; };
  const u32 = function (v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; };
  files.forEach(function (f) {
    const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = ttCrc(data);
    const lh = [0x50, 0x4b, 3, 4].concat(u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
    parts.push(Uint8Array.from(lh), name, data);
    central.push({ name: name, crc: crc, size: data.length, off: off });
    off += lh.length + name.length + data.length;
  });
  const cdStart = off;
  central.forEach(function (c) {
    const ch = [0x50, 0x4b, 1, 2].concat(u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(c.crc), u32(c.size), u32(c.size), u16(c.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.off));
    parts.push(Uint8Array.from(ch), c.name);
    off += ch.length + c.name.length;
  });
  const end = [0x50, 0x4b, 5, 6].concat(u16(0), u16(0), u16(central.length), u16(central.length), u32(off - cdStart), u32(cdStart), u16(0));
  parts.push(Uint8Array.from(end));
  let total = 0; parts.forEach(function (p) { total += p.length; });
  const out = new Uint8Array(total); let o = 0;
  parts.forEach(function (p) { out.set(p, o); o += p.length; });
  return out;
}
function ttXml(s) { return String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function ttColName(i) { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
function ttSheetXml(rows, widths) {
  // a cell is a string, a number, null, or { v, b:true } for bold, { v, f:true } for one-decimal numbers
  let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
  if (widths) x += '<cols>' + widths.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols>';
  x += '<sheetData>';
  rows.forEach(function (r, ri) {
    x += '<row r="' + (ri + 1) + '">';
    r.forEach(function (c, ci) {
      if (c == null || c === '') return;
      const ref = ttColName(ci) + (ri + 1);
      let v = c, s = 0;
      if (typeof c === 'object') { v = c.v; s = c.b ? 1 : c.f ? 2 : 0; }
      if (v == null || v === '') return;
      if (typeof v === 'number') x += '<c r="' + ref + '"' + (s ? ' s="' + s + '"' : '') + '><v>' + v + '</v></c>';
      else x += '<c r="' + ref + '" t="inlineStr"' + (s ? ' s="' + s + '"' : '') + '><is><t xml:space="preserve">' + ttXml(v) + '</t></is></c>';
    });
    x += '</row>';
  });
  return x + '</sheetData></worksheet>';
}
function ttXlsx(rep) {
  const B = function (v) { return { v: v, b: true }; };
  const sum = [[B('Attendance report')], ['Name', rep.name || ''], ['Reg. no', rep.reg || ''], ['Programme', rep.info || ''], ['Generated', ttNiceDate(rep.date)], ['Minimum required (%)', rep.min], []];
  sum.push([B('Course'), B('Code'), B('Credits'), B('Sessions in term'), B('Held'), B('Attended'), B('Condonation'), B('Missed'), B('Misses allowed'), B('Cancelled'), B('Attendance (%)'), B('Status')]);
  rep.courses.forEach(function (c) {
    sum.push([c.name, c.code, c.credits, c.term, c.held, c.A, c.C, c.M, c.allowed, c.X, c.pct == null ? null : { v: Math.round(c.pct * 10) / 10, f: true }, c.status]);
  });
  sum.push([], ['Attendance = (Attended + Condonation) / classes held. Cancelled classes are not counted.']);
  const ses = [[B('Course'), B('Code'), B('Date'), B('Time'), B('Session'), B('Status')]];
  rep.courses.forEach(function (c) { c.sessions.forEach(function (s) { ses.push([c.name, c.code, ttNiceDate(s.d), s.t, s.n || null, s.st]); }); });
  const withList = rep.withList && ses.length > 1;
  const sheets = [['Summary', ttSheetXml(sum, [34, 12, 9, 15, 8, 10, 12, 8, 14, 10, 15, 16])]];
  if (withList) sheets.push(['Sessions', ttSheetXml(ses, [34, 12, 16, 16, 9, 14])]);
  const files = [];
  files.push({ name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' + sheets.map(function (_, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' });
  files.push({ name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' });
  files.push({ name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + sheets.map(function (s, i) { return '<sheet name="' + s[0] + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets></workbook>' });
  files.push({ name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map(function (_, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') + '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' });
  files.push({ name: 'xl/styles.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.0"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>' });
  sheets.forEach(function (s, i) { files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: s[1] }); });
  return ttZip(files);
}

if (typeof module !== 'undefined') module.exports = { ttPdf, ttXlsx, ttZip, ttCrc };
