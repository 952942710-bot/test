# HDTI 千古帝王人格测试 - 后端部署指南

## 项目结构

```
server/
├── package.json          # 项目依赖配置
├── server.js             # 主服务器文件
├── public/               # 静态文件目录
│   └── admin.html        # 管理后台页面
└── hdti.db               # SQLite数据库（部署后自动创建）
```

## 快速部署到 Railway

### 步骤1：创建GitHub仓库

1. 在GitHub创建新仓库，命名为 `hdti-backend`
2. 将 `server` 文件夹内的所有文件上传到仓库

### 步骤2：部署到Railway

1. 访问 https://railway.app
2. 使用GitHub账号登录
3. 点击 "New Project" → "Deploy from GitHub repo"
4. 选择刚创建的 `hdti-backend` 仓库
5. Railway会自动检测Node.js项目并部署

### 步骤3：获取访问地址

部署完成后，Railway会提供一个URL，例如：
`https://hdti-backend.up.railway.app`

### 步骤4：测试服务

- 统计API: `https://your-app.railway.app/api/stats`
- 管理后台: `https://your-app.railway.app/admin.html`
- 提交结果: `POST https://your-app.railway.app/api/submit`
- 发送弹幕: `POST https://your-app.railway.app/api/danmaku`

## 本地运行

```bash
cd server
npm install
npm start
```

访问 http://localhost:3000

## API接口说明

### 获取统计数据
```
GET /api/stats
返回: { totalTests: number, distribution: {...} }
```

### 提交测试结果
```
POST /api/submit
Body: { mbtiType: string, answers: array }
返回: { success: true, stats: {...} }
```

### 获取弹幕
```
GET /api/danmaku/latest
返回: array of danmaku items
```

### 发送弹幕
```
POST /api/danmaku
Body: { content: string, username?: string, mbtiType?: string }
返回: { success: true, danmaku: {...} }
```

## WebSocket事件

### 客户端监听
- `stats-update`: 统计数据更新
- `new-danmaku`: 新弹幕

### 客户端发送
- `join`: 加入连接

## 管理后台

访问 `/admin.html` 可以查看：
- 总测试人数
- 各类型分布
- 实时弹幕
- 数据柱状图