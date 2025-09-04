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
// 只信任第一层代理，更安全的配置
// 选项说明:
// - false: 不信任任何代理 (最安全，但可能无法获取真实IP)
// - true: 信任所有代理 (不安全，可被绕过)
// - 1: 只信任第一层代理 (推荐，适合大多数部署场景)
// - 'loopback': 只信任回环地址
// - ['127.0.0.1', '::1']: 只信任特定IP列表
app.set('trust proxy', 1);

// 中间件
const isStrictSecurity = process.env.ENABLE_STRICT_SECURE_HEADERS === 'true';

// 开发 / 仅HTTP / 用IP访问：关闭HSTS + 去掉 upgrade-insecure-requests + 放宽COOP
if (!isStrictSecurity) {
  app.use(helmet({
    hsts: false,
    // 仅在需要时开启 CSP；这里显式设置且去掉 upgrade-insecure-requests
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        // 不要自动把 http 子资源升级为 https
        upgradeInsecureRequests: null,
        // 其余按需收紧（示例保持默认，或像你之前那样 'self'）
        // 可以加入你需要的 img-src、style-src 等细化策略
      }
    },
    // 避免在非“可信来源”（HTTP/IP）下触发 COOP 警告
    crossOriginOpenerPolicy: { policy: 'unsafe-none' },
    // 其他 helmet 子中间件保持默认
  }));
} else {
  // 生产 + HTTPS + 有证书：打开严格安全头
  app.use(helmet({
    hsts: { maxAge: 15552000, includeSubDomains: true, preload: false },
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        // 在 HTTPS 场景下才加自动升级
        upgradeInsecureRequests: [],
      }
    },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
  }));
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 速率限制
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 1000, // 每个IP最多100次请求
  standardHeaders: true, // 在 `RateLimit-*` 头部返回速率限制信息
  legacyHeaders: false, // 禁用 `X-RateLimit-*` 头部
  // 确保在代理环境下正确识别IP
  keyGenerator: (req) => {
    return req.ip;
  }
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
