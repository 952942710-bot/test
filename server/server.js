const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const db = new sqlite3.Database('hdti.db');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS test_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mbti_type TEXT NOT NULL,
      answers TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS danmaku (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT DEFAULT '匿名用户',
      content TEXT NOT NULL,
      mbti_type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS stats (
      id INTEGER PRIMARY KEY,
      total_tests INTEGER DEFAULT 0
    )
  `);

  db.get('SELECT * FROM stats WHERE id = 1', (err, row) => {
    if (!row) {
      db.run('INSERT INTO stats (id, total_tests) VALUES (1, 0)');
    }
  });
});

function getStats(callback) {
  db.get('SELECT total_tests FROM stats WHERE id = 1', (err, totalRow) => {
    if (err) {
      callback(err, null);
      return;
    }

    db.all(`
      SELECT mbti_type, COUNT(*) as count
      FROM test_results
      GROUP BY mbti_type
    `, (err, typeRows) => {
      if (err) {
        callback(err, null);
        return;
      }

      const distribution = {};
      const types = ['ENTJ', 'INTJ', 'ENFJ', 'INFJ', 'ESTJ', 'ISTJ', 'ESFJ', 'ISFJ',
                     'ESTP', 'ISTP', 'ESFP', 'ISFP', 'ENTP', 'INTP', 'ENFP', 'INFP'];

      types.forEach(type => {
        const found = typeRows.find(row => row.mbti_type === type);
        distribution[type] = found ? found.count : 0;
      });

      callback(null, {
        totalTests: totalRow.total_tests,
        distribution: distribution
      });
    });
  });
}

app.get('/api/stats', (req, res) => {
  getStats((err, stats) => {
    if (err) {
      console.error('获取统计数据失败:', err);
      res.status(500).json({ error: '服务器错误' });
      return;
    }
    res.json(stats);
  });
});

app.get('/api/danmaku/latest', (req, res) => {
  db.all(`
    SELECT * FROM danmaku
    ORDER BY created_at DESC
    LIMIT 50
  `, (err, rows) => {
    if (err) {
      console.error('获取弹幕失败:', err);
      res.status(500).json({ error: '服务器错误' });
      return;
    }
    res.json(rows);
  });
});

app.post('/api/submit', (req, res) => {
  const { mbtiType, answers } = req.body;

  if (!mbtiType || !answers) {
    return res.status(400).json({ error: '参数错误' });
  }

  db.run('INSERT INTO test_results (mbti_type, answers) VALUES (?, ?)', [mbtiType, JSON.stringify(answers)], function(err) {
    if (err) {
      console.error('提交结果失败:', err);
      res.status(500).json({ error: '服务器错误' });
      return;
    }

    db.run('UPDATE stats SET total_tests = total_tests + 1 WHERE id = 1', (err) => {
      if (err) {
        console.error('更新统计失败:', err);
      }

      getStats((err, stats) => {
        if (stats) {
          io.emit('stats-update', stats);
        }
        res.json({
          success: true,
          stats: stats || { totalTests: 0, distribution: {} }
        });
      });
    });
  });
});

app.post('/api/danmaku', (req, res) => {
  const { content, username, mbtiType } = req.body;

  if (!content) {
    return res.status(400).json({ error: '内容不能为空' });
  }

  db.run('INSERT INTO danmaku (username, content, mbti_type) VALUES (?, ?, ?)', [
    username || '匿名用户',
    content.substring(0, 100),
    mbtiType || null
  ], function(err) {
    if (err) {
      console.error('发送弹幕失败:', err);
      res.status(500).json({ error: '服务器错误' });
      return;
    }

    const danmaku = {
      id: this.lastID,
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
  });
});

app.get('/api/results', (req, res) => {
  db.all(`
    SELECT * FROM test_results
    ORDER BY created_at DESC
    LIMIT 100
  `, (err, rows) => {
    if (err) {
      console.error('获取结果失败:', err);
      res.status(500).json({ error: '服务器错误' });
      return;
    }
    res.json(rows);
  });
});

io.on('connection', (socket) => {
  console.log('用户连接:', socket.id);

  socket.on('join', (data) => {
    console.log('用户加入:', data);
    getStats((err, stats) => {
      if (stats) {
        socket.emit('stats-update', stats);
      }
    });
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