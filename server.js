var http = require('http');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var PORT = process.env.PORT || 3000;
var ROOT = __dirname;
var DATA = path.join(ROOT, 'data');
var DB = path.join(DATA, 'db.json');
var HTML = path.join(ROOT, 'index.html');
var ICO = path.join(ROOT, 'favicon.svg');

function init() {
  if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });
  if (!fs.existsSync(DB)) {
    var first = { users: [{ id: 1, username: 'svcode_npms', name: 'SVCODE Admin', passwordHash: hash('vectorpro9'), role: 'admin' }], sessions: [], links: [] };
    fs.writeFileSync(DB, JSON.stringify(first, null, 2));
  }
}

function hash(v) { return crypto.createHash('sha256').update(String(v)).digest('hex'); }

function readDB() {
  try { return JSON.parse(fs.readFileSync(DB, 'utf8')); }
  catch(e) { return { users: [], sessions: [], links: [] }; }
}

function writeDB(d) { fs.writeFileSync(DB, JSON.stringify(d, null, 2)); }

function safeEqual(a, b) {
  var x = Buffer.from(String(a));
  var y = Buffer.from(String(b));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

function json(res, code, obj) {
  var s = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
  });
  res.end(s);
}

function html(res, code, str) {
  res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(str);
}

function file(res, fp, ct) {
  try {
    var d = fs.readFileSync(fp);
    res.writeHead(200, { 'Content-Type': ct, 'Access-Control-Allow-Origin': '*' });
    res.end(d);
  } catch(e) {
    json(res, 404, { error: 'Not found' });
  }
}

function readBody(req, cb) {
  var chunks = [];
  req.on('data', function(c) { chunks.push(c); });
  req.on('end', function() {
    var raw = Buffer.concat(chunks).toString('utf8');
    if (!raw) return cb({});
    try { return cb(JSON.parse(raw)); } catch(e) {}
    try {
      var p = {};
      raw.split('&').forEach(function(pair) {
        var eq = pair.indexOf('=');
        if (eq > 0) p[decodeURIComponent(pair.substring(0, eq))] = decodeURIComponent(pair.substring(eq + 1));
      });
      if (Object.keys(p).length > 0) return cb(p);
    } catch(e2) {}
    cb({ _raw: raw });
  });
  req.on('error', function() { cb({}); });
}

function mkRoute(prefix, slug) {
  var p = String(prefix || '').trim().replace(/^\/+|\/+$/g, '');
  var s = String(slug || '').trim().replace(/^\/+|\/+$/g, '');
  if (!s) return '/';
  return p ? '/' + p + '/' + s : '/' + s;
}

function mkShort(host, prefix, slug, proto) {
  return (proto || 'http') + '://' + host + mkRoute(prefix, slug);
}

function uid() { return Date.now() + '' + Math.floor(Math.random() * 100000); }

init();
var db = readDB();

// Cleanup old sessions
function cleanSessions() {
  var now = Date.now();
  var before = db.sessions.length;
  db.sessions = db.sessions.filter(function(s) { return s.exp > now; });
  if (db.sessions.length !== before) writeDB(db);
}
cleanSessions();

// Rate limit
var attempts = {};
function rateLimit(ip) {
  var k = String(ip);
  var now = Date.now();
  var a = attempts[k];
  if (!a || now - a.t > 900000) { attempts[k] = { n: 1, t: now }; return true; }
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
  var h = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>404 | SVCODE URL Vault</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#030305;color:#e6e6f0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden}.c{text-align:center;padding:32px}.code{font-size:6rem;font-weight:900;font-family:monospace;background:linear-gradient(135deg,#00e5ff,#b967ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;line-height:1;margin-bottom:12px}.sub{font-size:1rem;color:#7a7a9a;letter-spacing:4px;margin-bottom:8px;font-family:monospace}.msg{color:#4a4a6a;font-size:0.82rem;margin-bottom:24px}.btn{display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#00e5ff,#b967ff);color:#030305;text-decoration:none;border-radius:10px;font-weight:700;font-size:0.78rem;letter-spacing:2px;font-family:monospace;transition:transform 0.2s,box-shadow 0.2s}.btn:hover{transform:translateY(-2px);box-shadow:0 8px 30px rgba(0,229,255,0.3)}.ring{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:300px;height:300px;border:1px solid rgba(0,229,255,0.06);border-radius:50%;animation:pulse 3s ease-in-out infinite}.ring:nth-child(2){width:220px;height:220px;border-color:rgba(185,103,255,0.06);animation-delay:0.5s}@keyframes pulse{0%,100%{opacity:0.3;transform:translate(-50%,-50%) scale(1)}50%{opacity:0.8;transform:translate(-50%,-50%) scale(1.05)}}</style></head><body><div class="ring"></div><div class="ring"></div><div class="c"><div class="code">404</div><div class="sub">LINK NOT FOUND</div>' + p + '<div class="msg">This short link does not exist or has been removed.</div><a href="/" class="btn">RETURN HOME</a></div></body></html>';
  html(res, 404, h);
}

var server = http.createServer(function(req, res) {
  cleanSessions();

  var url;
  try { url = new URL(req.url, 'http://' + (req.headers.host || 'localhost')); }
  catch(e) { url = { pathname: '/' }; }
  var pn = decodeURIComponent(url.pathname || '/');
  var method = req.method || 'GET';
  var proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  var host = req.headers.host || ('localhost:' + PORT);

  // CORS preflight
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
    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || '';
    if (!rateLimit(ip)) return json(res, 429, { error: 'Too many attempts' });

    return readBody(req, function(body) {
      var u = String(body.username || body.user || '').trim();
      var p = String(body.password || body.pass || '');
      if (!u || !p) return json(res, 401, { error: 'Unauthorized' });

      var user = findUser(u);
      if (!user || !user.passwordHash) return json(res, 401, { error: 'Unauthorized' });
      if (!safeEqual(hash(p), user.passwordHash)) return json(res, 401, { error: 'Unauthorized' });

      var tok = crypto.randomBytes(24).toString('hex');
      db.sessions.push({ token: tok, user: user.username, exp: Date.now() + 604800000 });
      writeDB(db);
      return json(res, 200, { token: tok, user: { username: user.username, name: user.name, role: user.role || 'user' } });
    });
  }

  // All API routes need auth
  if (pn.indexOf('/api/') === 0) {
    var tok = String(req.headers.authorization || '').trim();
    var sess = findSession(tok);
    if (!sess) return json(res, 401, { error: 'Unauthorized' });
    var owner = sess.user;

    // Redirect check for /api/ routes that aren't API endpoints
    if (pn.indexOf('/api/') === 0 && !isAPI(pn)) {
      for (var i = 0; i < db.links.length; i++) {
        if (db.links[i].route === pn) {
          db.links[i].clicks = (db.links[i].clicks || 0) + 1;
          db.links[i].lastUsed = new Date().toISOString();
          writeDB(db);
          res.writeHead(302, { Location: db.links[i].target });
          return res.end();
        }
      }
    }

    // GET /api/me
    if (pn === '/api/me' && method === 'GET') {
      var u = findUser(owner);
      var isAdmin = u && u.role === 'admin';
      var links = userLinks(owner);
      if (!isAdmin) links = links.filter(function(l) { return !l.hidden; });
      for (var i = 0; i < links.length; i++) links[i] = Object.assign({}, links[i], { short: mkShort(host, links[i].prefix, links[i].slug, proto) });
      return json(res, 200, { user: { username: owner, name: u ? u.name : owner, role: u ? u.role || 'user' : 'user' }, links: links });
    }

    // GET /api/links
    if (pn === '/api/links' && method === 'GET') {
      var u = findUser(owner);
      var isAdmin = u && u.role === 'admin';
      var links = userLinks(owner);
      if (!isAdmin) links = links.filter(function(l) { return !l.hidden; });
      for (var i = 0; i < links.length; i++) links[i] = Object.assign({}, links[i], { short: mkShort(host, links[i].prefix, links[i].slug, proto) });
      return json(res, 200, { links: links });
    }

    // POST /api/links
    if (pn === '/api/links' && method === 'POST') {
      return readBody(req, function(b) {
        var target = String(b.target || '').trim();
        if (!target) return json(res, 400, { error: 'Target required' });
        var route = mkRoute(b.prefix, b.slug);
        if (isReserved(route)) return json(res, 400, { error: 'Reserved route' });
        for (var i = 0; i < db.links.length; i++) {
          if (db.links[i].route === route) return json(res, 409, { error: 'Route exists' });
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
        writeDB(db);
        return json(res, 200, { link: entry });
      });
    }

    // PUT /api/links/:id
    var putMatch = pn.match(/^\/api\/links\/(\d+)$/);
    if (putMatch && method === 'PUT') {
      return readBody(req, function(b) {
        var id = putMatch[1];
        var link = null;
        for (var i = 0; i < db.links.length; i++) {
          if (db.links[i].id === id && db.links[i].owner === owner) { link = db.links[i]; break; }
        }
        if (!link) return json(res, 404, { error: 'Not found' });
        var route = mkRoute(b.prefix, b.slug);
        for (var i = 0; i < db.links.length; i++) {
          if (db.links[i].id !== id && db.links[i].route === route) return json(res, 409, { error: 'Route exists' });
        }
        link.target = String(b.target || link.target).trim();
        link.prefix = String(b.prefix || '').trim();
        link.slug = String(b.slug || '').trim();
        link.route = route;
        link.short = mkShort(host, b.prefix, b.slug, proto);
        link.label = String(b.label || '').trim();
        link.updated = Date.now();
        writeDB(db);
        return json(res, 200, { link: link });
      });
    }

    // DELETE /api/links/:id
    var delMatch = pn.match(/^\/api\/links\/(\d+)$/);
    if (delMatch && method === 'DELETE') {
      var id = delMatch[1];
      db.links = db.links.filter(function(l) { return !(l.id === id && l.owner === owner); });
      writeDB(db);
      return json(res, 200, { ok: true });
    }

    // POST /api/admin/user
    if (pn === '/api/admin/user' && method === 'POST') {
      var cu = findUser(owner);
      if (!cu || cu.role !== 'admin') return json(res, 403, { error: 'Admin only' });
      return readBody(req, function(b) {
        var newUser = String(b.username || '').trim().toLowerCase();
        var newPass = String(b.password || '');
        var newName = String(b.displayName || b.name || newUser).trim();
        if (!newUser || !newPass) return json(res, 400, { error: 'Username and password required' });
        if (newUser.length < 3 || newUser.length > 24) return json(res, 400, { error: 'Username must be 3-24 chars' });
        if (newPass.length < 4) return json(res, 400, { error: 'Password must be at least 4 chars' });
        if (!/^[a-z0-9_]+$/.test(newUser)) return json(res, 400, { error: 'Username: lowercase letters, digits, underscore only' });
        if (findUser(newUser)) return json(res, 409, { error: 'Username already exists' });
        var nextId = db.users.length + 1;
        for (var i = 0; i < db.users.length; i++) { if (db.users[i].id >= nextId) nextId = db.users[i].id + 1; }
        db.users.push({ id: nextId, username: newUser, name: newName, passwordHash: hash(newPass), role: 'user' });
        writeDB(db);
        return json(res, 200, { ok: true, user: { id: nextId, username: newUser, name: newName } });
      });
    }

    // GET /api/admin/users
    if (pn === '/api/admin/users' && method === 'GET') {
      var cu = findUser(owner);
      if (!cu || cu.role !== 'admin') return json(res, 403, { error: 'Admin only' });
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
          id: db.users[i].id, username: db.users[i].username, name: db.users[i].name,
          role: db.users[i].role || 'user', linkCount: ulinks.length, links: ulinks
        });
      }
      return json(res, 200, { users: users });
    }

    // PUT /api/admin/links/:id/hide
    var hideMatch = pn.match(/^\/api\/admin\/links\/(.+)\/hide$/);
    if (hideMatch && method === 'PUT') {
      var cu = findUser(owner);
      if (!cu || cu.role !== 'admin') return json(res, 403, { error: 'Admin only' });
      var linkId = hideMatch[1];
      var link = null;
      for (var i = 0; i < db.links.length; i++) {
        if (String(db.links[i].id) === linkId) { link = db.links[i]; break; }
      }
      if (!link) return json(res, 404, { error: 'Link not found' });
      link.hidden = !link.hidden;
      writeDB(db);
      return json(res, 200, { ok: true, hidden: link.hidden });
    }

    // DELETE /api/admin/links/:id (admin delete any link)
    var adminDelLink = pn.match(/^\/api\/admin\/links\/([^/]+)$/);
    if (adminDelLink && method === 'DELETE') {
      var cu = findUser(owner);
      if (!cu || cu.role !== 'admin') return json(res, 403, { error: 'Admin only' });
      var linkId = adminDelLink[1];
      var before = db.links.length;
      db.links = db.links.filter(function(l) { return String(l.id) !== linkId; });
      writeDB(db);
      return json(res, 200, { ok: true, deleted: db.links.length < before });
    }

    // DELETE /api/admin/users/:id
    var adminDelUser = pn.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (adminDelUser && method === 'DELETE') {
      var cu = findUser(owner);
      if (!cu || cu.role !== 'admin') return json(res, 403, { error: 'Admin only' });
      var targetUser = adminDelUser[1];
      if (targetUser === owner) return json(res, 400, { error: 'Cannot delete yourself' });
      var target = findUser(targetUser);
      if (!target) return json(res, 404, { error: 'User not found' });
      if (target.role === 'admin') return json(res, 403, { error: 'Cannot delete admin users' });
      db.links = db.links.filter(function(l) { return l.owner !== targetUser; });
      db.users = db.users.filter(function(u) { return u.username !== targetUser; });
      db.sessions = db.sessions.filter(function(s) { return s.user !== targetUser; });
      writeDB(db);
      return json(res, 200, { ok: true });
    }

    return json(res, 404, { error: 'Not found' });
  }

  // Static files
  if (pn === '/favicon.svg') return file(res, ICO, 'image/svg+xml');
  if (pn === '/' || pn === '/index.html') return file(res, HTML, 'text/html; charset=utf-8');

  // Short link redirect
  for (var i = 0; i < db.links.length; i++) {
    if (db.links[i].route === pn) {
      db.links[i].clicks = (db.links[i].clicks || 0) + 1;
      db.links[i].lastUsed = new Date().toISOString();
      writeDB(db);
      res.writeHead(302, { Location: db.links[i].target });
      return res.end();
    }
  }

  return notFound404(res, pn);
});

server.listen(PORT, function() {
  console.log('Server: http://127.0.0.1:' + PORT);
});
