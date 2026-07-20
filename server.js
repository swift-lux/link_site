const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

var PORT = Number(process.env.PORT || 3000);
var ROOT = __dirname;
var DATA_DIR = path.join(ROOT, 'data');
var DB_FILE = path.join(DATA_DIR, 'db.json');
var HTML_FILE = path.join(ROOT, 'index.html');
var FAVICON_FILE = path.join(ROOT, 'favicon.svg');

function ensureDataDirectory() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function constantTimeCompare(a, b) {
  var bufA = Buffer.from(String(a), 'utf8');
  var bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function now() {
  return Date.now();
}

function normalizeRoute(prefix, slug) {
  var routePrefix = String(prefix || '').trim().replace(/^\/+|\/+$/g, '');
  var routeSlug = String(slug || '').trim().replace(/^\/+|\/+$/g, '');
  if (!routeSlug) return '/';
  return '/' + (routePrefix ? routePrefix + '/' : '') + routeSlug;
}

function buildShortUrl(host, prefix, slug, protocol) {
  return protocol + '://' + host + normalizeRoute(prefix, slug);
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    var raw = fs.readFileSync(filePath, 'utf8');
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function loadDatabase() {
  ensureDataDirectory();
  if (fs.existsSync(DB_FILE)) {
    return readJson(DB_FILE, null) || { users: [], sessions: [], links: [] };
  }

  var links = readJson(path.join(DATA_DIR, 'links.json'), null);
  var sessions = readJson(path.join(DATA_DIR, 'sessions.json'), null);
  var users = readJson(path.join(DATA_DIR, 'users.json'), null);

  var db = {
    users: Array.isArray(users) ? users.map(function(user) {
      return {
        id: user.id || 1,
        username: user.username,
        name: user.name,
        passwordHash: user.password ? sha256(user.password) : user.passwordHash || ''
      };
    }) : [{ id: 1, username: 'admin', name: 'Admin', passwordHash: sha256('change_me_now') }],
    sessions: Array.isArray(sessions) ? sessions : [],
    links: Array.isArray(links) ? links : []
  };

  writeJson(DB_FILE, db);
  return db;
}

function saveDatabase(db) {
  writeJson(DB_FILE, db);
}

var db = loadDatabase();

var authAttempts = {};

function checkRateLimit(ip) {
  var key = String(ip || 'unknown');
  var attempts = authAttempts[key] || { count: 0, firstAt: now() };
  var windowMs = 15 * 60 * 1000;
  if (now() - attempts.firstAt > windowMs) {
    authAttempts[key] = { count: 1, firstAt: now() };
    return true;
  }
  attempts.count++;
  authAttempts[key] = attempts;
  if (attempts.count > 15) return false;
  return true;
}

function cleanupRateLimits() {
  var cutoff = now() - 15 * 60 * 1000;
  var keys = Object.keys(authAttempts);
  for (var i = 0; i < keys.length; i++) {
    if (authAttempts[keys[i]].firstAt < cutoff) delete authAttempts[keys[i]];
  }
}

function findUser(username) {
  for (var i = 0; i < db.users.length; i++) {
    if (db.users[i].username === username) return db.users[i];
  }
  return null;
}

function authenticate(username, password) {
  var user = findUser(username);
  if (!user || !user.passwordHash) return null;
  if (!constantTimeCompare(sha256(password), user.passwordHash)) return null;
  return user;
}

function findSession(token) {
  if (!token || token.length < 10) return null;
  for (var i = 0; i < db.sessions.length; i++) {
    if (db.sessions[i].token === token && db.sessions[i].expiresAt >= now()) {
      return db.sessions[i];
    }
  }
  return null;
}

function cleanupSessions() {
  var before = db.sessions.length;
  db.sessions = db.sessions.filter(function(s) { return s.expiresAt >= now(); });
  if (db.sessions.length !== before) saveDatabase(db);
}

function getUserLinks(username) {
  return db.links.filter(function(l) { return l.owner === username; }).sort(function(a, b) { return b.createdAt - a.createdAt; });
}

function nextId() {
  return now() + Math.floor(Math.random() * 100000);
}

function decorateLink(link, host, protocol) {
  if (!link) return null;
  var copy = {};
  for (var k in link) { copy[k] = link[k]; }
  copy.short = buildShortUrl(host, link.prefix, link.slug, protocol);
  return copy;
}

function isApiEndpoint(pathname) {
  if (pathname === '/api/auth') return true;
  if (pathname === '/api/me') return true;
  if (pathname === '/api/links') return true;
  if (/^\/api\/links\/\d+$/.test(pathname)) return true;
  return false;
}

function isReservedRoute(route) {
  var reserved = ['/', '/api', '/api/auth', '/api/me', '/api/links', '/404', '/favicon.svg', '/index.html'];
  for (var i = 0; i < reserved.length; i++) {
    if (route === reserved[i] || route.startsWith(reserved[i] + '/')) return true;
  }
  return false;
}

function sendJson(res, status, payload) {
  var body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function sendHtml(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(html);
}

function sendFile(res, status, filePath, contentType) {
  try {
    var content = fs.readFileSync(filePath);
    res.writeHead(status, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
    res.end(content);
  } catch (error) {
    send404(res);
  }
}

function send404(res) {
  sendHtml(res, 404, '<!doctype html><html><head><meta charset="utf-8"><title>404</title></head><body style="background:#05070a;color:#f3f5fa;font-family:sans-serif;display:grid;place-items:center;min-height:100vh;margin:0"><div style="text-align:center"><h1>404</h1><p>Not found</p><a href="/" style="color:#00e5ff">Home</a></div></body></html>');
}

function parseBody(req, callback) {
  var body = '';
  var called = false;

  function done() {
    if (called) return;
    called = true;

    if (!body || body.length === 0) {
      return callback(null, {});
    }

    var trimmed = body;
    try {
      trimmed = trimmed.replace(/^\uFEFF/, '');
    } catch (e) {}

    try {
      callback(null, JSON.parse(trimmed));
      return;
    } catch (e) {}

    try {
      var params = {};
      var pairs = trimmed.split('&');
      for (var i = 0; i < pairs.length; i++) {
        if (!pairs[i]) continue;
        var eqIdx = pairs[i].indexOf('=');
        if (eqIdx > 0) {
          var key = decodeURIComponent(pairs[i].substring(0, eqIdx));
          var val = decodeURIComponent(pairs[i].substring(eqIdx + 1));
          params[key] = val;
        }
      }
      if (Object.keys(params).length > 0) {
        callback(null, params);
        return;
      }
    } catch (e2) {}

    callback(null, { _raw: trimmed });
  }

  req.on('data', function(chunk) {
    body += String(chunk);
    if (body.length > 2 * 1024 * 1024) {
      req.destroy();
      done();
    }
  });

  req.on('end', function() {
    done();
  });

  req.on('error', function() {
    done();
  });
}

var server = http.createServer(function(req, res) {
  cleanupSessions();
  cleanupRateLimits();

  var requestUrl;
  try {
    requestUrl = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  } catch (e) {
    requestUrl = { pathname: '/', search: '' };
  }
  var pathname = '';
  try {
    pathname = decodeURIComponent(requestUrl.pathname || '/');
  } catch (e) {
    pathname = requestUrl.pathname || '/';
  }
  var method = req.method || 'GET';
  var proto = 'http';
  if (req.headers['x-forwarded-proto']) {
    proto = String(req.headers['x-forwarded-proto']).split(',')[0].trim() || 'http';
  }
  var hostHeader = req.headers.host || ('localhost:' + PORT);

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Max-Age': '86400'
    });
    return res.end();
  }

  if (pathname === '/api/auth' && method === 'POST') {
    var clientIp = 'unknown';
    try {
      clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
    } catch (e) {}

    if (!checkRateLimit(clientIp)) {
      return sendJson(res, 429, { error: 'Too many attempts' });
    }

    return parseBody(req, function(err, payload) {
      if (err) payload = {};
      if (!payload) payload = {};

      var username = String(payload.username || payload.user || '').trim();
      var password = String(payload.password || payload.pass || '');

      if (!username && req.headers['x-auth-data']) {
        try {
          var decoded = JSON.parse(decodeURIComponent(escape(Buffer.from(String(req.headers['x-auth-data']), 'base64').toString('binary'))));
          username = String(decoded.username || '').trim();
          password = String(decoded.password || '');
        } catch (e) {}
      }

      if (!username || !password) {
        return sendJson(res, 401, { error: 'Unauthorized' });
      }

      var user = authenticate(username, password);
      if (!user) {
        return sendJson(res, 401, { error: 'Unauthorized' });
      }

      var token = crypto.randomBytes(24).toString('hex');
      db.sessions.push({ token: token, user: user.username, expiresAt: now() + 1000 * 60 * 60 * 24 * 7 });
      saveDatabase(db);

      return sendJson(res, 200, { token: token, user: { username: user.username, name: user.name } });
    });
  }

  if (pathname.startsWith('/api/') && !isApiEndpoint(pathname)) {
    var redir = null;
    for (var i = 0; i < db.links.length; i++) {
      if (db.links[i].route === pathname) { redir = db.links[i]; break; }
    }
    if (redir) {
      redir.clicks = (redir.clicks || 0) + 1;
      redir.lastUsed = new Date().toISOString();
      saveDatabase(db);
      res.writeHead(302, { Location: redir.target });
      return res.end();
    }
  }

  if (pathname.startsWith('/api/')) {
    var authHeader = String(req.headers.authorization || '').trim();
    var session = findSession(authHeader);
    if (!session) {
      return sendJson(res, 401, { error: 'Unauthorized' });
    }

    if (pathname === '/api/me' && method === 'GET') {
      var u = findUser(session.user);
      var links = getUserLinks(session.user).map(function(l) { return decorateLink(l, hostHeader, proto); });
      return sendJson(res, 200, { user: { username: session.user, name: u ? u.name : session.user }, links: links });
    }

    if (pathname === '/api/links' && method === 'GET') {
      var userLinks = getUserLinks(session.user).map(function(l) { return decorateLink(l, hostHeader, proto); });
      return sendJson(res, 200, { links: userLinks });
    }

    if (pathname === '/api/links' && method === 'POST') {
      return parseBody(req, function(err, payload) {
        if (err) return sendJson(res, 400, { error: 'Bad request' });
        if (!payload) payload = {};

        var rawTarget = String(payload.target || '').trim();
        if (!rawTarget) return sendJson(res, 400, { error: 'Target URL required' });

        var route = normalizeRoute(payload.prefix, payload.slug);
        if (isReservedRoute(route)) return sendJson(res, 400, { error: 'Reserved route' });

        for (var i = 0; i < db.links.length; i++) {
          if (db.links[i].route === route) return sendJson(res, 409, { error: 'Route in use' });
        }

        var entry = {
          id: nextId(),
          owner: session.user,
          target: rawTarget,
          prefix: String(payload.prefix || '').trim(),
          slug: String(payload.slug || '').trim(),
          route: route,
          short: buildShortUrl(hostHeader, payload.prefix, payload.slug, proto),
          label: String(payload.label || '').trim(),
          hash: crypto.randomBytes(4).toString('hex'),
          time: new Date().toISOString(),
          clicks: 0,
          lastUsed: null,
          createdAt: now()
        };

        db.links.push(entry);
        saveDatabase(db);
        return sendJson(res, 200, { link: entry });
      });
    }

    var updateMatch = pathname.match(/^\/api\/links\/(\d+)$/);
    if (updateMatch && method === 'PUT') {
      return parseBody(req, function(err, payload) {
        if (err) return sendJson(res, 400, { error: 'Bad request' });
        if (!payload) payload = {};

        var linkId = Number(updateMatch[1]);
        var link = null;
        for (var i = 0; i < db.links.length; i++) {
          if (db.links[i].id === linkId && db.links[i].owner === session.user) {
            link = db.links[i];
            break;
          }
        }
        if (!link) return sendJson(res, 404, { error: 'Not found' });

        var route = normalizeRoute(payload.prefix, payload.slug);
        for (var i = 0; i < db.links.length; i++) {
          if (db.links[i].id !== linkId && db.links[i].route === route) {
            return sendJson(res, 409, { error: 'Route in use' });
          }
        }

        link.target = String(payload.target || link.target).trim();
        link.prefix = String(payload.prefix || '').trim();
        link.slug = String(payload.slug || '').trim();
        link.route = route;
        link.short = buildShortUrl(hostHeader, payload.prefix, payload.slug, proto);
        link.label = String(payload.label || '').trim();
        link.updatedAt = now();
        saveDatabase(db);
        return sendJson(res, 200, { link: link });
      });
    }

    var deleteMatch = pathname.match(/^\/api\/links\/(\d+)$/);
    if (deleteMatch && method === 'DELETE') {
      var delId = Number(deleteMatch[1]);
      db.links = db.links.filter(function(item) { return !(item.id === delId && item.owner === session.user); });
      saveDatabase(db);
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 404, { error: 'Not found' });
  }

  if (pathname === '/favicon.svg') {
    return sendFile(res, 200, FAVICON_FILE, 'image/svg+xml');
  }

  if (pathname === '/' || pathname === '/index.html') {
    return sendFile(res, 200, HTML_FILE, 'text/html; charset=utf-8');
  }

  var redirLink = null;
  for (var i = 0; i < db.links.length; i++) {
    if (db.links[i].route === pathname) { redirLink = db.links[i]; break; }
  }
  if (redirLink) {
    redirLink.clicks = (redirLink.clicks || 0) + 1;
    redirLink.lastUsed = new Date().toISOString();
    saveDatabase(db);
    res.writeHead(302, { Location: redirLink.target });
    return res.end();
  }

  return send404(res);
});

server.listen(PORT, function() {
  console.log('Server on port ' + PORT);
});
