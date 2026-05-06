const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');
const db = new Database('hdti.db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

db.exec(`
  CREATE TABLE IF NOT EXISTS test_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mbti_type TEXT NOT NULL,
    answers TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS danmaku (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT DEFAULT '匿名用户',
    content TEXT NOT NULL,
    mbti_type TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS stats (
    id INTEGER PRIMARY KEY,
    total_tests INTEGER DEFAULT 0
  );

  INSERT OR IGNORE INTO stats (id, total_tests) VALUES (1, 0);
`);

function getStats() {
  const total = db.prepare('SELECT total_tests FROM stats WHERE id = 1').get();
  const typeCounts = db.prepare(`
    SELECT mbti_type, COUNT(*) as count
    FROM test_results
    GROUP BY mbti_type
  `).all();

  const distribution = {};
  const types = ['ENTJ', 'INTJ', 'ENFJ', 'INFJ', 'ESTJ', 'ISTJ', 'ESFJ', 'ISFJ',
                 'ESTP', 'ISTP', 'ESFP', 'ISFP', 'ENTP', 'INTP', 'ENFP', 'INFP'];

  types.forEach(type => {
    const found = typeCounts.find(row => row.mbti_type === type);
    distribution[type] = found ? found.count : 0;
  });

  return {
    totalTests: total.total_tests,
    distribution: distribution
  };
}

app.get('/api/stats', (req, res) => {
  try {
    const stats = getStats();
    res.json(stats);
  } catch (error) {
    console.error('获取统计数据失败:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.get('/api/danmaku/latest', (req, res) => {
  try {
    const latest = db.prepare(`
      SELECT * FROM danmaku
      ORDER BY created_at DESC
      LIMIT 50
    `).all();
    res.json(latest);
  } catch (error) {
    console.error('获取弹幕失败:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.post('/api/submit', (req, res) => {
  try {
    const { mbtiType, answers } = req.body;

    if (!mbtiType || !answers) {
      return res.status(400).json({ error: '参数错误' });
    }

    db.prepare('INSERT INTO test_results (mbti_type, answers) VALUES (?, ?)').run(mbtiType, JSON.stringify(answers));
    db.prepare('UPDATE stats SET total_tests = total_tests + 1 WHERE id = 1').run();

    const stats = getStats();
    io.emit('stats-update', stats);

    res.json({
      success: true,
      stats: stats
    });
  } catch (error) {
    console.error('提交结果失败:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.post('/api/danmaku', (req, res) => {
  try {
    const { content, username, mbtiType } = req.body;

    if (!content) {
      return res.status(400).json({ error: '内容不能为空' });
    }

    const result = db.prepare('INSERT INTO danmaku (username, content, mbti_type) VALUES (?, ?, ?)').run(
      username || '匿名用户',
      content.substring(0, 100),
      mbtiType || null
    );

    const danmaku = {
      id: result.lastInsertRowid,
      username: username || '匿名用户',
      content: content.substring(0, 100),
      mbti_type: mbtiType || null,
      created_at: new Date().toISOString()
    };

    io.emit('new-danmaku', danmaku);

    res.json({
      success: true,
      danmaku: danmaku
    });
  } catch (error) {
    console.error('发送弹幕失败:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

app.get('/api/results', (req, res) => {
  try {
    const results = db.prepare(`
      SELECT * FROM test_results
      ORDER BY created_at DESC
      LIMIT 100
    `).all();
    res.json(results);
  } catch (error) {
    console.error('获取结果失败:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

io.on('connection', (socket) => {
  console.log('用户连接:', socket.id);

  socket.on('join', (data) => {
    console.log('用户加入:', data);
    const stats = getStats();
    socket.emit('stats-update', stats);
  });

  socket.on('disconnect', () => {
    console.log('用户断开:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`HDTI服务器运行在端口 ${PORT}`);
  console.log(`访问统计: http://localhost:${PORT}/api/stats`);
  console.log(`管理后台: http://localhost:${PORT}/admin.html`);
});