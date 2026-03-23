// UVM FabLab 3D Printer Scheduler
// Backend using Express, better-sqlite3, bcrypt, and JWT

const express   = require('express');
const Database  = require('better-sqlite3');
const bcrypt    = require('bcrypt');
const jwt       = require('jsonwebtoken');
const path      = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fablab-secret-change-in-production';

// middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// connect to sqlite database
const db = new Database(path.join(__dirname, 'data', 'bookings.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id       TEXT PRIMARY KEY,
    printer  INTEGER NOT NULL,
    owner    TEXT NOT NULL,
    title    TEXT NOT NULL,
    start    TEXT NOT NULL,
    end      TEXT NOT NULL,
    created  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    email      TEXT,
    pin_hash   TEXT NOT NULL,
    role       TEXT NOT NULL DEFAULT 'user',
    force_pin_change INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS printers (
    id      INTEGER PRIMARY KEY,
    name    TEXT NOT NULL,
    status  TEXT NOT NULL DEFAULT 'online',
    note    TEXT
  );
`);

// add the force_pin_change column if it doesn't exist (for existing databases)
try {
  db.exec('ALTER TABLE users ADD COLUMN force_pin_change INTEGER DEFAULT 0');
} catch {
  // column already exists, that's fine
}

// add printers on first run if the table is empty
const printerCount = db.prepare('SELECT COUNT(*) as c FROM printers').get();
if (printerCount.c === 0) {
  const names = ['Leonardo','Donatello','Raphael','Michelangelo'];
  names.forEach((name, i) => {
    db.prepare('INSERT INTO printers (id, name, status) VALUES (?, ?, ?)').run(i, name, 'online');
  });
}

// create a default admin account on first run - change the PIN immediately
const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get();
if (userCount.c === 0) {
  const hash = bcrypt.hashSync('1234', 10);
  db.prepare('INSERT INTO users (name, pin_hash, role, force_pin_change) VALUES (?, ?, ?, ?)').run('Admin', hash, 'admin', 0);
  console.log('Default admin created: name="Admin" pin="1234" - change this immediately!');
}

// check for a valid JWT in the authorization header
function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// same as requireAuth but also checks that the user is an admin
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    next();
  });
}

// generates a reservation ID in the format FBL-{base36 timestamp}-{printerInitial}{checksum}
// for example: FBL-K3X9M-L7
function makeReservationId(printerIdx, startISO) {
  const PRINTER_INITIALS = ['L','D','R','M'];
  const ts = new Date(startISO).getTime();
  const b36 = ts.toString(36).toUpperCase().slice(-5); // last 5 chars of base36 timestamp
  const initial = PRINTER_INITIALS[printerIdx] || 'X';
  // checksum is sum of char codes mod 36, mapped to alphanumeric
  const raw = b36 + initial;
  const checksum = raw.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 36;
  const checksumChar = checksum < 10 ? String(checksum) : String.fromCharCode(55 + checksum);
  return `FBL-${b36}-${initial}${checksumChar}`;
}

// login - matches name case-insensitively and ignores spaces
app.post('/api/login', (req, res) => {
  let { name, pin } = req.body;
  if (!name || !pin) return res.status(400).json({ error: 'Name and PIN required.' });
  const normalise = s => s.toLowerCase().replace(/\s+/g, '');
  const users = db.prepare('SELECT * FROM users').all();
  const user = users.find(u => normalise(u.name) === normalise(name));
  if (!user) return res.status(401).json({ error: 'Invalid name or PIN.' });
  if (!bcrypt.compareSync(String(pin), user.pin_hash))
    return res.status(401).json({ error: 'Invalid name or PIN.' });
  const token = jwt.sign({ id: user.id, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, name: user.name, role: user.role, force_pin_change: user.force_pin_change });
});

// user management - admin only
app.get('/api/users', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT id, name, email, role, force_pin_change FROM users').all());
});

app.post('/api/users', requireAdmin, (req, res) => {
  const { name, pin, role, email } = req.body;
  if (!name || !pin || !role) return res.status(400).json({ error: 'Name, PIN, and role required.' });
  if (!['admin','user','read'].includes(role)) return res.status(400).json({ error: 'Invalid role.' });
  const pin_hash = bcrypt.hashSync(String(pin), 10);
  try {
    db.prepare('INSERT INTO users (name, email, pin_hash, role, force_pin_change) VALUES (?, ?, ?, ?, ?)').run(name, email || null, pin_hash, role, 0);
    res.json({ success: true });
  } catch {
    res.status(409).json({ error: 'User already exists.' });
  }
});

app.delete('/api/users/:id', requireAdmin, (req, res) => {
  const r = db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Not found.' });
  res.json({ success: true });
});

// set force_pin_change flag for a user (admin only)
app.put('/api/users/:id/force-pin-change', requireAdmin, (req, res) => {
  const { force } = req.body;
  if (force === undefined) return res.status(400).json({ error: 'force parameter required.' });
  const r = db.prepare('UPDATE users SET force_pin_change = ? WHERE id = ?').run(force ? 1 : 0, req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'User not found.' });
  res.json({ success: true });
});

// allow user to change their own PIN
app.put('/api/users/change-pin', requireAuth, (req, res) => {
  const { current_pin, new_pin } = req.body;
  if (!current_pin || !new_pin) return res.status(400).json({ error: 'Current PIN and new PIN required.' });
  
  // validate new PIN is 4-8 digits
  if (!/^\d{4,8}$/.test(new_pin)) 
    return res.status(400).json({ error: 'New PIN must be 4-8 digits.' });
  
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  
  // verify current PIN
  if (!bcrypt.compareSync(String(current_pin), user.pin_hash))
    return res.status(401).json({ error: 'Incorrect current PIN, or server error. Please try again.' });
  
  // update to new PIN
  const new_hash = bcrypt.hashSync(String(new_pin), 10);
  db.prepare('UPDATE users SET pin_hash = ?, force_pin_change = 0 WHERE id = ?').run(new_hash, req.user.id);
  
  res.json({ success: true });
});

// check if user needs to change PIN (for frontend to show warning)
app.get('/api/users/check-pin-status', requireAuth, (req, res) => {
  const user = db.prepare('SELECT force_pin_change FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ force_pin_change: user.force_pin_change });
});

// printer management
app.get('/api/printers', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM printers ORDER BY id').all());
});

app.put('/api/printers/:id', requireAdmin, (req, res) => {
  const { status, note } = req.body;
  const valid = ['online', 'offline', 'maintenance'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const r = db.prepare('UPDATE printers SET status=?, note=? WHERE id=?').run(status, note || null, req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Printer not found.' });
  res.json({ success: true });
});

// bookings
app.get('/api/bookings', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM bookings ORDER BY start').all());
});

app.post('/api/bookings', requireAuth, (req, res) => {
  const { printer, start, end, title } = req.body;
  if (printer === undefined || !start || !end)
    return res.status(400).json({ error: 'Missing fields.' });
  const printerRow = db.prepare('SELECT * FROM printers WHERE id = ?').get(printer);
  if (!printerRow || printerRow.status !== 'online')
    return res.status(409).json({ error: 'Printer is not available.' });
  const id = makeReservationId(printer, start);
  // if there is a collision, append a counter to keep the id unique
  let finalId = id;
  let attempt = 1;
  while (db.prepare('SELECT id FROM bookings WHERE id = ?').get(finalId)) {
    finalId = `${id}-${attempt++}`;
  }
  db.prepare('INSERT INTO bookings (id,printer,owner,title,start,end) VALUES (?,?,?,?,?,?)')
    .run(finalId, printer, req.user.name, title || req.user.name, start, end);
  res.json({ success: true, id: finalId });
});

app.put('/api/bookings/:id', requireAuth, (req, res) => {
  const { start, end } = req.body;
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Not found.' });
  if (req.user.role !== 'admin' && booking.owner !== req.user.name)
    return res.status(403).json({ error: 'Cannot edit others\' bookings.' });
  db.prepare('UPDATE bookings SET start=?,end=? WHERE id=?').run(start, end, req.params.id);
  res.json({ success: true });
});

app.delete('/api/bookings/:id', requireAuth, (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Not found.' });
  if (req.user.role !== 'admin' && booking.owner !== req.user.name)
    return res.status(403).json({ error: 'Cannot delete others\' bookings.' });
  db.prepare('DELETE FROM bookings WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// send everything else to the frontend
app.get('*', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

app.listen(PORT, () =>
  console.log(`FabLab Scheduler running at http://localhost:${PORT}`)
);
