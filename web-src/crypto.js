/* Encryption for backup and sync files (WebCrypto, no libraries).
   File layout: "CPENC1" | salt(16) | iv(12) | AES-256-GCM ciphertext+tag. Key = PBKDF2-SHA256(passphrase, salt, 250000). */
const TT_MAGIC = [0x43, 0x50, 0x45, 0x4e, 0x43, 0x31];
const TT_ITER = 250000;
let TT_KEYS = {};
function ttCanEncrypt() { return typeof crypto !== 'undefined' && !!crypto.subtle && typeof TextEncoder !== 'undefined'; }
function ttIsEnc(u8) { return !!u8 && u8.length > 6 + 16 + 12 + 16 && TT_MAGIC.every((b, i) => u8[i] === b); }
async function ttKey(pass, salt) {
  const id = pass + '|' + Array.prototype.join.call(salt, ',');
  if (TT_KEYS[id]) return TT_KEYS[id];
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: TT_ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  if (Object.keys(TT_KEYS).length > 6) TT_KEYS = {};
  return (TT_KEYS[id] = key);
}
let TT_SALT = null;
async function ttEncrypt(u8, pass) {
  if (!pass) throw new Error('no-pass');
  if (!TT_SALT) TT_SALT = crypto.getRandomValues(new Uint8Array(16));   // one salt per session; every file gets a fresh IV
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await ttKey(pass, TT_SALT);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, u8));
  const out = new Uint8Array(6 + 16 + 12 + ct.length);
  out.set(TT_MAGIC, 0); out.set(TT_SALT, 6); out.set(iv, 22); out.set(ct, 34);
  return out;
}
async function ttDecrypt(u8, pass) {
  if (!ttIsEnc(u8)) throw new Error('not-encrypted');
  if (!pass) throw new Error('no-pass');
  const salt = u8.slice(6, 22), iv = u8.slice(22, 34), ct = u8.slice(34);
  const key = await ttKey(pass, salt);
  try { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct)); }
  catch (e) { throw new Error('bad-pass'); }
}
function ttB64(u8) { let s = ''; const n = 0x8000; for (let i = 0; i < u8.length; i += n) s += String.fromCharCode.apply(null, u8.subarray(i, i + n)); return btoa(s); }
function ttFromB64(b) { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
/* stable JSON (sorted keys) and a quick 53-bit hash, to tell whether data changed */
function ttStable(o) {
  if (o === null || typeof o !== 'object') return JSON.stringify(o);
  if (Array.isArray(o)) return '[' + o.map(ttStable).join(',') + ']';
  return '{' + Object.keys(o).sort().filter(k => o[k] !== undefined).map(k => JSON.stringify(k) + ':' + ttStable(o[k])).join(',') + '}';
}
function ttHash(s) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
/* Merge two copies of the app's data when both phones changed. `a` = this phone, `b` = the other one; this phone wins ties. */
function ttMerge(a, b) {
  const out = JSON.parse(JSON.stringify(b));
  const A = JSON.parse(JSON.stringify(a));
  const obj = k => { out[k] = Object.assign({}, b[k] || {}, A[k] || {}); };
  ['courses', 'hidden', 'archived', 'totals', 'credOv', 'moves'].forEach(obj);
  out.months = Object.assign({}, b.months || {}, A.months || {});
  out.evs = Object.assign({}, b.evs || {}, A.evs || {});
  out.marks = {};
  new Set(Object.keys(b.marks || {}).concat(Object.keys(A.marks || {}))).forEach(ym => { out.marks[ym] = Object.assign({}, (b.marks || {})[ym] || {}, (A.marks || {})[ym] || {}); });
  const byId = (x, y) => { const m = {}; (y || []).concat(x || []).forEach(i => { m[i.id] = i; }); return Object.keys(m).map(k => m[k]); };
  out.plans = byId(A.plans, b.plans);
  out.extra = byId(A.extra, b.extra);
  out.info = A.info || b.info || null;
  out.profile = (A.profile && (A.profile.name || A.profile.reg)) ? A.profile : (b.profile || A.profile || { name: '', reg: '' });
  return out;
}
if (typeof module !== 'undefined') module.exports = { ttCanEncrypt, ttIsEnc, ttEncrypt, ttDecrypt, ttB64, ttFromB64, ttStable, ttHash, ttMerge };
