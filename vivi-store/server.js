'use strict';
// VIVI FASHION — خادم + قاعدة بيانات (بدون أي مكتبات خارجية). يتطلب Node.js 22.5 أو أحدث.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const PORT = process.env.PORT || 3000;
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'fu.irq7@gmail.com').toLowerCase();
const CATS = ['skirt', 'shirt', 'trench', 'vest', 'top', 'pants'];
fs.mkdirSync(DATA, { recursive: true });
const db = new DatabaseSync(path.join(DATA, 'vivi.db'));
db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name TEXT,phone TEXT,email TEXT UNIQUE,pw TEXT,admin INTEGER DEFAULT 0,created TEXT);
CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY,n TEXT,c TEXT,p INTEGER,s INTEGER,sz TEXT,img TEXT,created TEXT);
CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,uid INTEGER,name TEXT,phone TEXT,city TEXT,addr TEXT,items TEXT,total INTEGER,del INTEGER,st TEXT,created TEXT);
CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY,v TEXT);`);
const q1 = (sql, ...a) => db.prepare(sql).get(...a), qa = (sql, ...a) => db.prepare(sql).all(...a), run = (sql, ...a) => db.prepare(sql).run(...a);
const sget = k => { const r = q1('SELECT v FROM settings WHERE k=?', k); return r ? r.v : null; };
const sset = (k, v) => run('INSERT INTO settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', k, String(v));
if (!sget('secret')) sset('secret', crypto.randomBytes(32).toString('hex'));
for (const [k, v] of [['wa', '9647838363356'], ['dB', 5000], ['dO', 6000]]) if (sget(k) == null) sset(k, v);
const SECRET = sget('secret');
const hash = pw => { const s = crypto.randomBytes(16); return s.toString('hex') + ':' + crypto.scryptSync(pw, s, 64).toString('hex'); };
const verify = (pw, h) => { const [s, k] = h.split(':'); const a = crypto.scryptSync(pw, Buffer.from(s, 'hex'), 64), b = Buffer.from(k, 'hex'); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const now = () => new Date().toISOString();
if (!q1('SELECT 1 FROM users WHERE email=?', ADMIN_EMAIL))
  run('INSERT INTO users(name,phone,email,pw,admin,created) VALUES(?,?,?,?,1,?)', 'VIVI Admin', '', ADMIN_EMAIL, hash(process.env.ADMIN_PASSWORD || 'Vivi@2026'), now());
if (!q1('SELECT 1 FROM products LIMIT 1')) {
  const seed = [["Pleated Midi Skirt","تنورة بليسيه ميدي","تەنورەی میدی پلیسێ","skirt",42000,12],["Denim Mini Skirt","تنورة جينز قصيرة","تەنورەی جینزی کورت","skirt",35000,10],["Classic White Shirt","قميص أبيض كلاسيك","کراسی سپی کلاسیک","shirt",38000,15],["Oversized Striped Shirt","قميص مخطط واسع","کراسی هێڵداری فراوان","shirt",40000,9],["Beige Trench Coat","ترانش كوت بيج","ترێنچ کۆتی بێژ","trench",135000,6],["Belted Long Trench","ترانش كوت طويل بحزام","ترێنچ کۆتی درێژ بە پشتێن","trench",160000,4],["Tailored Vest","فيست رسمي","فێستی ڕەسمی","vest",55000,8],["Knit Vest","فيست صوف","فێستی خوری","vest",48000,10],["Silk Blouse","بلوزة حرير","بلوزی حەریر","top",38000,15],["Wide-Leg Trousers","بنطلون واسع","پانتۆڵی فراوان","pants",45000,12]];
  seed.forEach((r, i) => run('INSERT INTO products VALUES(?,?,?,?,?,?,?,?)', 'p' + i, JSON.stringify({ en: r[0], ar: r[1], ku: r[2] }), r[3], r[4], r[5], 'S,M,L,XL', '', now()));
}
// ---------- أدوات ----------
const E = (code, status = 400) => Object.assign(new Error(code), { code, status });
const sign = s => crypto.createHmac('sha256', SECRET).update(s).digest('hex');
const token = uid => { const b = uid + '.' + (Date.now() + 30 * 864e5); return b + '.' + sign(b); };
function who(req) {
  const m = /(?:^|; )vs=([^;]+)/.exec(req.headers.cookie || ''); if (!m) return null;
  const [u, e, s] = m[1].split('.'); if (!s || sign(u + '.' + e) !== s || +e < Date.now()) return null;
  return q1('SELECT * FROM users WHERE id=?', +u) || null;
}
const needUser = req => who(req) || (() => { throw E('auth', 401); })();
const needAdmin = req => { const u = needUser(req); if (!u.admin) throw E('forbid', 403); return u; };
const me = u => u && ({ name: u.name, email: u.email, phone: u.phone, admin: !!u.admin });
const prod = r => ({ id: r.id, n: JSON.parse(r.n), c: r.c, p: r.p, s: r.s, sz: r.sz, img: r.img });
const products = () => qa('SELECT * FROM products ORDER BY created DESC, rowid DESC').map(prod);
const settings = () => ({ wa: sget('wa'), dB: +sget('dB'), dO: +sget('dO') });
const ord = r => ({ id: r.id, d: r.created, name: r.name, phone: r.phone, city: r.city, addr: r.addr, items: JSON.parse(r.items), total: r.total, del: r.del, st: r.st, u: r.email || '' });
const str = (x, m) => String(x ?? '').trim().slice(0, m);
const PHONE = /^07\d{9}$/;
function cleanP(b) {
  const n = { ar: str(b.n && b.n.ar, 120), en: str(b.n && b.n.en, 120), ku: str(b.n && b.n.ku, 120) };
  if (!n.ar && !n.en && !n.ku || !CATS.includes(b.c)) throw E('fill');
  const img = typeof b.img === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(b.img.slice(0, 30)) && b.img.length < 1.5e6 ? b.img : '';
  return { n: JSON.stringify(n), c: b.c, p: Math.max(0, Math.floor(+b.p || 0)), s: Math.max(0, Math.floor(+b.s || 0)), sz: str(b.sz, 60) || 'S,M,L', img };
}
const tries = new Map();
function limit(req) { const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress, t = tries.get(ip) || { n: 0, at: Date.now() };
  if (Date.now() - t.at > 9e5) { t.n = 0; t.at = Date.now(); } if (++t.n > 20) throw E('rate', 429); tries.set(ip, t); }
function body(req) { return new Promise((res, rej) => { let d = '', n = 0; req.on('data', c => { n += c.length; if (n > 8e6) { rej(E('big', 413)); req.destroy(); } else d += c; });
  req.on('end', () => { try { res(d ? JSON.parse(d) : {}); } catch { rej(E('json')); } }); }); }
function send(res, code, obj, h = {}) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...h }); res.end(JSON.stringify(obj)); }
const cookie = (req, v, age) => `vs=${v}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`;
// ---------- المسارات ----------
async function api(req, res, p) {
  const m = req.method;
  if (m === 'GET' && p === '/api/init') return send(res, 200, { products: products(), settings: settings(), me: me(who(req)) });
  if (m === 'POST' && p === '/api/register') {
    limit(req); const b = await body(req), name = str(b.name, 80), email = str(b.email, 120).toLowerCase(), phone = str(b.phone, 11), pw = String(b.password || '');
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || !pw) throw E('fill'); if (!PHONE.test(phone)) throw E('phone07'); if (pw.length < 6) throw E('pwshort');
    if (q1('SELECT 1 FROM users WHERE email=?', email)) throw E('exists');
    const r = run('INSERT INTO users(name,phone,email,pw,created) VALUES(?,?,?,?,?)', name, phone, email, hash(pw), now());
    return send(res, 200, { me: { name, email, phone, admin: false } }, { 'Set-Cookie': cookie(req, token(r.lastInsertRowid), 2592000) });
  }
  if (m === 'POST' && p === '/api/login') {
    limit(req); const b = await body(req), u = q1('SELECT * FROM users WHERE email=?', str(b.email, 120).toLowerCase());
    if (!u || !verify(String(b.password || ''), u.pw)) throw E('wrong', 401);
    return send(res, 200, { me: me(u) }, { 'Set-Cookie': cookie(req, token(u.id), 2592000) });
  }
  if (m === 'POST' && p === '/api/logout') return send(res, 200, { ok: 1 }, { 'Set-Cookie': cookie(req, '', 0) });
  if (m === 'GET' && p === '/api/my-orders') { const u = needUser(req); return send(res, 200, { orders: qa('SELECT o.*,? AS email FROM orders o WHERE uid=? ORDER BY created DESC', u.email, u.id).map(ord) }); }
  if (m === 'POST' && p === '/api/orders') {
    const u = needUser(req), b = await body(req), name = str(b.name, 80), phone = str(b.phone, 11), city = str(b.city, 120), addr = str(b.addr, 300), gov = Math.floor(+b.gov);
    if (!name || !city || !addr || !(gov >= 0 && gov <= 18) || !Array.isArray(b.items) || !b.items.length || b.items.length > 50) throw E('fill');
    if (!PHONE.test(phone)) throw E('phone07');
    const id = 'V' + String(Date.now() % 1e6).padStart(6, '0') + Math.floor(Math.random() * 90 + 10), items = []; let sub = 0;
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const it of b.items) {
        const pr = q1('SELECT * FROM products WHERE id=?', String(it.id)), q = Math.floor(+it.q);
        if (!pr || !(q >= 1 && q <= 20)) throw E('fill'); if (pr.s < q) throw E('stock');
        run('UPDATE products SET s=s-? WHERE id=?', q, pr.id); const n = JSON.parse(pr.n); sub += pr.p * q;
        items.push({ n: n.en || n.ar, z: str(it.z, 10), q, p: pr.p });
      }
      const del = gov === 0 ? +sget('dB') : +sget('dO');
      run('INSERT INTO orders VALUES(?,?,?,?,?,?,?,?,?,?,?)', id, u.id, name, phone, city, addr, JSON.stringify(items), sub + del, del, 'new', now());
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return send(res, 200, { order: ord({ ...q1('SELECT * FROM orders WHERE id=?', id), email: u.email }), products: products() });
  }
  if (m === 'GET' && p === '/api/orders') { needAdmin(req); return send(res, 200, { orders: qa('SELECT o.*,u.email FROM orders o LEFT JOIN users u ON u.id=o.uid ORDER BY o.created DESC').map(ord) }); }
  let r;
  if (m === 'PATCH' && (r = /^\/api\/orders\/(\w+)$/.exec(p))) {
    needAdmin(req); const b = await body(req); if (!['new', 'processing', 'shipped', 'done', 'cancelled'].includes(b.st)) throw E('fill');
    run('UPDATE orders SET st=? WHERE id=?', b.st, r[1]); return send(res, 200, { ok: 1 });
  }
  if (m === 'POST' && p === '/api/products') {
    needAdmin(req); const c = cleanP(await body(req)); run('INSERT INTO products VALUES(?,?,?,?,?,?,?,?)', 'p' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex'), c.n, c.c, c.p, c.s, c.sz, c.img, now());
    return send(res, 200, { products: products() });
  }
  if ((m === 'PUT' || m === 'DELETE') && (r = /^\/api\/products\/([\w-]+)$/.exec(p))) {
    needAdmin(req);
    if (m === 'DELETE') run('DELETE FROM products WHERE id=?', r[1]);
    else { const c = cleanP(await body(req)); run('UPDATE products SET n=?,c=?,p=?,s=?,sz=?,img=? WHERE id=?', c.n, c.c, c.p, c.s, c.sz, c.img, r[1]); }
    return send(res, 200, { products: products() });
  }
  if (m === 'PUT' && p === '/api/settings') {
    const u = needAdmin(req), b = await body(req);
    sset('dB', Math.max(0, Math.floor(+b.dB || 0))); sset('dO', Math.max(0, Math.floor(+b.dO || 0))); sset('wa', str(b.wa, 20).replace(/\D/g, ''));
    if (b.pw) { if (String(b.pw).length < 6) throw E('pwshort'); run('UPDATE users SET pw=? WHERE id=?', hash(String(b.pw)), u.id); }
    return send(res, 200, { settings: settings() });
  }
  throw E('notfound', 404);
}
const PAGE = () => fs.readFileSync(path.join(__dirname, 'public', 'index.html'));
http.createServer(async (req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  try {
    if (p.startsWith('/api/')) return await api(req, res, p);
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff' }); return res.end(PAGE()); }
    send(res, 404, { error: 'notfound' });
  } catch (e) { if (!e.status) console.error(e); send(res, e.status || 500, { error: e.status ? e.code : 'server' }); }
}).listen(PORT, () => console.log('VIVI FASHION running on http://localhost:' + PORT));
