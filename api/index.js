var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var ROOT = path.join(__dirname, '..');
var TMP_DB = '/tmp/svcode_db.json';
var HTML_FILE = path.join(ROOT, 'index.html');
var ICO_FILE = path.join(ROOT, 'favicon.svg');

var CREDENTIALS = { username: 'svcode_npms', name: 'SVCODE Admin', password: 'vectorpro9' };

var db = null;

function hash(v) { return crypto.createHash('sha256').update(String(v)).digest('hex'); }

function initDB() {
  try {
    var raw = fs.readFileSync(TMP_DB, 'utf8');
    var parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.users) && parsed.users.length > 0) {
      db = parsed;
      return;
    }
  } catch(e) {}
  db = {
    users: [{ id: 1, username: CREDENTIALS.username, name: CREDENTIALS.name, passwordHash: hash(CREDENTIALS.password), role: 'admin' }],
    sessions: [],
    links: []
  };
  saveDB();
}

function saveDB() {
  try { fs.writeFileSync(TMP_DB, JSON.stringify(db)); } catch(e) {}
}

function safeEqual(a, b) {
  var x = Buffer.from(String(a));
  var y = Buffer.from(String(b));
  if (x.length !== y.length) return false;
  try { return crypto.timingSafeEqual(x, y); } catch(e) { return false; }
}

function jsonRes(res, code, obj) {
  var s = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
  });
  res.end(s);
}

function fileRes(res, fp, ct) {
  try {
    var d = fs.readFileSync(fp);
    res.writeHead(200, { 'Content-Type': ct, 'Access-Control-Allow-Origin': '*' });
    res.end(d);
  } catch(e) {
    jsonRes(res, 404, { error: 'Not found' });
  }
}

function readBody(req) {
  return new Promise(function(resolve) {
    var chunks = [];
    req.on('data', function(c) { chunks.push(c); });
    req.on('end', function() {
      var raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { return resolve(JSON.parse(raw)); } catch(e) {}
      try {
        var p = {};
        raw.split('&').forEach(function(pair) {
          var eq = pair.indexOf('=');
          if (eq > 0) p[decodeURIComponent(pair.substring(0, eq))] = decodeURIComponent(pair.substring(eq + 1));
        });
        if (Object.keys(p).length > 0) return resolve(p);
      } catch(e2) {}
      resolve({ _raw: raw });
    });
    req.on('error', function() { resolve({}); });
  });
}

function mkRoute(prefix, slug) {
  var p = String(prefix || '').trim().replace(/^\/+|\/+$/g, '');
  var s = String(slug || '').trim().replace(/^\/+|\/+$/g, '');
  if (!s) return '/';
  return p ? '/' + p + '/' + s : '/' + s;
}

function mkShort(host, prefix, slug, proto) {
  return (proto || 'https') + '://' + host + mkRoute(prefix, slug);
}

function uid() { return Date.now() + '' + Math.floor(Math.random() * 100000); }

function cleanSessions() {
  if (!db) return;
  var now = Date.now();
  db.sessions = db.sessions.filter(function(s) { return s.exp > now; });
}

var rateAttempts = {};
function rateLimit(ip) {
  var k = String(ip);
  var now = Date.now();
  var a = rateAttempts[k];
  if (!a || now - a.t > 900000) { rateAttempts[k] = { n: 1, t: now }; return true; }
  a.n++;
  if (a.n > 15) return false;
  return true;
}

function findUser(name) {
  for (var i = 0; i < db.users.length; i++) {
    if (db.users[i].username === name) return db.users[i];
  }
  return null;
}

function findSession(tok) {
  if (!tok || tok.length < 10) return null;
  var now = Date.now();
  for (var i = 0; i < db.sessions.length; i++) {
    if (db.sessions[i].token === tok && db.sessions[i].exp > now) return db.sessions[i];
  }
  return null;
}

function userLinks(owner) {
  var result = [];
  for (var i = 0; i < db.links.length; i++) {
    if (db.links[i].owner === owner) result.push(db.links[i]);
  }
  return result.sort(function(a, b) { return (b.created || 0) - (a.created || 0); });
}

var RESERVED = ['/', '/api', '/api/auth', '/api/me', '/api/links', '/api/admin', '/favicon.svg', '/index.html'];

function isReserved(r) {
  for (var i = 0; i < RESERVED.length; i++) {
    if (r === RESERVED[i] || r.indexOf(RESERVED[i] + '/') === 0) return true;
  }
  return false;
}

function isAPI(p) {
  return p === '/api/auth' || p === '/api/me' || p === '/api/links' || p === '/api/admin/user' || /^\/api\/admin\/users$/.test(p) || /^\/api\/admin\/links\/[^/]+\/hide$/.test(p) || /^\/api\/admin\/users\/[^/]+$/.test(p) || /^\/api\/links\/\d+$/.test(p);
}

function notFound404(res, requestedPath) {
  var p = requestedPath ? '<p style="color:#7a7a9a;margin-bottom:8px;font-size:0.92rem;">Route: <code style="color:#00e5ff;background:rgba(0,229,255,0.08);padding:2px 8px;border-radius:6px;font-family:monospace;">' + String(requestedPath).replace(/</g, '&lt;') + '</code></p>' : '';
  var html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>404 | SVCODE URL Vault</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#030305;color:#e6e6f0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden}.c{text-align:center;padding:32px}.code{font-size:6rem;font-weight:900;font-family:monospace;background:linear-gradient(135deg,#00e5ff,#b967ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;line-height:1;margin-bottom:12px}.sub{font-size:1rem;color:#7a7a9a;letter-spacing:4px;margin-bottom:8px;font-family:monospace}.msg{color:#4a4a6a;font-size:0.82rem;margin-bottom:24px}.btn{display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#00e5ff,#b967ff);color:#030305;text-decoration:none;border-radius:10px;font-weight:700;font-size:0.78rem;letter-spacing:2px;font-family:monospace;transition:transform 0.2s,box-shadow 0.2s}.btn:hover{transform:translateY(-2px);box-shadow:0 8px 30px rgba(0,229,255,0.3)}.ring{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:300px;height:300px;border:1px solid rgba(0,229,255,0.06);border-radius:50%;animation:pulse 3s ease-in-out infinite}.ring:nth-child(2){width:220px;height:220px;border-color:rgba(185,103,255,0.06);animation-delay:0.5s}@keyframes pulse{0%,100%{opacity:0.3;transform:translate(-50%,-50%) scale(1)}50%{opacity:0.8;transform:translate(-50%,-50%) scale(1.05)}}</style></head><body><div class="ring"></div><div class="ring"></div><div class="c"><div class="code">404</div><div class="sub">LINK NOT FOUND</div>' + p + '<div class="msg">This short link does not exist or has been removed.</div><a href="/" class="btn">RETURN HOME</a></div></body></html>';
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(html);
}

module.exports = async function(req, res) {
  if (!db) initDB();
  cleanSessions();

  var url;
  try { url = new URL(req.url, 'http://' + (req.headers.host || 'localhost')); }
  catch(e) { url = { pathname: '/' }; }
  var pn = decodeURIComponent(url.pathname || '/');
  var method = req.method || 'GET';
  var proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  var host = req.headers.host || 'localhost';

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Max-Age': '86400'
    });
    return res.end();
  }

  // === AUTH ===
  if (pn === '/api/auth' && method === 'POST') {
    var ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '';
    if (!rateLimit(ip)) return jsonRes(res, 429, { error: 'Too many attempts' });
    var body = await readBody(req);
    var u = String(body.username || body.user || '').trim();
    var p = String(body.password || body.pass || '');
    if (!u || !p) return jsonRes(res, 401, { error: 'Unauthorized' });
    var user = findUser(u);
    if (!user || !user.passwordHash) return jsonRes(res, 401, { error: 'Unauthorized' });
    if (!safeEqual(hash(p), user.passwordHash)) return jsonRes(res, 401, { error: 'Unauthorized' });
    var tok = crypto.randomBytes(24).toString('hex');
    db.sessions.push({ token: tok, user: user.username, exp: Date.now() + 604800000 });
    saveDB();
    return jsonRes(res, 200, { token: tok, user: { username: user.username, name: user.name, role: user.role || 'user' } });
  }

  // All other /api/ routes need auth
  if (pn.indexOf('/api/') === 0) {
    var tok = String(req.headers.authorization || '').trim();
    var sess = findSession(tok);
    if (!sess) return jsonRes(res, 401, { error: 'Unauthorized' });
    var owner = sess.user;

    if (!isAPI(pn)) {
      for (var i = 0; i < db.links.length; i++) {
        if (db.links[i].route === pn) {
          db.links[i].clicks = (db.links[i].clicks || 0) + 1;
          db.links[i].lastUsed = new Date().toISOString();
          saveDB();
          res.writeHead(302, { Location: db.links[i].target });
          return res.end();
        }
      }
    }

    if (pn === '/api/me' && method === 'GET') {
      var u = findUser(owner);
      var isAdmin = u && u.role === 'admin';
      var links = userLinks(owner);
      if (!isAdmin) links = links.filter(function(l) { return !l.hidden; });
      for (var i = 0; i < links.length; i++) links[i] = Object.assign({}, links[i], { short: mkShort(host, links[i].prefix, links[i].slug, proto) });
      return jsonRes(res, 200, { user: { username: owner, name: u ? u.name : owner, role: u ? u.role || 'user' : 'user' }, links: links });
    }

    if (pn === '/api/links' && method === 'GET') {
      var u = findUser(owner);
      var isAdmin = u && u.role === 'admin';
      var links = userLinks(owner);
      if (!isAdmin) links = links.filter(function(l) { return !l.hidden; });
      for (var i = 0; i < links.length; i++) links[i] = Object.assign({}, links[i], { short: mkShort(host, links[i].prefix, links[i].slug, proto) });
      return jsonRes(res, 200, { links: links });
    }

    if (pn === '/api/links' && method === 'POST') {
      var b = await readBody(req);
      var target = String(b.target || '').trim();
      if (!target) return jsonRes(res, 400, { error: 'Target required' });
      var route = mkRoute(b.prefix, b.slug);
      if (isReserved(route)) return jsonRes(res, 400, { error: 'Reserved route' });
      for (var i = 0; i < db.links.length; i++) {
        if (db.links[i].route === route) return jsonRes(res, 409, { error: 'Route exists' });
      }
      var entry = {
        id: uid(), owner: owner, target: target,
        prefix: String(b.prefix || '').trim(), slug: String(b.slug || '').trim(),
        route: route, short: mkShort(host, b.prefix, b.slug, proto),
        label: String(b.label || '').trim(),
        hash: crypto.randomBytes(4).toString('hex'),
        time: new Date().toISOString(), clicks: 0, lastUsed: null, created: Date.now(), hidden: false
      };
      db.links.push(entry);
      saveDB();
      return jsonRes(res, 200, { link: entry });
    }

    var putMatch = pn.match(/^\/api\/links\/(\d+)$/);
    if (putMatch && method === 'PUT') {
      var b = await readBody(req);
      var id = putMatch[1];
      var link = null;
      for (var i = 0; i < db.links.length; i++) {
        if (db.links[i].id === id && db.links[i].owner === owner) { link = db.links[i]; break; }
      }
      if (!link) return jsonRes(res, 404, { error: 'Not found' });
      var route = mkRoute(b.prefix, b.slug);
      for (var i = 0; i < db.links.length; i++) {
        if (db.links[i].id !== id && db.links[i].route === route) return jsonRes(res, 409, { error: 'Route exists' });
      }
      link.target = String(b.target || link.target).trim();
      link.prefix = String(b.prefix || '').trim();
      link.slug = String(b.slug || '').trim();
      link.route = route;
      link.short = mkShort(host, b.prefix, b.slug, proto);
      link.label = String(b.label || '').trim();
      link.updated = Date.now();
      saveDB();
      return jsonRes(res, 200, { link: link });
    }

    var delMatch = pn.match(/^\/api\/links\/(\d+)$/);
    if (delMatch && method === 'DELETE') {
      var id = delMatch[1];
      db.links = db.links.filter(function(l) { return !(l.id === id && l.owner === owner); });
      saveDB();
      return jsonRes(res, 200, { ok: true });
    }

    // === ADMIN: Add User ===
    if (pn === '/api/admin/user' && method === 'POST') {
      var cu = findUser(owner);
      if (!cu || cu.role !== 'admin') return jsonRes(res, 403, { error: 'Admin only' });
      var b = await readBody(req);
      var newUser = String(b.username || '').trim().toLowerCase();
      var newPass = String(b.password || '');
      var newName = String(b.displayName || b.name || newUser).trim();
      if (!newUser || !newPass) return jsonRes(res, 400, { error: 'Username and password required' });
      if (newUser.length < 3 || newUser.length > 24) return jsonRes(res, 400, { error: 'Username must be 3-24 chars' });
      if (newPass.length < 4) return jsonRes(res, 400, { error: 'Password must be at least 4 chars' });
      if (!/^[a-z0-9_]+$/.test(newUser)) return jsonRes(res, 400, { error: 'Username: lowercase letters, digits, underscore only' });
      if (findUser(newUser)) return jsonRes(res, 409, { error: 'Username already exists' });
      var nextId = db.users.length + 1;
      for (var i = 0; i < db.users.length; i++) { if (db.users[i].id >= nextId) nextId = db.users[i].id + 1; }
      db.users.push({ id: nextId, username: newUser, name: newName, passwordHash: hash(newPass), role: 'user' });
      saveDB();
      return jsonRes(res, 200, { ok: true, user: { id: nextId, username: newUser, name: newName } });
    }

    // === ADMIN: List all users with links ===
    if (pn === '/api/admin/users' && method === 'GET') {
      var cu = findUser(owner);
      if (!cu || cu.role !== 'admin') return jsonRes(res, 403, { error: 'Admin only' });
      var users = [];
      for (var i = 0; i < db.users.length; i++) {
        var ulinks = [];
        for (var j = 0; j < db.links.length; j++) {
          if (db.links[j].owner === db.users[i].username) {
            var lk = Object.assign({}, db.links[j]);
            lk.short = mkShort(host, lk.prefix, lk.slug, proto);
            ulinks.push(lk);
          }
        }
        users.push({
          id: db.users[i].id,
          username: db.users[i].username,
          name: db.users[i].name,
          role: db.users[i].role || 'user',
          linkCount: ulinks.length,
          links: ulinks
        });
      }
      return jsonRes(res, 200, { users: users });
    }

    // === ADMIN: Toggle hide link ===
    var hideMatch = pn.match(/^\/api\/admin\/links\/(.+)\/hide$/);
    if (hideMatch && method === 'PUT') {
      var cu = findUser(owner);
      if (!cu || cu.role !== 'admin') return jsonRes(res, 403, { error: 'Admin only' });
      var linkId = hideMatch[1];
      var link = null;
      for (var i = 0; i < db.links.length; i++) {
        if (String(db.links[i].id) === linkId) { link = db.links[i]; break; }
      }
      if (!link) return jsonRes(res, 404, { error: 'Link not found' });
      link.hidden = !link.hidden;
      saveDB();
      return jsonRes(res, 200, { ok: true, hidden: link.hidden });
    }

    // === ADMIN: Delete any link ===
    var adminDelLink = pn.match(/^\/api\/admin\/links\/(.+)$/);
    if (adminDelLink && method === 'DELETE' && !pn.endsWith('/hide')) {
      var cu = findUser(owner);
      if (!cu || cu.role !== 'admin') return jsonRes(res, 403, { error: 'Admin only' });
      var linkId = adminDelLink[1];
      var before = db.links.length;
      db.links = db.links.filter(function(l) { return String(l.id) !== linkId; });
      saveDB();
      return jsonRes(res, 200, { ok: true, deleted: db.links.length < before });
    }

    // === ADMIN: Delete user and all their links ===
    var adminDelUser = pn.match(/^\/api\/admin\/users\/(.+)$/);
    if (adminDelUser && method === 'DELETE') {
      var cu = findUser(owner);
      if (!cu || cu.role !== 'admin') return jsonRes(res, 403, { error: 'Admin only' });
      var targetUser = adminDelUser[1];
      if (targetUser === owner) return jsonRes(res, 400, { error: 'Cannot delete yourself' });
      var target = findUser(targetUser);
      if (!target) return jsonRes(res, 404, { error: 'User not found' });
      if (target.role === 'admin') return jsonRes(res, 403, { error: 'Cannot delete admin users' });
      db.links = db.links.filter(function(l) { return l.owner !== targetUser; });
      db.users = db.users.filter(function(u) { return u.username !== targetUser; });
      db.sessions = db.sessions.filter(function(s) { return s.user !== targetUser; });
      saveDB();
      return jsonRes(res, 200, { ok: true });
    }

    return jsonRes(res, 404, { error: 'Not found' });
  }

  // Static files
  if (pn === '/favicon.svg') return fileRes(res, ICO_FILE, 'image/svg+xml');
  if (pn === '/' || pn === '/index.html') return fileRes(res, HTML_FILE, 'text/html; charset=utf-8');

  // Short link redirect (no auth needed)
  for (var i = 0; i < db.links.length; i++) {
    if (db.links[i].route === pn) {
      db.links[i].clicks = (db.links[i].clicks || 0) + 1;
      db.links[i].lastUsed = new Date().toISOString();
      saveDB();
      res.writeHead(302, { Location: db.links[i].target });
      return res.end();
    }
  }

  // 404 - not a short link
  return notFound404(res, pn);
};
