/* Minimal offline .xlsx reader. Exposes the small slice of the SheetJS API that the app uses:
   XLSX.read(arrayBuffer) -> Promise<workbook>, XLSX.utils.sheet_to_json(sheet) -> rows (array of arrays).
   An .xlsx is a zip of XML files. Needs DecompressionStream (all current Chrome / Android WebView). */
(function (g) {
  'use strict';
  var td = new TextDecoder('utf-8');
  async function inflateRaw(u8) {
    var stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  function unzip(buf) {
    var u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), i, files = {};
    for (i = u8.length - 22; i >= 0 && dv.getUint32(i, true) !== 0x06054b50; i--) {}
    if (i < 0) throw new Error('This does not look like an .xlsx file.');
    var n = dv.getUint16(i + 10, true), p = dv.getUint32(i + 16, true);
    for (var k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('The .xlsx file is damaged.');
      var method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      var nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      var name = td.decode(u8.subarray(p + 46, p + 46 + nl));
      files[name] = { method: method, csize: csize, off: off };
      p += 46 + nl + el + cl;
    }
    async function get(name) {
      var f = files[name];
      if (!f) return null;
      var ln = dv.getUint16(f.off + 26, true), le = dv.getUint16(f.off + 28, true), start = f.off + 30 + ln + le;
      var data = u8.subarray(start, start + f.csize);
      if (f.method === 0) return data;
      if (f.method === 8) return inflateRaw(data);
      throw new Error('Unsupported compression in the .xlsx file.');
    }
    return { has: function (n) { return !!files[n]; }, text: async function (n) { var d = await get(n); return d ? td.decode(d) : null; } };
  }
  function xml(s) { return new DOMParser().parseFromString(s, 'application/xml'); }
  function kids(el, name) { var out = []; for (var c = el.firstElementChild; c; c = c.nextElementSibling) if (c.localName === name) out.push(c); return out; }
  function textOf(si) {
    var out = '';
    (function walk(e) {
      for (var c = e.firstElementChild; c; c = c.nextElementSibling) {
        if (c.localName === 't') out += c.textContent;
        else if (c.localName !== 'rPh' && c.localName !== 'phoneticPr') walk(c);
      }
    })(si);
    return out;
  }
  function colIdx(ref) {
    var m = /^([A-Z]+)(\d+)$/.exec(ref || ''), n = 0;
    if (!m) return null;
    for (var i = 0; i < m[1].length; i++) n = n * 26 + (m[1].charCodeAt(i) - 64);
    return { c: n - 1, r: +m[2] - 1 };
  }
  function parseSheet(doc, sst) {
    var rows = [], nextR = 0, maxC = 0;
    var data = doc.getElementsByTagName('sheetData')[0];
    if (!data) return rows;
    kids(data, 'row').forEach(function (row) {
      var rr = row.getAttribute('r') ? +row.getAttribute('r') - 1 : nextR;
      nextR = rr + 1;
      var out = rows[rr] || (rows[rr] = []), nextC = 0;
      kids(row, 'c').forEach(function (c) {
        var pos = colIdx(c.getAttribute('r')), ci = pos ? pos.c : nextC;
        nextC = ci + 1;
        var t = c.getAttribute('t'), v = kids(c, 'v')[0], val = null;
        if (t === 'inlineStr') { var is = kids(c, 'is')[0]; val = is ? textOf(is) : null; }
        else if (v && v.textContent !== '') {
          var raw = v.textContent;
          if (t === 's') val = sst[+raw] != null ? sst[+raw] : null;
          else if (t === 'str') val = raw;
          else if (t === 'b') val = raw === '1';
          else if (t === 'e') val = null;
          else { val = parseFloat(raw); if (isNaN(val)) val = raw; }
        }
        out[ci] = val;
        if (ci + 1 > maxC) maxC = ci + 1;
      });
    });
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i] || (rows[i] = []);
      for (var j = 0; j < maxC; j++) if (r[j] === undefined) r[j] = null;
    }
    return rows;
  }
  async function read(buf) {
    var z = await unzip(buf);
    var wbText = await z.text('xl/workbook.xml');
    if (!wbText) throw new Error('This does not look like an .xlsx file.');
    var wb = xml(wbText), relText = await z.text('xl/_rels/workbook.xml.rels'), rels = {};
    if (relText) Array.prototype.forEach.call(xml(relText).getElementsByTagName('Relationship'), function (r) { rels[r.getAttribute('Id')] = r.getAttribute('Target'); });
    var sst = [], sstText = await z.text('xl/sharedStrings.xml');
    if (sstText) Array.prototype.forEach.call(xml(sstText).getElementsByTagName('si'), function (si) { sst.push(textOf(si)); });
    var names = [], sheets = {}, list = wb.getElementsByTagName('sheet');
    for (var i = 0; i < list.length; i++) {
      var name = list[i].getAttribute('name'), rid = list[i].getAttribute('r:id') || list[i].getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      var target = rels[rid] || ('worksheets/sheet' + (i + 1) + '.xml');
      var path = target.charAt(0) === '/' ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
      var sx = await z.text(path);
      if (!sx) continue;
      names.push(name);
      sheets[name] = { __rows: parseSheet(xml(sx), sst) };
    }
    return { SheetNames: names, Sheets: sheets };
  }
  if (!g.XLSX) g.XLSX = { read: read, utils: { sheet_to_json: function (ws) { return ws.__rows; } } };
})(typeof window !== 'undefined' ? window : globalThis);
