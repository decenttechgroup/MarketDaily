const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cron = require('node-cron');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const configRoutes = require('./routes/config');
const portfolioRoutes = require('./routes/portfolio');
const portfoliosRoutes = require('./routes/portfolios');
const newsRoutes = require('./routes/news');
const subscriptionsRoutes = require('./routes/subscriptions');
const industriesRoutes = require('./routes/industries');
const reportsRoutes = require('./routes/reports');
const enhancedReportsRoutes = require('./routes/enhanced-reports');
const openaiLogsRoutes = require('./routes/openai-logs');

const NewsService = require('./services/NewsService');
const EmailService = require('./services/EmailService');
const DatabaseService = require('./services/DatabaseService');

const app = express();
const PORT = process.env.PORT || 3000;

// 信任代理（解决 X-Forwarded-For 头部问题）
app.set('trust proxy', true);

// 中间件
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 速率限制
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100 // 每个IP最多100次请求
});
app.use('/api/', limiter);

// 静态文件服务
app.use(express.static(path.join(__dirname, 'client/build')));

// API路由
app.use('/api/auth', authRoutes);
app.use('/api/config', configRoutes);
app.use('/api/config', industriesRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/portfolios', portfoliosRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/subscriptions', subscriptionsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/enhanced-reports', enhancedReportsRoutes);
app.use('/api/openai', openaiLogsRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// React应用路由
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/build/index.html'));
});

// 初始化数据库
DatabaseService.init()
  .then(() => {
    console.log('Database initialized successfully');
  })
  .catch(err => {
    console.error('Database initialization failed:', err);
  });

// 定时任务 - 每天早上8点发送邮件
const emailSchedule = process.env.EMAIL_SCHEDULE || '0 8 * * 1-5';
cron.schedule(emailSchedule, async () => {
  console.log('Running daily email task...');
  try {
    await EmailService.sendDailyReport();
    console.log('Daily email sent successfully');
  } catch (error) {
    console.error('Failed to send daily email:', error);
  }
});

// 每小时更新新闻
cron.schedule('0 * * * *', async () => {
  console.log('Updating news...');
  try {
    await NewsService.updateNews();
    console.log('News updated successfully');
  } catch (error) {
    console.error('Failed to update news:', error);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});
