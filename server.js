const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '5mb' }));

// Database (file sqlite di workspace) - open with flags and setup PRAGMA
const dbPath = path.join(__dirname, 'tabungan.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
  if (err) {
    console.error('Gagal membuka database:', err.message);
    process.exit(1);
  }
  console.log('Database terbuka:', dbPath);
  // Tuning for concurrent access and stability
  db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;", (prErr) => {
    if (prErr) console.warn('PRAGMA setup warning:', prErr.message);
  });
});

// Initialize schema safely
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'customer'
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    username TEXT,
    amount REAL,
    note TEXT,
    datetime TEXT
  )`);

  // Ensure 'role' column exists in users (for older DBs)
  db.all("PRAGMA table_info('users')", (err, cols) => {
    if (!err && Array.isArray(cols)) {
      const hasRole = cols.some(c => c.name === 'role');
      if (!hasRole) {
        db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'customer'", (aErr) => {
          if (aErr) console.warn('Failed to add role column:', aErr.message);
        });
      }
    }
  });
});

app.get('/api/ping', (req, res) => res.json({ ok: true, ts: Date.now() }));

// Login endpoint
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username & password required' });
  db.get('SELECT username, name, role FROM users WHERE username = ? AND password = ?', [username, password], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(401).json({ ok: false, error: 'invalid credentials' });
    res.json({ ok: true, username: row.username, name: row.name, role: row.role || 'customer' });
  });
});

// Export transactions for a user
app.get('/api/export', (req, res) => {
  const username = req.query.username;
  if (!username) return res.status(400).json({ error: 'username required' });

  db.all('SELECT * FROM transactions WHERE username = ?', [username], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ transactions: rows });
  });
});

// Admin: list all users (developer only)
app.get('/api/admin/users', (req, res) => {
  const adminUser = req.header('x-username') || req.query.admin;
  if (!adminUser) return res.status(400).json({ error: 'admin username required in x-username header' });
  db.get('SELECT role FROM users WHERE username = ?', [adminUser], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row || row.role !== 'developer') return res.status(403).json({ error: 'forbidden' });
    db.all('SELECT id, name, username, role FROM users', (err2, rows) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ users: rows });
    });
  });
});

// Admin: list all transactions (developer only)
app.get('/api/admin/transactions', (req, res) => {
  const adminUser = req.header('x-username') || req.query.admin;
  if (!adminUser) return res.status(400).json({ error: 'admin username required in x-username header' });
  db.get('SELECT role FROM users WHERE username = ?', [adminUser], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row || row.role !== 'developer') return res.status(403).json({ error: 'forbidden' });
    db.all('SELECT * FROM transactions', (err2, rows) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ transactions: rows });
    });
  });
});

// Import or sync transactions: upsert incoming transactions
app.post('/api/sync', (req, res) => {
  const { username, transactions } = req.body || {};
  if (!username || !Array.isArray(transactions)) return res.status(400).json({ error: 'username and transactions array required' });

  // Begin transaction, run upserts using prepared statement and Promise.all for stability
  db.run('BEGIN TRANSACTION', (bErr) => {
    if (bErr) return res.status(500).json({ error: 'Failed to begin transaction: ' + bErr.message });

    const stmt = db.prepare(`INSERT OR REPLACE INTO transactions (id, username, amount, note, datetime) VALUES (?, ?, ?, ?, ?)`);

    const ops = transactions.map(t => new Promise((resolve, reject) => {
      const id = t.id || Date.now().toString() + Math.floor(Math.random() * 1000);
      stmt.run(id, username, t.amount || 0, t.note || '', t.datetime || new Date().toISOString(), function(err) {
        if (err) return reject(err);
        resolve();
      });
    }));

    Promise.all(ops)
      .then(() => {
        stmt.finalize((fErr) => {
          if (fErr) {
            db.run('ROLLBACK', () => {
              return res.status(500).json({ error: 'Finalize failed: ' + fErr.message });
            });
          } else {
            db.run('COMMIT', (cErr) => {
              if (cErr) return res.status(500).json({ error: 'Commit failed: ' + cErr.message });
              db.all('SELECT * FROM transactions WHERE username = ?', [username], (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ ok: true, transactions: rows });
              });
            });
          }
        });
      })
      .catch((opErr) => {
        try {
          stmt.finalize(() => {
            db.run('ROLLBACK', () => {
              return res.status(500).json({ error: 'Operation failed: ' + opErr.message });
            });
          });
        } catch (e) {
          return res.status(500).json({ error: 'Critical DB error: ' + e.message });
        }
      });
  });
});

// Simple import endpoint (alias)
app.post('/api/import', (req, res) => {
  req.url = '/api/sync';
  app._router.handle(req, res);
});

// Basic user creation endpoint (optional)
app.post('/api/users', (req, res) => {
  const { name, username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username & password required' });
  const role = (username && username.endsWith('dlr01')) ? 'developer' : 'customer';
  db.run('INSERT OR IGNORE INTO users (name, username, password, role) VALUES (?, ?, ?, ?)', [name || '', username, password, role], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true, created: this.changes > 0, role });
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Aplikasi Tabungan backend berjalan di http://localhost:${PORT}`);
});

// Graceful shutdown
function closeDbAndExit(code = 0) {
  console.log('Menutup database...');
  db.close((err) => {
    if (err) console.error('Error menutup DB:', err.message);
    else console.log('Database tertutup.');
    process.exit(code);
  });
}

process.on('SIGINT', () => closeDbAndExit(0));
process.on('SIGTERM', () => closeDbAndExit(0));
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  closeDbAndExit(1);
});
