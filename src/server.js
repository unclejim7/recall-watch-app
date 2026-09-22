require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const { db } = require('./db');
const scheduler = require('./scheduler');
const push = require('./push');
const { normalizePhone } = require('./phone');

const isProd = process.env.NODE_ENV === 'production';

const app = express();
app.set('trust proxy', 1); // needed for secure cookies when deployed behind a platform's proxy (Render, Railway, Fly.io, ...)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'script-src': ["'self'"],
      'style-src': ["'self'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com']
    }
  }
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    sameSite: 'lax',
    secure: isProd
  }
}));

// A handful of failed logins/signups per IP is normal; dozens in a minute is credential stuffing.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in a few minutes.' }
});

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'not_authenticated' });
  next();
}

app.get('/api/health', (req, res) => res.json({ ok: true }));

// ---- Auth ----

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post('/api/signup', authLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !EMAIL_RE.test(email) || !password || password.length < 8) {
    return res.status(400).json({ error: 'A valid email and an 8+ character password are required.' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) return res.status(400).json({ error: 'An account with that email already exists.' });

  const hash = await bcrypt.hash(password, 10);
  const info = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email.toLowerCase(), hash);
  req.session.userId = info.lastInsertRowid;
  res.json({ ok: true, email: email.toLowerCase() });
});

app.post('/api/login', authLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').toLowerCase());
  if (!user || !(await bcrypt.compare(password || '', user.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  req.session.userId = user.id;
  res.json({ ok: true, email: user.email });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = db.prepare('SELECT email, phone FROM users WHERE id = ?').get(req.session.userId);
  res.json({ user });
});

app.patch('/api/me', requireAuth, (req, res) => {
  const { phone } = req.body || {};
  if (phone === undefined) return res.status(400).json({ error: 'Nothing to update.' });

  let normalized = null;
  if (String(phone || '').trim() !== '') {
    normalized = normalizePhone(phone);
    if (!normalized) {
      return res.status(400).json({ error: 'Enter a valid phone number, e.g. (555) 123-4567.' });
    }
  }
  db.prepare('UPDATE users SET phone = ? WHERE id = ?').run(normalized, req.session.userId);
  res.json({ ok: true, phone: normalized });
});

// ---- Push notifications ----

app.get('/api/push/vapid-public-key', (req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY || null });
});

app.post('/api/push/subscribe', requireAuth, (req, res) => {
  const { subscription } = req.body || {};
  if (!subscription || !subscription.endpoint || !subscription.keys
      || !subscription.keys.p256dh || !subscription.keys.auth) {
    return res.status(400).json({ error: 'Invalid push subscription.' });
  }
  push.saveSubscription(req.session.userId, subscription);
  res.json({ ok: true });
});

app.post('/api/push/unsubscribe', requireAuth, (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: 'Missing endpoint.' });
  push.removeSubscription(req.session.userId, endpoint);
  res.json({ ok: true });
});

// ---- Watched items ----

const CATEGORIES = ['consumer_product', 'vehicle', 'food', 'drug'];

app.get('/api/items', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM watched_items WHERE user_id = ? ORDER BY created_at DESC')
    .all(req.session.userId);
  res.json(rows.map((r) => ({ ...r, criteria: JSON.parse(r.criteria_json) })));
});

app.post('/api/items', requireAuth, (req, res) => {
  const { category, label, criteria } = req.body || {};
  if (!CATEGORIES.includes(category)) return res.status(400).json({ error: 'Invalid category.' });
  if (!label || !label.trim()) return res.status(400).json({ error: 'Label is required.' });

  if (category === 'vehicle') {
    const { make, model, year } = criteria || {};
    if (!make || !model || !year) {
      return res.status(400).json({ error: 'Vehicles need make, model, and year.' });
    }
  } else {
    if (!criteria || !criteria.keywords || !criteria.keywords.trim()) {
      return res.status(400).json({ error: 'Add a few keywords describing the product (brand, model, etc).' });
    }
  }

  const info = db.prepare(
    'INSERT INTO watched_items (user_id, category, label, criteria_json) VALUES (?, ?, ?, ?)'
  ).run(req.session.userId, category, label.trim(), JSON.stringify(criteria));
  res.json({ id: info.lastInsertRowid });
});

app.delete('/api/items/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM watched_items WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.session.userId);
  res.json({ ok: true });
});

// Manual trigger, useful for testing after you add an item
app.post('/api/check-now', requireAuth, async (req, res) => {
  scheduler.runAllChecks().catch((e) => console.error(e));
  res.json({ ok: true, note: 'Check started in the background — matches arrive by email.' });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars -- Express requires 4-arg signature to detect an error handler
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`[recall-watch] listening on port ${PORT}`);
    scheduler.start();
  });
}

module.exports = app;
