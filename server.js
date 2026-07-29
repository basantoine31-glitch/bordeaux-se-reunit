const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

/* ============================= PERSISTENCE ============================= */
// Simple file-based persistence. Good enough for classroom / small-group use.
// For heavier production use, swap this out for a real database.
let db = { sessions: {}, registry: {} };

function load() {
  try {
    db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    db = { sessions: {}, registry: {} };
  }
}
let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    fs.writeFile(DATA_FILE, JSON.stringify(db, null, 2), (err) => {
      if (err) console.error('Échec de sauvegarde:', err);
    });
  }, 300);
}
load();

/* ============================= HELPERS ============================= */
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 5; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
function slugify(s) {
  return (
    (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'joueur-' + Math.floor(Math.random() * 10000)
  );
}
function defaultTheme() {
  return { bg: '#12163B', surface: '#1B2153', primary: '#7C5CFC', accent: '#FFB238', text: '#F5F3FF', correct: '#3DDC97', wrong: '#FF5468' };
}
function defaultConfig() {
  return {
    title: 'Quiz sans titre',
    theme: defaultTheme(),
    coverImage: '',
    questions: [
      {
        id: 'q' + Date.now(),
        text: 'Quelle est la capitale de la France ?',
        image: '',
        transitionImage: '',
        choices: ['Paris', 'Lyon', 'Marseille', 'Toulouse'],
        correctIndex: 0
      }
    ]
  };
}
function defaultState() {
  return { phase: 'lobby', currentQuestionIndex: -1, questionOpenedAt: null };
}
function getSession(code) {
  return db.sessions[code] || null;
}
function ensureSession(code) {
  if (!db.sessions[code]) {
    db.sessions[code] = { config: defaultConfig(), state: defaultState(), players: {}, answers: {}, results: {} };
  }
  return db.sessions[code];
}
function computeRoundResults(answers, correctIndex) {
  const entries = Object.entries(answers || {}).filter(([, a]) => a && a.choiceIndex === correctIndex);
  entries.sort((a, b) => a[1].answeredAt - b[1].answeredAt);
  const N = entries.length;
  const results = {};
  entries.forEach(([id], rank) => {
    const weight = N - rank;
    const sum = (N * (N + 1)) / 2;
    results[id] = Math.round((1000 * weight) / sum);
  });
  return results;
}

/* ============================= SOCKET.IO ============================= */
io.on('connection', (socket) => {
  socket.on('registry:list', (cb) => {
    const list = Object.entries(db.registry).map(([code, meta]) => ({ code, ...meta }));
    cb && cb(list);
  });

  socket.on('session:create', (cb) => {
    const code = genCode();
    const s = ensureSession(code);
    db.registry[code] = { title: s.config.title, createdAt: Date.now(), updatedAt: Date.now() };
    scheduleSave();
    cb && cb({ code, session: s });
  });

  socket.on('session:clone', ({ code }, cb) => {
    const src = ensureSession(code);
    const newCode = genCode();
    const cfg = JSON.parse(JSON.stringify(src.config));
    db.sessions[newCode] = { config: cfg, state: defaultState(), players: {}, answers: {}, results: {} };
    db.registry[newCode] = { title: cfg.title, createdAt: Date.now(), updatedAt: Date.now() };
    scheduleSave();
    cb && cb({ code: newCode });
  });

  socket.on('host:join', ({ code }, cb) => {
    const s = getSession(code);
    if (!s) { cb && cb(null); return; }
    socket.join(code);
    socket.data.code = code;
    socket.data.role = 'host';
    cb && cb({ session: s });
  });

  socket.on('player:join', ({ code, name }, cb) => {
    const s = getSession(code);
    if (!s) { cb && cb(null); return; }
    const playerId = slugify(name);
    if (!s.players[playerId]) s.players[playerId] = { name, score: 0, joinedAt: Date.now() };
    socket.join(code);
    socket.data.code = code;
    socket.data.role = 'player';
    socket.data.playerId = playerId;
    scheduleSave();
    io.to(code).emit('players:update', s.players);
    cb && cb({ playerId, session: s });
  });

  socket.on('config:save', ({ code, config }) => {
    const s = ensureSession(code);
    s.config = config;
    db.registry[code] = {
      title: config.title,
      createdAt: (db.registry[code] && db.registry[code].createdAt) || Date.now(),
      updatedAt: Date.now()
    };
    scheduleSave();
    io.to(code).emit('config:update', s.config);
  });

  socket.on('state:update', ({ code, state }) => {
    const s = ensureSession(code);
    s.state = state;
    scheduleSave();
    io.to(code).emit('state:update', s.state);
  });

  socket.on('answer:submit', ({ code, qIndex, playerId, choiceIndex }) => {
    const s = ensureSession(code);
    if (s.state.phase !== 'question' || s.state.currentQuestionIndex !== qIndex) return;
    if (!s.answers[qIndex]) s.answers[qIndex] = {};
    if (s.answers[qIndex][playerId]) return; // already answered, ignore duplicates
    // Server timestamps the answer itself, so ranking is fair regardless of each player's device clock.
    s.answers[qIndex][playerId] = { choiceIndex, answeredAt: Date.now() };
    scheduleSave();
    io.to(code).emit('answers:count', {
      qIndex,
      count: Object.keys(s.answers[qIndex]).length,
      total: Object.keys(s.players).length
    });
  });

  socket.on('question:reveal', ({ code, qIndex }, cb) => {
    const s = ensureSession(code);
    const q = s.config.questions[qIndex];
    if (!q) return;
    const results = computeRoundResults(s.answers[qIndex], q.correctIndex);
    s.results[qIndex] = results;
    Object.entries(results).forEach(([pid, pts]) => {
      if (s.players[pid]) s.players[pid].score += pts;
    });
    scheduleSave();
    io.to(code).emit('results:update', { qIndex, results });
    io.to(code).emit('players:update', s.players);
    cb && cb({ results });
  });
});

server.listen(PORT, () => {
  console.log(`QuizLive server prêt sur le port ${PORT}`);
});
