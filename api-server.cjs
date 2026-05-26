#!/usr/bin/env node
require('dotenv').config();

const express = require('express');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const path = require('path');

const app = express();

const PORT = Number(process.env.PORT || 3000);
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment.');
  process.exit(1);
}

const COOKIE_SECURE = process.env.NODE_ENV === 'production';
const ROOT = __dirname;
const SESSION_COOKIE = 'app_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const LOGIN_RATE_LIMIT_WINDOW_MS = 1000 * 60 * 10; // 10 minutes
const LOGIN_RATE_LIMIT_ATTEMPTS = 8;

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'strict',
  secure: COOKIE_SECURE,
  path: '/'
};

const activeSessions = new Map();
const loginAttempts = new Map();

const ALLOWED_TABLES = new Set([
  'stay_certified',
  'stay_certified_notas',
  'planeamento',
  'planeamento_notas',
  'indicadores',
  'authorized_emails'
]);

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

function now() {
  return Date.now();
}

function setSessionCookie(res, sessionId) {
  res.cookie(SESSION_COOKIE, sessionId, {
    ...COOKIE_OPTS,
    maxAge: SESSION_TTL_MS
  });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, COOKIE_OPTS);
}

function pruneExpiredSessions() {
  const ts = now();
  for (const [sessionId, session] of activeSessions.entries()) {
    if (!session || session.expiresAt <= ts) {
      activeSessions.delete(sessionId);
    }
  }
}

function isRateLimited(email) {
  const key = String(email || '').toLowerCase();
  const ts = now();
  const entry = loginAttempts.get(key) || { count: 0, firstAttemptAt: ts };
  if (ts - entry.firstAttemptAt > LOGIN_RATE_LIMIT_WINDOW_MS) {
    loginAttempts.set(key, { count: 0, firstAttemptAt: ts });
    return false;
  }
  return entry.count >= LOGIN_RATE_LIMIT_ATTEMPTS;
}

function registerLoginAttempt(email, success) {
  const key = String(email || '').toLowerCase();
  const ts = now();
  const entry = loginAttempts.get(key) || { count: 0, firstAttemptAt: ts };

  if (success) {
    loginAttempts.delete(key);
    return;
  }

  if (ts - entry.firstAttemptAt > LOGIN_RATE_LIMIT_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAttemptAt: ts });
    return;
  }

  entry.count += 1;
  loginAttempts.set(key, entry);
}

function makePasswordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const N = 16384;
  const r = 8;
  const p = 1;
  const keyLen = 64;
  const derived = crypto.scryptSync(password, Buffer.from(salt, 'hex'), keyLen, {
    N,
    r,
    p,
    maxmem: 64 * 1024 * 1024
  });
  return `scrypt$${N}$${r}$${p}$${salt}$${derived.toString('hex')}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== 'string') return false;
  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const saltHex = parts[4];
  const hashHex = parts[5];

  if (!N || !r || !p || !saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, {
    N,
    r,
    p,
    maxmem: 64 * 1024 * 1024
  });

  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

async function supabaseFetch(pathname, method, body, extraHeaders = {}) {
  const url = `${SUPABASE_URL}${pathname}`;
  const headers = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...extraHeaders
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch (_) { payload = { raw: text }; }
  return { ok: res.ok, status: res.status, payload };
}

function sanitizeEmail(input) {
  return String(input || '').trim().toLowerCase();
}

async function getAllowlistedUser(email) {
  const safeEmail = sanitizeEmail(email);
  if (!safeEmail || !safeEmail.includes('@')) return null;

  const query =
    '/rest/v1/authorized_emails' +
    `?select=email,active,is_admin,password_hash&email=eq.${encodeURIComponent(safeEmail)}&limit=1`;

  const info = await supabaseFetch(query, 'GET', null);
  if (!info.ok || !Array.isArray(info.payload) || info.payload.length === 0) {
    return null;
  }

  return info.payload[0];
}

async function getSupabaseUserFromToken(accessToken) {
  if (!accessToken) return null;

  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data && data.email ? data : null;
}

async function requireSupabaseAdmin(req, res, next) {
  const authHeader = String(req.get('authorization') || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return res.status(401).json({ error: 'Token em falta' });

  try {
    const authUser = await getSupabaseUserFromToken(token);
    const email = sanitizeEmail(authUser?.email || '');
    if (!email) return res.status(401).json({ error: 'Token inválido' });

    const allowlisted = await getAllowlistedUser(email);
    if (!allowlisted || allowlisted.active !== true || allowlisted.is_admin !== true) {
      return res.status(403).json({ error: 'Acesso de administrador necessário' });
    }

    req.user = { email };
    return next();
  } catch (err) {
    console.error('Admin auth error:', err);
    return res.status(500).json({ error: 'Falha na validação de administrador' });
  }
}

async function requireAuthorized(req, res, next) {
  pruneExpiredSessions();
  const sessionId = String(req.cookies[SESSION_COOKIE] || '');
  if (!sessionId) {
    clearSessionCookie(res);
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const session = activeSessions.get(sessionId);
  if (!session || session.expiresAt <= now()) {
    activeSessions.delete(sessionId);
    clearSessionCookie(res);
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const allowlisted = await getAllowlistedUser(session.email);
  if (!allowlisted || allowlisted.active !== true) {
    activeSessions.delete(sessionId);
    clearSessionCookie(res);
    return res.status(403).json({ error: 'Email not authorized' });
  }

  session.expiresAt = now() + SESSION_TTL_MS;
  activeSessions.set(sessionId, session);

  req.user = { email: session.email };
  req.sessionId = sessionId;
  return next();
}

app.get('/api/health', (_, res) => {
  pruneExpiredSessions();
  res.json({ ok: true, sessions: activeSessions.size });
});

app.post('/api/auth/login', async (req, res) => {
  const email = sanitizeEmail(req.body?.email);
  const password = String(req.body?.password || '');

  if (!email || !email.includes('@') || password.length < 4) {
    return res.status(400).json({ error: 'Email ou password inválidos' });
  }

  if (isRateLimited(email)) {
    return res.status(429).json({ error: 'Demasiadas tentativas. Aguarda alguns minutos.' });
  }

  try {
    const user = await getAllowlistedUser(email);
    if (!user || user.active !== true || !user.password_hash) {
      registerLoginAttempt(email, false);
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const validPassword = verifyPassword(password, String(user.password_hash));
    if (!validPassword) {
      registerLoginAttempt(email, false);
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    registerLoginAttempt(email, true);
    const sessionId = crypto.randomBytes(32).toString('hex');
    activeSessions.set(sessionId, { email, expiresAt: now() + SESSION_TTL_MS });
    setSessionCookie(res, sessionId);
    return res.json({ ok: true, email });
  } catch (err) {
    console.error('Login error:', err);
    registerLoginAttempt(email, false);
    return res.status(500).json({ error: 'Erro interno de autenticação' });
  }
});

app.post('/api/auth/logout', (_req, res) => {
  const sessionId = String(_req.cookies[SESSION_COOKIE] || '');
  if (sessionId) {
    activeSessions.delete(sessionId);
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuthorized, (req, res) => {
  res.json({ ok: true, email: String(req.user.email || '').toLowerCase() });
});

app.post('/api/admin/users', requireSupabaseAdmin, async (req, res) => {
  const email = sanitizeEmail(req.body?.email);
  const password = String(req.body?.password || '');
  const active = req.body?.active !== false;
  const isAdmin = req.body?.is_admin === true;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Email inválido' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password deve ter pelo menos 8 caracteres' });
  }

  try {
    let authCreated = false;
    let authExists = false;
    const passwordHash = makePasswordHash(password);
    const passwordUpdatedAt = new Date().toISOString();

    const createAuth = await supabaseFetch('/auth/v1/admin/users', 'POST', {
      email,
      password,
      email_confirm: true,
      user_metadata: { created_by: req.user.email }
    });

    if (createAuth.ok) {
      authCreated = true;
    } else {
      const msg = String(createAuth?.payload?.msg || createAuth?.payload?.message || '').toLowerCase();
      if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
        authExists = true;
      } else {
        return res.status(createAuth.status || 500).json({
          error: createAuth?.payload?.msg || createAuth?.payload?.message || 'Falha ao criar utilizador no Auth'
        });
      }
    }

    const upsert = await supabaseFetch(
      '/rest/v1/authorized_emails?on_conflict=email',
      'POST',
      [{
        email,
        active,
        is_admin: isAdmin,
        password_hash: passwordHash,
        password_updated_at: passwordUpdatedAt
      }],
      { Prefer: 'resolution=merge-duplicates,return=representation' }
    );

    if (!upsert.ok) {
      return res.status(upsert.status || 500).json({
        error: upsert?.payload?.message || 'Falha ao atualizar whitelist'
      });
    }

    return res.json({
      ok: true,
      email,
      auth_created: authCreated,
      auth_exists: authExists,
      whitelist_updated: true,
      password_hash_updated: true
    });
  } catch (err) {
    console.error('Create admin user error:', err);
    return res.status(500).json({ error: 'Erro interno ao criar utilizador' });
  }
});

app.all('/api/:table', requireAuthorized, async (req, res) => {
  const table = req.params.table;
  if (!ALLOWED_TABLES.has(table)) {
    return res.status(404).json({ error: 'Unknown API resource' });
  }

  const qIndex = req.originalUrl.indexOf('?');
  const queryPart = qIndex >= 0 ? req.originalUrl.slice(qIndex) : '';
  const target = `${SUPABASE_URL}/rest/v1/${table}${queryPart}`;

  const upstreamHeaders = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`
  };

  const contentType = req.get('content-type');
  const prefer = req.get('prefer');
  const range = req.get('range');

  if (contentType) upstreamHeaders['Content-Type'] = contentType;
  if (prefer) upstreamHeaders.Prefer = prefer;
  if (range) upstreamHeaders.Range = range;

  const method = req.method.toUpperCase();
  const hasBody = !['GET', 'HEAD', 'DELETE'].includes(method);

  const upstream = await fetch(target, {
    method,
    headers: upstreamHeaders,
    body: hasBody ? JSON.stringify(req.body ?? {}) : undefined
  });

  const text = await upstream.text();
  const contentRange = upstream.headers.get('content-range');
  const preferenceApplied = upstream.headers.get('preference-applied');
  const contentTypeOut = upstream.headers.get('content-type');
  const locationOut = upstream.headers.get('location');

  if (contentRange) res.setHeader('content-range', contentRange);
  if (preferenceApplied) res.setHeader('preference-applied', preferenceApplied);
  if (contentTypeOut) res.setHeader('content-type', contentTypeOut);
  if (locationOut) res.setHeader('location', locationOut);

  return res.status(upstream.status).send(text);
});

app.use('/assets', express.static(path.join(ROOT, 'assets')));

app.get('/styles.css', (_req, res) => {
  res.sendFile(path.join(ROOT, 'styles.css'));
});

app.get('/script.js', (_req, res) => {
  res.sendFile(path.join(ROOT, 'script.js'));
});

app.get(['/login', '/login.html'], (_req, res) => {
  res.sendFile(path.join(ROOT, 'login.html'));
});

const PAGE_ROUTES = {
  '/': 'index.html',
  '/certificacoes': 'certificacoes.html',
  '/planeamento': 'planeamento.html',
  '/indicadores': 'indicadores.html',
  '/alertas': 'alertas.html',
  '/admin': 'admin.html'
};

Object.entries(PAGE_ROUTES).forEach(([route, file]) => {
  app.get(route, requireAuthorized, (_req, res) => res.sendFile(path.join(ROOT, file)));
});

if (process.env.AUTH_INIT_EMAIL && process.env.AUTH_INIT_PASSWORD) {
  (async () => {
    try {
      const email = sanitizeEmail(process.env.AUTH_INIT_EMAIL);
      const hash = makePasswordHash(String(process.env.AUTH_INIT_PASSWORD));
      await supabaseFetch(
        `/rest/v1/authorized_emails?email=eq.${encodeURIComponent(email)}`,
        'PATCH',
        { password_hash: hash, active: true },
        { Prefer: 'return=minimal' }
      );
      console.log(`[AuthInit] Password hash inicializada para ${email}`);
    } catch (err) {
      console.error('[AuthInit] Falha ao inicializar password:', err.message);
    }
  })();
}

setInterval(pruneExpiredSessions, 1000 * 60 * 5);

app.listen(PORT, () => {
  console.log(`Private app server running at http://localhost:${PORT}`);
});
