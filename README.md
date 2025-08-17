# 市场日报 - Market Daily

一个专业的投资信息聚合平台，提供自动化的市场新闻推送服务。

## 功能特点

### 🚀 核心功能
- **智能新闻聚合**: 自动从多个财经媒体获取最新新闻
- **投资组合追踪**: 管理关注的股票，获取相关新闻推送
- **行业监控**: 配置关注行业，接收行业动态
- **邮件推送**: 每日自动发送市场日报邮件
- **情感分析**: AI驱动的新闻情感分析
- **管理界面**: 现代化的Web管理后台

### 🎯 技术特色
- **全自动化**: 新闻获取、分析、推送全流程自动化
- **AI增强**: 使用大语言模型进行新闻摘要和情感分析
- **响应式设计**: 支持桌面和移动设备
- **数据可视化**: 直观的统计图表和趋势分析
- **多源聚合**: 支持多个新闻源的内容整合

## 快速开始

### 系统要求
- Node.js 16+
- SQLite 3
- 邮箱服务器（可选）
- OpenAI API Key（可选，用于AI功能）

### 安装步骤

1. **克隆项目**
   ```bash
   git clone <repository-url>
   cd MarketDaily
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **配置环境变量**
   ```bash
   cp .env.example .env
   # 编辑 .env 文件，配置必要的参数
   ```

4. **启动服务**
   ```bash
   npm start
   ```

5. **访问应用**
   打开浏览器访问 `http://localhost:3000`

### 默认账户
- 邮箱: `admin@example.com`
- 密码: `admin123`

## 配置说明

### 环境变量配置

| 变量名 | 说明 | 必需 | 默认值 |
|--------|------|------|--------|
| `PORT` | 服务端口 | 否 | 3000 |
| `JWT_SECRET` | JWT密钥 | 是 | - |
| `EMAIL_HOST` | SMTP服务器 | 否 | - |
| `EMAIL_PORT` | SMTP端口 | 否 | 587 |
| `EMAIL_USER` | 邮箱账号 | 否 | - |
| `EMAIL_PASS` | 邮箱密码 | 否 | - |
| `OPENAI_API_KEY` | OpenAI密钥 | 否 | - |
| `OPENAI_MODEL` | OpenAI模型 | 否 | gpt-3.5-turbo |

### 邮件配置

支持常见的邮件服务商：

**Gmail 配置示例:**
```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

**163邮箱配置示例:**
```env
EMAIL_HOST=smtp.163.com
EMAIL_PORT=587
EMAIL_USER=your-email@163.com
EMAIL_PASS=your-password
```

### AI功能配置

配置 OpenAI API 以启用：
- 新闻智能摘要
- 市场情感分析
- 内容分类

```env
OPENAI_API_KEY=sk-your-api-key
OPENAI_MODEL=gpt-3.5-turbo
```

## 使用指南

### 1. 投资组合管理
- 添加关注的股票代码和公司名称
- 支持批量导入/导出CSV文件
- 按行业分类管理

### 2. 行业监控
- 配置关注的行业类别
- 设置行业相关关键词
- 自动筛选行业相关新闻

### 3. 邮件订阅
- 支持综合日报和投资组合专项订阅
- 批量邮件订阅管理
- 灵活的订阅状态控制
- 邮件发送日志监控

### 4. 新闻管理
- 实时新闻聚合
- 智能分类和标签
- 高级搜索和筛选
- 情感分析可视化

## API 接口

### 认证相关
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/register` - 用户注册
- `GET /api/auth/verify` - 验证Token

### 投资组合
- `GET /api/portfolio` - 获取投资组合
- `POST /api/portfolio` - 添加股票
- `PUT /api/portfolio/:id` - 更新股票
- `DELETE /api/portfolio/:id` - 删除股票

### 新闻管理
- `GET /api/news` - 获取新闻列表
- `GET /api/news/stats/sentiment` - 获取情感统计
- `POST /api/news/search` - 搜索新闻

### 订阅管理
- `GET /api/subscriptions` - 获取订阅列表
- `POST /api/subscriptions` - 添加订阅
- `POST /api/subscriptions/batch` - 批量添加订阅
- `POST /api/subscriptions/unsubscribe` - 取消订阅
- `GET /api/subscriptions/email/stats` - 获取邮件统计
- `GET /api/subscriptions/email/logs` - 获取邮件日志
- `POST /api/subscriptions/email/send-daily` - 发送日报

## 部署指南

### Docker 部署
```bash
# 构建镜像
docker build -t market-daily .

# 运行容器
docker run -d \
  --name market-daily \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -e NODE_ENV=production \
  market-daily
```

### PM2 部署
```bash
# 安装 PM2
npm install -g pm2

# 启动应用
pm2 start server.js --name market-daily

# 保存配置
pm2 save
pm2 startup
```

### Nginx 反向代理
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 故障排除

### 常见问题

**1. 邮件发送失败**
- 检查SMTP配置是否正确
- 确认邮箱密码或应用密码
- 检查网络连接

**2. 新闻获取失败**
- 检查网络连接
- 确认新闻源是否可访问
- 查看服务器日志

**3. AI功能不工作**
- 检查OpenAI API密钥
- 确认API配额是否充足
- 检查网络连接

### 日志查看
```bash
# 查看应用日志
npm run logs

# 查看错误日志
tail -f logs/error.log
```

## 开发指南

### 项目结构
```
MarketDaily/
├── server.js              # 服务器入口
├── services/              # 业务服务
│   ├── DatabaseService.js # 数据库服务
│   ├── NewsService.js     # 新闻服务
│   └── EmailService.js    # 邮件服务
├── routes/                # API路由
├── client/                # 前端应用
│   ├── src/
│   │   ├── components/    # React组件
│   │   ├── contexts/      # React上下文
│   │   └── App.js         # 主应用
└── data/                  # 数据文件
```

### 开发模式
```bash
# 后端开发
npm run dev

# 前端开发
cd client && npm start
```

### 贡献指南
1. Fork 项目
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 创建 Pull Request

## 许可证

MIT License

## 支持

如果您在使用过程中遇到问题，请：
1. 查看文档和FAQ
2. 搜索现有的Issues
3. 创建新的Issue描述问题

---

**市场日报** - 让投资信息触手可及 📊
