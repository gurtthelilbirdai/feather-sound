// Feather Sound API: a shared library of tiny sound recipes for the flock.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA = path.join(__dirname, 'data');
try { fs.mkdirSync(DATA, { recursive: true }); } catch (e) {}
const db = new Database(path.join(DATA, 'sounds.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS sounds (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    bird TEXT NOT NULL DEFAULT 'gurt',
    kind TEXT NOT NULL DEFAULT 'chirp',
    freq REAL NOT NULL DEFAULT 440,
    dur REAL NOT NULL DEFAULT 0.3,
    created TEXT NOT NULL,
    plays INTEGER NOT NULL DEFAULT 0
  );
`);

const stmt = {
  list: db.prepare('SELECT * FROM sounds ORDER BY created DESC LIMIT 300'),
  get: db.prepare('SELECT * FROM sounds WHERE id = ?'),
  insert: db.prepare('INSERT INTO sounds (id,title,bird,kind,freq,dur,created,plays) VALUES (@id,@title,@bird,@kind,@freq,@dur,@created,@plays)'),
  play: db.prepare('UPDATE sounds SET plays = plays + 1 WHERE id = ?')
};

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}
function readBody(req, cb) {
  let raw = '';
  req.on('data', c => { raw += c; if (raw.length > 100000) req.destroy(); });
  req.on('end', () => {
    let body = {};
    try { body = JSON.parse(raw || '{}'); } catch (e) { body = {}; }
    cb(body);
  });
}

module.exports = function handler(req, res, seg) {
  const route = seg[0];

  if (req.method === 'GET' && route === 'sounds') {
    const rows = stmt.list.all();
    return json(res, 200, {
      sounds: rows,
      total: rows.length,
      plays: rows.reduce((a, r) => a + r.plays, 0),
      birds: new Set(rows.map(r => r.bird)).size
    });
  }

  if (req.method === 'POST' && route === 'sounds' && seg[1] === 'new') {
    readBody(req, body => {
      const title = String(body.title || '').trim().slice(0, 80);
      if (!title) return json(res, 400, { error: 'title required' });
      const kind = ['chirp', 'beep', 'thump', 'whoosh', 'bell', 'hum'].includes(body.kind) ? body.kind : 'chirp';
      const freq = Math.min(4000, Math.max(80, Number(body.freq) || 440));
      const dur = Math.min(2, Math.max(0.05, Number(body.dur) || 0.3));
      const sound = {
        id: 'fs' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        title, bird: String(body.bird || 'gurt').trim().slice(0, 40) || 'gurt',
        kind, freq, dur, created: new Date().toISOString(), plays: 0
      };
      stmt.insert.run(sound);
      return json(res, 200, { ok: true, sound });
    });
    return true;
  }

  if (req.method === 'POST' && route === 'sounds' && seg[2] === 'play') {
    const row = stmt.get.get(seg[1]);
    if (!row) return json(res, 404, { error: 'no such sound' });
    stmt.play.run(seg[1]);
    return json(res, 200, { ok: true, sound: stmt.get.get(seg[1]) });
  }

  if (req.method === 'POST' && route === 'sounds' && seg[2] === 'delete') {
    const row = stmt.get.get(seg[1]);
    if (!row) return json(res, 404, { error: 'no such sound' });
    db.prepare('DELETE FROM sounds WHERE id = ?').run(seg[1]);
    return json(res, 200, { ok: true, removed: seg[1] });
  }

  return false;
};
