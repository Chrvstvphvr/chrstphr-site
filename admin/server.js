#!/usr/bin/env node
/**
 * CHRSTPHR — local admin server
 * Zero deps. Binds 127.0.0.1 only. Serves the static site + a password-gated
 * editor for the JSON content files in /content/.
 *
 * Usage:
 *   PASSWORD=your-secret node admin/server.js
 *   (or set in admin/.password — first line is the password, no quotes)
 *
 * Open http://localhost:4000  → site
 * Open http://localhost:4000/admin/  → editor
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content');
const ADMIN_DIR = __dirname;
const PUBLIC_DIR = path.join(ADMIN_DIR, 'public');
const PASSWORD_FILE = path.join(ADMIN_DIR, '.password');
const SECRET_FILE = path.join(ADMIN_DIR, '.session-secret');
const PORT = parseInt(process.env.PORT || '4000', 10);

// ----- Password & session secret ----------------------------------
let PASSWORD = process.env.PASSWORD || null;
if (!PASSWORD && fs.existsSync(PASSWORD_FILE)) {
  PASSWORD = fs.readFileSync(PASSWORD_FILE, 'utf8').trim();
}
if (!PASSWORD) {
  PASSWORD = 'chrstphr';
  fs.writeFileSync(PASSWORD_FILE, PASSWORD + '\n', { mode: 0o600 });
  console.log('[admin] No password configured — wrote default to admin/.password.');
  console.log('[admin] Edit that file (or set PASSWORD env var) before going further.');
}

let SECRET;
if (fs.existsSync(SECRET_FILE)) {
  SECRET = fs.readFileSync(SECRET_FILE, 'utf8').trim();
} else {
  SECRET = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, SECRET, { mode: 0o600 });
}

// ----- Cookie session (signed) ------------------------------------
function sign(value) {
  const sig = crypto.createHmac('sha256', SECRET).update(value).digest('hex').slice(0, 32);
  return value + '.' + sig;
}
function verify(signed) {
  if (!signed) return null;
  const i = signed.lastIndexOf('.');
  if (i < 0) return null;
  const value = signed.slice(0, i);
  const sig = signed.slice(i + 1);
  const expected = crypto.createHmac('sha256', SECRET).update(value).digest('hex').slice(0, 32);
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return value;
}
function parseCookies(req) {
  const out = {};
  const h = req.headers.cookie || '';
  h.split(';').forEach(c => {
    const i = c.indexOf('=');
    if (i < 0) return;
    out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}
function isAuthed(req) {
  const cookies = parseCookies(req);
  const sess = verify(cookies.chrstphr_admin);
  if (!sess) return false;
  try {
    const data = JSON.parse(sess);
    return data && data.exp && data.exp > Date.now();
  } catch { return false; }
}

// ----- Helpers ----------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.ico':  'image/x-icon',
  '.txt':  'text/plain; charset=utf-8'
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  res.end(body);
}
function sendJSON(res, status, obj) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
}
function safeJoin(base, target) {
  const p = path.normalize(path.join(base, target));
  if (!p.startsWith(base)) return null;
  return p;
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function serveStatic(res, filePath) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, 'Not found');
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

// ----- Whitelisted content sections -------------------------------
const SECTIONS = {
  projects:     'projects.json',
  'how-i-work': 'how-i-work.json'
};

// ----- Routes -----------------------------------------------------
async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // ---------- AUTH ENDPOINTS ----------
  if (pathname === '/admin/api/login' && req.method === 'POST') {
    const body = await readBody(req);
    let pw = '';
    try { pw = JSON.parse(body.toString()).password || ''; } catch {}
    if (!crypto.timingSafeEqual(Buffer.from(pw.padEnd(64, ' ')), Buffer.from(PASSWORD.padEnd(64, ' ')))) {
      return sendJSON(res, 401, { error: 'wrong password' });
    }
    const session = JSON.stringify({ exp: Date.now() + 8 * 3600 * 1000 });
    const cookie = `chrstphr_admin=${encodeURIComponent(sign(session))}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${8 * 3600}`;
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Set-Cookie': cookie });
    return res.end(JSON.stringify({ ok: true }));
  }

  if (pathname === '/admin/api/logout' && req.method === 'POST') {
    res.writeHead(200, { 'Set-Cookie': 'chrstphr_admin=; Path=/; Max-Age=0' });
    return res.end('ok');
  }

  if (pathname === '/admin/api/me') {
    return sendJSON(res, 200, { authed: isAuthed(req) });
  }

  // ---------- CONTENT API (auth required) ----------
  if (pathname.startsWith('/admin/api/content/')) {
    if (!isAuthed(req)) return sendJSON(res, 401, { error: 'unauthorized' });
    const slug = pathname.replace('/admin/api/content/', '');
    const file = SECTIONS[slug];
    if (!file) return sendJSON(res, 404, { error: 'unknown section' });
    const filePath = path.join(CONTENT_DIR, file);
    if (req.method === 'GET') {
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        return sendJSON(res, 200, JSON.parse(raw));
      } catch (e) {
        return sendJSON(res, 500, { error: 'read failed: ' + e.message });
      }
    }
    if (req.method === 'PUT') {
      try {
        const body = await readBody(req);
        const data = JSON.parse(body.toString());
        // Pretty-print + ensure trailing newline
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
        return sendJSON(res, 200, { ok: true });
      } catch (e) {
        return sendJSON(res, 400, { error: 'write failed: ' + e.message });
      }
    }
    return sendJSON(res, 405, { error: 'method not allowed' });
  }

  // ---------- ADMIN UI ----------
  if (pathname === '/admin') {
    res.writeHead(301, { Location: '/admin/' });
    return res.end();
  }
  if (pathname === '/admin/') {
    return serveStatic(res, path.join(PUBLIC_DIR, 'index.html'));
  }
  if (pathname.startsWith('/admin/')) {
    const file = safeJoin(PUBLIC_DIR, pathname.replace('/admin/', ''));
    if (!file) return send(res, 403, 'Forbidden');
    return serveStatic(res, file);
  }

  // ---------- STATIC SITE ----------
  let target = pathname === '/' ? 'index.html' : pathname.slice(1);
  const filePath = safeJoin(ROOT, target);
  if (!filePath) return send(res, 403, 'Forbidden');
  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isDirectory()) {
      return serveStatic(res, path.join(filePath, 'index.html'));
    }
    serveStatic(res, filePath);
  });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch(e => {
    console.error(e);
    send(res, 500, 'Server error');
  });
});

// 127.0.0.1 only — never accessible from network
server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  CHRSTPHR // ADMIN');
  console.log('  ─────────────────');
  console.log(`  Site:  http://localhost:${PORT}/`);
  console.log(`  Admin: http://localhost:${PORT}/admin/`);
  console.log(`  Pass:  (in admin/.password — change it!)`);
  console.log('');
});
