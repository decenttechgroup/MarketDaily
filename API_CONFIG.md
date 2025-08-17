# 增强的市场日报系统 - API配置

本系统现在支持多个外部数据源，以提供更全面的市场分析。

## 支持的外部API

### 1. NewsAPI (新闻数据)
- 用途：获取全球新闻和市场动态
- 网站：https://newsapi.org/
- 环境变量：`NEWSAPI_KEY`

### 2. Finnhub (金融数据)
- 用途：获取股票新闻和市场数据
- 网站：https://finnhub.io/
- 环境变量：`FINNHUB_API_KEY`

### 3. Alpha Vantage (金融数据)
- 用途：获取股票价格和基本面数据
- 网站：https://www.alphavantage.co/
- 环境变量：`ALPHAVANTAGE_API_KEY`

## 环境变量配置

在 `.env` 文件中添加以下配置：

```env
# 基础配置
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-3.5-turbo

# 外部数据源API密钥
NEWSAPI_KEY=your_newsapi_key
FINNHUB_API_KEY=your_finnhub_key
ALPHAVANTAGE_API_KEY=your_alphavantage_key

# 邮件配置
EMAIL_HOST=your_smtp_host
EMAIL_PORT=587
EMAIL_USER=your_email_user
EMAIL_PASS=your_email_password
EMAIL_FROM=your_from_email
ADMIN_EMAIL=admin@example.com
```

## 新功能

### 1. 增强投资组合报告
- 整合内部和外部新闻数据
- AI驱动的深度分析
- 风险评估和投资建议
- 多维度市场情绪分析

### 2. 主题研究报告
- 基于关键词的深度研究
- 跨平台新闻聚合
- AI生成的趋势分析
- 投资机会识别

### 3. 智能错误处理
- 自动降级到基础报告
- 管理员错误通知
- 详细的日志记录

## 使用方法

### 发送增强投资组合报告
```javascript
const emailService = require('./services/EmailService');

// 发送增强报告给特定投资组合的订阅者
await emailService.sendEnhancedReportToSubscribers(portfolioId);

// 发送增强报告给指定邮件列表
await emailService.sendEnhancedPortfolioReport(portfolioId, ['email1@example.com', 'email2@example.com']);
```

### 发送主题研究报告
```javascript
// 发送给所有通用订阅者
await emailService.sendTopicReportToSubscribers('人工智能', 14);

// 发送给指定邮件列表
await emailService.sendTopicResearchReport(['email@example.com'], '新能源', 7);
```

### 启用增强模式的日报
```javascript
// 发送增强版日报
await emailService.sendDailyReport(true);
```

## API限制和建议

1. **NewsAPI**: 免费版每天1000次请求
2. **Finnhub**: 免费版每分钟60次请求
3. **Alpha Vantage**: 免费版每分钟5次请求

建议：
- 缓存API响应以减少请求次数
- 设置合理的请求间隔
- 监控API使用量
- 准备降级策略
