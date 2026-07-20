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
    var first = { users: [{ id: 1, username: 'svcode_npms', name: 'SVCODE Admin', passwordHash: hash('vectorpro9') }], sessions: [], links: [] };
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

var RESERVED = ['/', '/api', '/api/auth', '/api/me', '/api/links', '/favicon.svg', '/index.html'];

function isReserved(r) {
  for (var i = 0; i < RESERVED.length; i++) {
    if (r === RESERVED[i] || r.indexOf(RESERVED[i] + '/') === 0) return true;
  }
  return false;
}

function isAPI(p) {
  return p === '/api/auth' || p === '/api/me' || p === '/api/links' || /^\/api\/links\/\d+$/.test(p);
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
      return json(res, 200, { token: tok, user: { username: user.username, name: user.name } });
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
      var links = userLinks(owner);
      for (var i = 0; i < links.length; i++) links[i] = Object.assign({}, links[i], { short: mkShort(host, links[i].prefix, links[i].slug, proto) });
      return json(res, 200, { user: { username: owner, name: u ? u.name : owner }, links: links });
    }

    // GET /api/links
    if (pn === '/api/links' && method === 'GET') {
      var links = userLinks(owner);
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
          time: new Date().toISOString(), clicks: 0, lastUsed: null, created: Date.now()
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

  json(res, 404, { error: 'Not found' });
});

server.listen(PORT, function() {
  console.log('Server: http://127.0.0.1:' + PORT);
});
