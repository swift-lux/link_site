const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const HTML_FILE = path.join(ROOT, 'index.html');
const FAVICON_FILE = path.join(ROOT, 'favicon.svg');

function ensureDataDirectory() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function constantTimeCompare(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function now() {
  return Date.now();
}

function normalizeRoute(prefix, slug) {
  const routePrefix = String(prefix || '').trim().replace(/^\/+|\/+$/g, '');
  const routeSlug = String(slug || '').trim().replace(/^\/+|\/+$/g, '');
  if (!routeSlug) return '/';
  return '/' + (routePrefix ? routePrefix + '/' : '') + routeSlug;
}

function buildShortUrl(host, prefix, slug, protocol) {
  return `${protocol}://${host}${normalizeRoute(prefix, slug)}`;
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
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

  const links = readJson(path.join(DATA_DIR, 'links.json'), null);
  const sessions = readJson(path.join(DATA_DIR, 'sessions.json'), null);
  const users = readJson(path.join(DATA_DIR, 'users.json'), null);

  const db = {
    users: Array.isArray(users) ? users.map((user) => ({
      id: user.id || 1,
      username: user.username,
      name: user.name,
      passwordHash: user.password ? sha256(user.password) : user.passwordHash || ''
    })) : [{ id: 1, username: 'admin', name: 'Admin', passwordHash: sha256('change_me_now') }],
    sessions: Array.isArray(sessions) ? sessions : [],
    links: Array.isArray(links) ? links : []
  };

  writeJson(DB_FILE, db);
  return db;
}

function saveDatabase(db) {
  writeJson(DB_FILE, db);
}

const db = loadDatabase();

const authAttempts = {};

function checkRateLimit(ip) {
  const attempts = authAttempts[ip] || { count: 0, firstAt: now() };
  const windowMs = 15 * 60 * 1000;
  if (now() - attempts.firstAt > windowMs) {
    authAttempts[ip] = { count: 1, firstAt: now() };
    return true;
  }
  attempts.count++;
  authAttempts[ip] = attempts;
  if (attempts.count > 10) return false;
  return true;
}

function cleanupRateLimits() {
  const cutoff = now() - 15 * 60 * 1000;
  for (const ip in authAttempts) {
    if (authAttempts[ip].firstAt < cutoff) delete authAttempts[ip];
  }
}

function findUser(username) {
  return db.users.find((user) => user.username === username) || null;
}

function authenticate(username, password) {
  const user = findUser(username);
  if (!user || !user.passwordHash) return null;
  if (!constantTimeCompare(sha256(password), user.passwordHash)) return null;
  return user;
}

function findSession(token) {
  if (!token || token.length < 10) return null;
  const session = db.sessions.find((item) => item.token === token);
  if (!session || session.expiresAt < now()) return null;
  return session;
}

function cleanupSessions() {
  const before = db.sessions.length;
  db.sessions = db.sessions.filter((item) => item.expiresAt >= now());
  if (db.sessions.length !== before) saveDatabase(db);
}

function getUserLinks(username) {
  return db.links.filter((link) => link.owner === username).sort((a, b) => b.createdAt - a.createdAt);
}

function nextId() {
  return now() + Math.floor(Math.random() * 100000);
}

function decorateLink(link, host, protocol) {
  if (!link) return null;
  return Object.assign({}, link, {
    short: buildShortUrl(host, link.prefix, link.slug, protocol)
  });
}

function normalizeLinkArray(links, host, protocol) {
  return links.map((link) => decorateLink(link, host, protocol));
}

const API_ROUTES = ['/api/auth', '/api/me', '/api/links'];

function isApiEndpoint(pathname) {
  if (API_ROUTES.indexOf(pathname) !== -1) return true;
  if (/^\/api\/links\/\d+$/.test(pathname)) return true;
  return false;
}

function isReservedRoute(route) {
  const reserved = ['/', '/api', '/api/auth', '/api/me', '/api/links', '/404', '/favicon.svg', '/index.html'];
  return reserved.some(r => route === r || route.startsWith(r + '/'));
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(payload));
}

function sendHtml(res, status, html) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(html);
}

function sendFile(res, status, filePath, contentType) {
  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(status, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });
    res.end(content);
  } catch (error) {
    send404(res);
  }
}

function send404(res) {
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>404</title><style>body{font-family:Inter,Segoe UI,sans-serif;background:#05070a;color:#f3f5fa;display:grid;place-items:center;min-height:100vh;margin:0}.box{background:#0e1320;border:1px solid #273244;border-radius:20px;padding:32px 28px;max-width:460px;text-align:center}h1{margin:0 0 8px;font-size:2rem}p{color:#8f9bb3}a{display:inline-block;margin-top:16px;padding:10px 16px;border-radius:999px;background:#00e5ff;color:#031019;text-decoration:none;font-weight:700}</style></head><body><div class="box"><h1>404</h1><p>Not found</p><a href="/">Home</a></div></body></html>';
  sendHtml(res, 404, html);
}

function parseRequestBody(req, callback) {
  const contentType = String(req.headers['content-type'] || '').toLowerCase().trim();
  const chunks = [];
  let totalSize = 0;
  const maxSize = 1024 * 1024;

  req.on('data', (chunk) => {
    totalSize += chunk.length;
    if (totalSize > maxSize) {
      req.destroy();
      return callback(new Error('Body too large'));
    }
    chunks.push(chunk);
  });

  req.on('end', () => {
    try {
      if (chunks.length === 0) return callback(null, {});
      const body = Buffer.concat(chunks).toString('utf8');
      if (!body || body.length === 0) return callback(null, {});

      if (contentType.indexOf('application/json') !== -1 || (!contentType && body.trim().charAt(0) === '{')) {
        callback(null, JSON.parse(body));
        return;
      }

      if (contentType.indexOf('application/x-www-form-urlencoded') !== -1 || contentType.indexOf('form') !== -1) {
        const params = {};
        body.split('&').forEach(function(pair) {
          const parts = pair.split('=');
          if (parts.length >= 2) {
            params[decodeURIComponent(parts[0])] = decodeURIComponent(parts.slice(1).join('='));
          }
        });
        callback(null, params);
        return;
      }

      if (contentType.indexOf('text/plain') !== -1) {
        try {
          callback(null, JSON.parse(body));
        } catch (e) {
          callback(null, { raw: body });
        }
        return;
      }

      try {
        callback(null, JSON.parse(body));
      } catch (e2) {
        const params = {};
        body.split('&').forEach(function(pair) {
          const parts = pair.split('=');
          if (parts.length >= 2) {
            params[decodeURIComponent(parts[0])] = decodeURIComponent(parts.slice(1).join('='));
          }
        });
        if (Object.keys(params).length > 0) {
          callback(null, params);
        } else {
          callback(null, { raw: body });
        }
      }
    } catch (error) {
      callback(error);
    }
  });

  req.on('error', function(err) {
    callback(err);
  });
}

const server = http.createServer((req, res) => {
  cleanupSessions();
  cleanupRateLimits();

  const requestUrl = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const pathname = decodeURIComponent(requestUrl.pathname || '/');
  const method = req.method;
  const protocol = (req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim() || 'http';
  const host = req.headers.host || 'localhost:' + PORT;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Max-Age': '86400'
    });
    return res.end();
  }

  if (pathname.startsWith('/api/') && !isApiEndpoint(pathname)) {
    const redirectLink = db.links.find((link) => link.route === pathname);
    if (redirectLink) {
      redirectLink.clicks = (redirectLink.clicks || 0) + 1;
      redirectLink.lastUsed = new Date().toISOString();
      saveDatabase(db);
      res.writeHead(302, { Location: redirectLink.target });
      return res.end();
    }
  }

  if (pathname.startsWith('/api/')) {
    if (pathname === '/api/auth' && method === 'POST') {
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

      if (!checkRateLimit(clientIp)) {
        return sendJson(res, 429, { error: 'Too many attempts. Try again later.' });
      }

      return parseRequestBody(req, (error, payload) => {
        if (error) {
          return sendJson(res, 400, { error: 'Invalid request body' });
        }

        const username = String(payload.username || '').trim();
        const password = String(payload.password || '');

        if (!username || !password) {
          return sendJson(res, 401, { error: 'Unauthorized' });
        }

        const user = authenticate(username, password);
        if (!user) {
          return sendJson(res, 401, { error: 'Unauthorized' });
        }

        const token = crypto.randomBytes(24).toString('hex');
        db.sessions.push({
          token: token,
          user: user.username,
          expiresAt: now() + 1000 * 60 * 60 * 24 * 7
        });
        saveDatabase(db);

        return sendJson(res, 200, {
          token: token,
          user: { username: user.username, name: user.name }
        });
      });
    }

    const authHeader = String(req.headers.authorization || '').trim();
    const session = findSession(authHeader);
    if (!session) {
      return sendJson(res, 401, { error: 'Unauthorized' });
    }

    if (pathname === '/api/me' && method === 'GET') {
      const u = findUser(session.user);
      return sendJson(res, 200, {
        user: { username: session.user, name: u ? u.name : session.user },
        links: normalizeLinkArray(getUserLinks(session.user), host, protocol)
      });
    }

    if (pathname === '/api/links' && method === 'GET') {
      return sendJson(res, 200, { links: normalizeLinkArray(getUserLinks(session.user), host, protocol) });
    }

    if (pathname === '/api/links' && method === 'POST') {
      return parseRequestBody(req, (error, payload) => {
        if (error) return sendJson(res, 400, { error: 'Invalid request' });

        const rawTarget = String(payload.target || '').trim();
        if (!rawTarget) {
          return sendJson(res, 400, { error: 'Target URL is required' });
        }

        const route = normalizeRoute(payload.prefix, payload.slug);
        if (isReservedRoute(route)) {
          return sendJson(res, 400, { error: 'Invalid or reserved route' });
        }
        if (db.links.some((link) => link.route === route)) {
          return sendJson(res, 409, { error: 'Route already in use' });
        }

        const entry = {
          id: nextId(),
          owner: session.user,
          target: rawTarget,
          prefix: String(payload.prefix || '').trim(),
          slug: String(payload.slug || '').trim(),
          route: route,
          short: buildShortUrl(host, payload.prefix, payload.slug, protocol),
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

    const updateMatch = pathname.match(/^\/api\/links\/(\d+)$/);
    if (updateMatch && method === 'PUT') {
      return parseRequestBody(req, (error, payload) => {
        if (error) return sendJson(res, 400, { error: 'Invalid request' });

        const link = db.links.find((item) => item.id === Number(updateMatch[1]) && item.owner === session.user);
        if (!link) return sendJson(res, 404, { error: 'Link not found' });

        const route = normalizeRoute(payload.prefix, payload.slug);
        if (db.links.some((item) => item.id !== link.id && item.route === route)) {
          return sendJson(res, 409, { error: 'Route already in use' });
        }

        link.target = String(payload.target || link.target).trim();
        link.prefix = String(payload.prefix || '').trim();
        link.slug = String(payload.slug || '').trim();
        link.route = route;
        link.short = buildShortUrl(host, payload.prefix, payload.slug, protocol);
        link.label = String(payload.label || '').trim();
        link.updatedAt = now();
        saveDatabase(db);
        return sendJson(res, 200, { link });
      });
    }

    const deleteMatch = pathname.match(/^\/api\/links\/(\d+)$/);
    if (deleteMatch && method === 'DELETE') {
      db.links = db.links.filter((item) => !(item.id === Number(deleteMatch[1]) && item.owner === session.user));
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

  const redirectLink = db.links.find((link) => link.route === pathname);
  if (redirectLink) {
    redirectLink.clicks = (redirectLink.clicks || 0) + 1;
    redirectLink.lastUsed = new Date().toISOString();
    saveDatabase(db);
    res.writeHead(302, { Location: redirectLink.target });
    return res.end();
  }

  if (pathname === '/404') {
    return send404(res);
  }

  return send404(res);
});

server.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});
