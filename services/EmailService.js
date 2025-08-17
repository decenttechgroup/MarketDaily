const nodemailer = require('nodemailer');
const { format } = require('date-fns');
const DatabaseService = require('./DatabaseService');
const NewsService = require('./NewsService');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initTransporter();
  }

  initTransporter() {
    if (!process.env.EMAIL_HOST) {
      console.warn('Email configuration not found, email service disabled');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    // 验证配置
    this.transporter.verify((error, success) => {
      if (error) {
        console.error('Email configuration error:', error);
      } else {
        console.log('Email service ready');
      }
    });
  }

  async sendDailyReport() {
    try {
      // 获取所有活跃的邮件订阅
      const subscriptions = await DatabaseService.all(
        `SELECT s.*, p.name as portfolio_name, p.id as portfolio_id
         FROM email_subscriptions s
         LEFT JOIN portfolios p ON s.portfolio_id = p.id
         WHERE s.is_active = 1`
      );

      // 按投资组合分组订阅者
      const portfolioSubscriptions = {};
      const generalSubscriptions = [];

      subscriptions.forEach(sub => {
        if (sub.portfolio_id) {
          if (!portfolioSubscriptions[sub.portfolio_id]) {
            portfolioSubscriptions[sub.portfolio_id] = {
              portfolio_name: sub.portfolio_name,
              emails: []
            };
          }
          portfolioSubscriptions[sub.portfolio_id].emails.push(sub.email);
        } else {
          generalSubscriptions.push(sub.email);
        }
      });

      // 为每个投资组合生成报告
      for (const [portfolioId, data] of Object.entries(portfolioSubscriptions)) {
        const reportData = await this.generatePortfolioReport(portfolioId);
        
        for (const email of data.emails) {
          await this.sendPortfolioEmail(email, reportData, data.portfolio_name);
        }
      }

      // 为通用订阅者生成综合报告
      if (generalSubscriptions.length > 0) {
        const reportData = await this.generateGeneralReport();
        
        for (const email of generalSubscriptions) {
          await this.sendEmail(email, reportData);
        }
      }
      
      console.log(`Daily report sent to ${subscriptions.length} subscribers`);
    } catch (error) {
      console.error('Error sending daily report:', error);
      throw error;
    }
  }

  async generateDailyReport() {
    try {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      // 获取最新新闻
      const recentNews = await NewsService.getRecentNews(10);
      
      // 按分类组织新闻
      const newsByCategory = {};
      recentNews.forEach(news => {
        const category = news.category || 'general';
        if (!newsByCategory[category]) {
          newsByCategory[category] = [];
        }
        newsByCategory[category].push(news);
      });

      // 获取投资组合相关新闻
      const portfolio = await DatabaseService.all('SELECT * FROM portfolio');
      const portfolioNews = recentNews.filter(news => {
        const symbols = JSON.parse(news.symbols || '[]');
        return symbols.length > 0;
      });

      // 计算市场情绪
      const sentiments = recentNews.map(news => news.sentiment || 0);
      const avgSentiment = sentiments.length > 0 
        ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length 
        : 0;

      return {
        date: format(today, 'yyyy-MM-dd'),
        formattedDate: format(today, 'yyyy年MM月dd日'),
        totalNews: recentNews.length,
        portfolioNews,
        newsByCategory,
        marketSentiment: avgSentiment,
        portfolio
      };
    } catch (error) {
      console.error('Error generating daily report:', error);
      throw error;
    }
  }

  async sendEmail(recipient, reportData) {
    if (!this.transporter) {
      throw new Error('Email transporter not configured');
    }

    try {
      const subject = `市场日报 - ${reportData.formattedDate}`;
      const htmlContent = this.generateEmailHTML(reportData);
      const textContent = this.generateEmailText(reportData);

      const mailOptions = {
        from: process.env.EMAIL_FROM,
        to: recipient,
        subject: subject,
        text: textContent,
        html: htmlContent
      };

      const result = await this.transporter.sendMail(mailOptions);

      // 记录发送日志
      await DatabaseService.run(
        'INSERT INTO email_logs (recipient, subject, status) VALUES (?, ?, ?)',
        [recipient, subject, 'sent']
      );

      return result;
    } catch (error) {
      // 记录错误日志
      await DatabaseService.run(
        'INSERT INTO email_logs (recipient, subject, status, error_message) VALUES (?, ?, ?, ?)',
        [recipient, `市场日报 - ${reportData.formattedDate}`, 'failed', error.message]
      );
      
      throw error;
    }
  }

  generateEmailHTML(data) {
    const sentimentEmoji = data.marketSentiment > 0.1 ? '📈' : 
                          data.marketSentiment < -0.1 ? '📉' : '➡️';
    
    const sentimentText = data.marketSentiment > 0.1 ? '乐观' : 
                         data.marketSentiment < -0.1 ? '谨慎' : '中性';

    let html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { background: #2c3e50; color: white; padding: 20px; text-align: center; }
        .section { margin: 20px 0; padding: 15px; border-left: 4px solid #3498db; }
        .news-item { margin: 15px 0; padding: 10px; background: #f8f9fa; border-radius: 5px; }
        .sentiment { padding: 10px; background: #e8f5e8; border-radius: 5px; margin: 10px 0; }
        .footer { margin-top: 30px; padding: 15px; text-align: center; font-size: 12px; color: #666; }
        .portfolio-stock { display: inline-block; margin: 5px; padding: 5px 10px; background: #3498db; color: white; border-radius: 3px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 市场日报</h1>
            <p>${data.formattedDate}</p>
        </div>

        <div class="sentiment">
            <h3>${sentimentEmoji} 市场情绪：${sentimentText}</h3>
            <p>基于今日新闻分析，市场整体情绪偏向${sentimentText}（评分：${data.marketSentiment.toFixed(2)}）</p>
        </div>

        <div class="section">
            <h2>📈 投资组合相关动态</h2>`;

    if (data.portfolioNews.length > 0) {
        data.portfolioNews.forEach(news => {
            const symbols = JSON.parse(news.symbols || '[]');
            html += `
            <div class="news-item">
                <h4>${news.title}</h4>
                <p>${news.summary || '暂无摘要'}</p>
                <p><strong>相关股票：</strong> ${symbols.join(', ')}</p>
                <p><small>来源：${news.source} | <a href="${news.url}">阅读原文</a></small></p>
            </div>`;
        });
    } else {
        html += '<p>今日暂无投资组合相关新闻</p>';
    }

    html += '</div>';

    // 按分类显示新闻
    Object.entries(data.newsByCategory).forEach(([category, news]) => {
        if (news.length > 0) {
            const categoryName = {
                'earnings': '📊 财报动态',
                'market': '📈 市场行情',
                'policy': '🏛️ 政策法规',
                'economy': '🌍 宏观经济',
                'general': '📰 综合资讯'
            }[category] || `📰 ${category}`;

            html += `
        <div class="section">
            <h2>${categoryName}</h2>`;
            
            news.slice(0, 3).forEach(item => {
                html += `
            <div class="news-item">
                <h4>${item.title}</h4>
                <p>${item.summary || '暂无摘要'}</p>
                <p><small>来源：${item.source} | <a href="${item.url}">阅读原文</a></small></p>
            </div>`;
            });
            
            html += '</div>';
        }
    });

    // 显示投资组合
    if (data.portfolio.length > 0) {
        html += `
        <div class="section">
            <h2>💼 当前投资组合</h2>
            <div>`;
        
        data.portfolio.forEach(stock => {
            html += `<span class="portfolio-stock">${stock.symbol} - ${stock.name}</span>`;
        });
        
        html += `
            </div>
        </div>`;
    }

    html += `
        <div class="footer">
            <p>本邮件由市场日报系统自动生成 | ${data.date}</p>
            <p>数据来源：多家财经媒体 | 分析由AI辅助完成</p>
        </div>
    </div>
</body>
</html>`;

    return html;
  }

  generateEmailText(data) {
    const sentimentText = data.marketSentiment > 0.1 ? '乐观' : 
                         data.marketSentiment < -0.1 ? '谨慎' : '中性';

    let text = `市场日报 - ${data.formattedDate}\n\n`;
    text += `市场情绪：${sentimentText} (${data.marketSentiment.toFixed(2)})\n\n`;

    if (data.portfolioNews.length > 0) {
        text += '投资组合相关动态：\n';
        data.portfolioNews.forEach(news => {
            const symbols = JSON.parse(news.symbols || '[]');
            text += `- ${news.title}\n`;
            text += `  相关股票：${symbols.join(', ')}\n`;
            text += `  ${news.summary || '暂无摘要'}\n`;
            text += `  来源：${news.source}\n\n`;
        });
    }

    Object.entries(data.newsByCategory).forEach(([category, news]) => {
        if (news.length > 0) {
            text += `${category.toUpperCase()}：\n`;
            news.slice(0, 3).forEach(item => {
                text += `- ${item.title}\n`;
                text += `  ${item.summary || '暂无摘要'}\n`;
                text += `  来源：${item.source}\n\n`;
            });
        }
    });

    if (data.portfolio.length > 0) {
        text += '当前投资组合：\n';
        data.portfolio.forEach(stock => {
            text += `- ${stock.symbol}: ${stock.name}\n`;
        });
    }

    text += '\n---\n本邮件由市场日报系统自动生成';
    return text;
  }



  async generatePortfolioReport(portfolioId, targetDate = null) {
    try {
      const reportDate = targetDate ? new Date(targetDate) : new Date();

      // 获取投资组合信息
      const portfolio = await DatabaseService.get(
        'SELECT * FROM portfolios WHERE id = ?',
        [portfolioId]
      );

      if (!portfolio) {
        throw new Error('Portfolio not found');
      }

      // 获取投资组合中的股票
      const portfolioStocks = await DatabaseService.all(
        'SELECT * FROM portfolio_stocks WHERE portfolio_id = ?',
        [portfolioId]
      );

      if (portfolioStocks.length === 0) {
        return this.generateEmptyPortfolioReport(portfolio, reportDate);
      }

      const symbols = portfolioStocks.map(stock => stock.symbol);

      // 获取指定日期的新闻
      let recentNews;
      if (targetDate) {
        // 获取指定日期的新闻
        const startDate = new Date(reportDate);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(reportDate);
        endDate.setHours(23, 59, 59, 999);
        
        recentNews = await DatabaseService.all(
          `SELECT * FROM news 
           WHERE created_at >= ? AND created_at <= ?
           ORDER BY created_at DESC`,
          [startDate.toISOString(), endDate.toISOString()]
        );
      } else {
        // 获取最新新闻
        recentNews = await NewsService.getRecentNews(20);
      }
      
      // 过滤投资组合相关新闻
      const portfolioNews = recentNews.filter(news => {
        const newsSymbols = JSON.parse(news.symbols || '[]');
        return newsSymbols.some(symbol => symbols.includes(symbol));
      });

      // 按分类组织新闻
      const newsByCategory = {};
      portfolioNews.forEach(news => {
        const category = news.category || 'general';
        if (!newsByCategory[category]) {
          newsByCategory[category] = [];
        }
        newsByCategory[category].push(news);
      });

      // 计算市场情绪
      const sentiments = portfolioNews.map(news => news.sentiment || 0);
      const avgSentiment = sentiments.length > 0 
        ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length 
        : 0;

      // 获取投资组合性能指标
      const performanceMetrics = await this.calculatePortfolioMetrics(portfolioId, reportDate);

      return {
        date: format(reportDate, 'yyyy-MM-dd'),
        formattedDate: format(reportDate, 'yyyy年MM月dd日'),
        portfolio: {
          id: portfolio.id,
          name: portfolio.name,
          description: portfolio.description,
          stocks: portfolioStocks,
          stockCount: portfolioStocks.length
        },
        totalNews: portfolioNews.length,
        portfolioNews,
        newsByCategory,
        marketSentiment: avgSentiment,
        metrics: performanceMetrics
      };
    } catch (error) {
      console.error('Error generating portfolio report:', error);
      throw error;
    }
  }

  async calculatePortfolioMetrics(portfolioId, date) {
    try {
      // 计算投资组合的基本指标
      const oneWeekAgo = new Date(date);
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const oneMonthAgo = new Date(date);
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

      // 获取相关新闻数量变化
      const weeklyNewsCount = await DatabaseService.get(
        `SELECT COUNT(*) as count FROM news n
         WHERE n.created_at >= ? AND n.created_at <= ?
         AND EXISTS (
           SELECT 1 FROM portfolio_stocks ps 
           WHERE ps.portfolio_id = ? 
           AND JSON_EXTRACT(n.symbols, '$') LIKE '%' || ps.symbol || '%'
         )`,
        [oneWeekAgo.toISOString(), date.toISOString(), portfolioId]
      );

      const monthlyNewsCount = await DatabaseService.get(
        `SELECT COUNT(*) as count FROM news n
         WHERE n.created_at >= ? AND n.created_at <= ?
         AND EXISTS (
           SELECT 1 FROM portfolio_stocks ps 
           WHERE ps.portfolio_id = ? 
           AND JSON_EXTRACT(n.symbols, '$') LIKE '%' || ps.symbol || '%'
         )`,
        [oneMonthAgo.toISOString(), date.toISOString(), portfolioId]
      );

      // 计算情绪趋势
      const weeklyAvgSentiment = await DatabaseService.get(
        `SELECT AVG(n.sentiment) as avg_sentiment FROM news n
         WHERE n.created_at >= ? AND n.created_at <= ?
         AND n.sentiment IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM portfolio_stocks ps 
           WHERE ps.portfolio_id = ? 
           AND JSON_EXTRACT(n.symbols, '$') LIKE '%' || ps.symbol || '%'
         )`,
        [oneWeekAgo.toISOString(), date.toISOString(), portfolioId]
      );

      return {
        weeklyNewsCount: weeklyNewsCount.count || 0,
        monthlyNewsCount: monthlyNewsCount.count || 0,
        avgSentiment: weeklyAvgSentiment.avg_sentiment || 0,
        reportDate: format(date, 'yyyy-MM-dd')
      };
    } catch (error) {
      console.error('Error calculating portfolio metrics:', error);
      return {
        weeklyNewsCount: 0,
        monthlyNewsCount: 0,
        avgSentiment: 0,
        reportDate: format(date, 'yyyy-MM-dd')
      };
    }
  }

  async generateGeneralReport() {
    try {
      const today = new Date();

      // 获取最新新闻
      const recentNews = await NewsService.getRecentNews(10);
      
      // 按分类组织新闻
      const newsByCategory = {};
      recentNews.forEach(news => {
        const category = news.category || 'general';
        if (!newsByCategory[category]) {
          newsByCategory[category] = [];
        }
        newsByCategory[category].push(news);
      });

      // 获取所有公开投资组合
      const publicPortfolios = await DatabaseService.all(
        `SELECT p.*, 
         (SELECT COUNT(*) FROM portfolio_stocks WHERE portfolio_id = p.id) as stock_count
         FROM portfolios p 
         WHERE p.is_public = 1 
         ORDER BY p.created_at DESC 
         LIMIT 5`
      );

      // 计算市场情绪
      const sentiments = recentNews.map(news => news.sentiment || 0);
      const avgSentiment = sentiments.length > 0 
        ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length 
        : 0;

      return {
        date: format(today, 'yyyy-MM-dd'),
        formattedDate: format(today, 'yyyy年MM月dd日'),
        totalNews: recentNews.length,
        portfolioNews: [],
        newsByCategory,
        marketSentiment: avgSentiment,
        portfolio: publicPortfolios,
        isGeneral: true
      };
    } catch (error) {
      console.error('Error generating general report:', error);
      throw error;
    }
  }

  generateEmptyPortfolioReport(portfolio, today) {
    return {
      date: format(today, 'yyyy-MM-dd'),
      formattedDate: format(today, 'yyyy年MM月dd日'),
      portfolio: {
        name: portfolio.name,
        description: portfolio.description,
        stocks: []
      },
      totalNews: 0,
      portfolioNews: [],
      newsByCategory: {},
      marketSentiment: 0,
      isEmpty: true
    };
  }

  async sendPortfolioEmail(recipient, reportData, portfolioName) {
    if (!this.transporter) {
      throw new Error('Email transporter not configured');
    }

    try {
      const subject = `${portfolioName} 投资组合日报 - ${reportData.formattedDate}`;
      const htmlContent = this.generatePortfolioEmailHTML(reportData);
      const textContent = this.generatePortfolioEmailText(reportData);

      const mailOptions = {
        from: process.env.EMAIL_FROM,
        to: recipient,
        subject: subject,
        text: textContent,
        html: htmlContent
      };

      const result = await this.transporter.sendMail(mailOptions);

      // 记录发送日志
      await DatabaseService.run(
        'INSERT INTO email_logs (recipient, subject, status) VALUES (?, ?, ?)',
        [recipient, subject, 'sent']
      );

      return result;
    } catch (error) {
      // 记录错误日志
      await DatabaseService.run(
        'INSERT INTO email_logs (recipient, subject, status, error_message) VALUES (?, ?, ?, ?)',
        [recipient, `市场日报 - ${reportData.formattedDate}`, 'failed', error.message]
      );
      
      throw error;
    }
  }

  generatePortfolioEmailHTML(data) {
    const sentimentColor = data.marketSentiment > 0.1 ? '#52c41a' : 
                          data.marketSentiment < -0.1 ? '#ff4d4f' : '#faad14';
    const sentimentEmoji = data.marketSentiment > 0.1 ? '📈' : 
                          data.marketSentiment < -0.1 ? '📉' : '➡️';
    const sentimentText = data.marketSentiment > 0.1 ? '乐观' : 
                         data.marketSentiment < -0.1 ? '谨慎' : '中性';

    let html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${data.portfolio.name} 投资组合日报</title>
    <style>
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            background-color: #f5f5f5;
            margin: 0;
            padding: 20px;
        }
        .container { 
            max-width: 800px; 
            margin: 0 auto; 
            background: white; 
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header { 
            background: linear-gradient(135deg, #1890ff, #722ed1); 
            color: white; 
            padding: 30px; 
            text-align: center; 
        }
        .header h1 { 
            margin: 0; 
            font-size: 28px; 
            font-weight: 300;
        }
        .header .date { 
            margin-top: 8px; 
            opacity: 0.9; 
            font-size: 16px;
        }
        .content { 
            padding: 30px; 
        }
        .portfolio-info {
            background: #f8f9fa;
            border-radius: 6px;
            padding: 20px;
            margin-bottom: 25px;
            border-left: 4px solid #1890ff;
        }
        .portfolio-title {
            font-size: 20px;
            font-weight: 600;
            color: #1890ff;
            margin-bottom: 10px;
        }
        .metrics-grid {
            display: flex;
            gap: 20px;
            margin: 20px 0;
            flex-wrap: wrap;
        }
        .metric-card {
            flex: 1;
            min-width: 150px;
            background: white;
            border: 1px solid #e8e8e8;
            border-radius: 6px;
            padding: 15px;
            text-align: center;
        }
        .metric-value {
            font-size: 24px;
            font-weight: 600;
            color: #1890ff;
        }
        .metric-label {
            font-size: 12px;
            color: #666;
            margin-top: 5px;
        }
        .sentiment { 
            display: inline-block;
            padding: 6px 12px; 
            border-radius: 20px; 
            background: ${sentimentColor}; 
            color: white; 
            font-weight: 500;
            font-size: 14px;
        }
        .section { 
            margin: 25px 0; 
        }
        .section-title { 
            font-size: 18px; 
            font-weight: 600; 
            color: #2c3e50; 
            margin-bottom: 15px; 
            padding-bottom: 8px;
            border-bottom: 2px solid #e8e8e8;
        }
        .stock-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }
        .stock-card {
            background: #f8f9fa;
            border: 1px solid #e8e8e8;
            border-radius: 6px;
            padding: 15px;
        }
        .stock-symbol {
            font-weight: 600;
            color: #1890ff;
            font-size: 16px;
        }
        .stock-name {
            color: #666;
            font-size: 14px;
            margin-top: 5px;
        }
        .stock-sector {
            background: #e6f7ff;
            color: #1890ff;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
            display: inline-block;
            margin-top: 8px;
        }
        .news-item { 
            border-left: 3px solid #1890ff; 
            padding: 15px; 
            margin: 15px 0; 
            background: #fafafa; 
            border-radius: 0 6px 6px 0;
        }
        .news-title { 
            font-weight: 600; 
            margin-bottom: 8px; 
        }
        .news-title a {
            color: #1890ff;
            text-decoration: none;
        }
        .news-title a:hover {
            text-decoration: underline;
        }
        .news-meta { 
            font-size: 12px; 
            color: #666; 
            margin-bottom: 8px; 
        }
        .news-summary { 
            line-height: 1.5; 
            color: #555;
        }
        .news-symbols {
            margin-top: 10px;
        }
        .symbol-tag {
            background: #f6ffed;
            color: #52c41a;
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 11px;
            margin-right: 5px;
            border: 1px solid #b7eb8f;
        }
        .category-section {
            margin: 20px 0;
        }
        .category-title {
            background: #e6f7ff;
            color: #1890ff;
            padding: 8px 15px;
            border-radius: 4px;
            font-weight: 600;
            margin-bottom: 10px;
            font-size: 14px;
        }
        .footer { 
            background: #f8f9fa; 
            padding: 20px; 
            text-align: center; 
            color: #666; 
            font-size: 12px;
            border-top: 1px solid #e8e8e8;
        }
        .empty-state {
            text-align: center;
            padding: 40px;
            color: #999;
        }
        .empty-state-icon {
            font-size: 48px;
            margin-bottom: 15px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${sentimentEmoji} ${data.portfolio.name} 投资组合日报</h1>
            <div class="date">${data.formattedDate}</div>
        </div>
        
        <div class="content">`;

    if (data.isEmpty) {
        html += `
            <div class="empty-state">
                <div class="empty-state-icon">📊</div>
                <h3>投资组合为空</h3>
                <p>您的投资组合中还没有添加任何股票。<br>请登录系统添加您感兴趣的股票。</p>
            </div>`;
    } else {
        // Portfolio info
        html += `
            <div class="portfolio-info">
                <div class="portfolio-title">${data.portfolio.name}</div>
                ${data.portfolio.description ? `<p>${data.portfolio.description}</p>` : ''}
                
                <div class="metrics-grid">
                    <div class="metric-card">
                        <div class="metric-value">${data.portfolio.stockCount || data.portfolio.stocks?.length || 0}</div>
                        <div class="metric-label">股票数量</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value">${data.totalNews}</div>
                        <div class="metric-label">相关新闻</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value">
                            <span class="sentiment">${sentimentText}</span>
                        </div>
                        <div class="metric-label">市场情绪</div>
                    </div>`;
                    
        if (data.metrics) {
            html += `
                    <div class="metric-card">
                        <div class="metric-value">${data.metrics.weeklyNewsCount}</div>
                        <div class="metric-label">周新闻数</div>
                    </div>`;
        }
        
        html += `
                </div>
            </div>`;

        // Portfolio stocks
        if (data.portfolio.stocks && data.portfolio.stocks.length > 0) {
            html += `
            <div class="section">
                <div class="section-title">📈 投资组合股票</div>
                <div class="stock-grid">`;
            
            data.portfolio.stocks.forEach(stock => {
                html += `
                    <div class="stock-card">
                        <div class="stock-symbol">${stock.symbol}</div>
                        <div class="stock-name">${stock.name}</div>
                        ${stock.sector ? `<div class="stock-sector">${stock.sector}</div>` : ''}
                    </div>`;
            });
            
            html += `
                </div>
            </div>`;
        }

        // Portfolio related news
        if (data.portfolioNews.length > 0) {
            html += `
            <div class="section">
                <div class="section-title">📰 投资组合相关动态</div>`;
            
            data.portfolioNews.slice(0, 5).forEach(news => {
                const symbols = JSON.parse(news.symbols || '[]');
                html += `
                <div class="news-item">
                    <div class="news-title">
                        <a href="${news.url}" target="_blank">${news.title}</a>
                    </div>
                    <div class="news-meta">
                        ${news.source} • ${new Date(news.created_at).toLocaleString('zh-CN')}
                    </div>
                    ${news.summary ? `<div class="news-summary">${news.summary}</div>` : ''}
                    ${symbols.length > 0 ? `
                    <div class="news-symbols">
                        ${symbols.map(symbol => `<span class="symbol-tag">${symbol}</span>`).join('')}
                    </div>` : ''}
                </div>`;
            });
            
            html += `
            </div>`;
        }

        // News by category
        Object.entries(data.newsByCategory).forEach(([category, news]) => {
            if (news.length > 0 && category !== 'general') {
                const categoryName = {
                    'earnings': '📊 财报动态',
                    'market': '📈 市场行情',
                    'policy': '🏛️ 政策法规',
                    'economy': '🌍 宏观经济',
                    'technology': '💻 科技资讯',
                    'finance': '💰 金融动态',
                    'general': '📰 综合资讯'
                }[category] || `📰 ${category.toUpperCase()}`;
                
                html += `
            <div class="category-section">
                <div class="category-title">${categoryName}</div>`;
                
                news.slice(0, 3).forEach(item => {
                    html += `
                <div class="news-item">
                    <div class="news-title">
                        <a href="${item.url}" target="_blank">${item.title}</a>
                    </div>
                    <div class="news-meta">
                        ${item.source} • ${new Date(item.created_at).toLocaleString('zh-CN')}
                    </div>
                    ${item.summary ? `<div class="news-summary">${item.summary}</div>` : ''}
                </div>`;
                });
                
                html += `
            </div>`;
            }
        });
    }

    html += `
        </div>
        
        <div class="footer">
            <p>📧 此邮件由 Market Daily 系统自动生成 • ${data.formattedDate}</p>
            <p>💡 投资组合：${data.portfolio.name} | 数据来源：多家财经媒体 | 分析由AI辅助完成</p>
            <p>如需退订或管理订阅，请联系系统管理员</p>
        </div>
    </div>
</body>
</html>`;

    return html;
  }

  generatePortfolioEmailText(data) {
    const sentimentText = data.marketSentiment > 0.1 ? '乐观' : 
                         data.marketSentiment < -0.1 ? '谨慎' : '中性';

    let text = `${data.portfolio.name} 投资组合日报 - ${data.formattedDate}\n\n`;
    
    if (data.isEmpty) {
        text += '投资组合为空\n';
        text += '您的投资组合中还没有添加任何股票。请登录系统添加您感兴趣的股票。\n\n';
    } else {
        text += `市场情绪：${sentimentText} (${data.marketSentiment.toFixed(2)})\n\n`;

        if (data.portfolioNews.length > 0) {
            text += '投资组合相关动态：\n';
            data.portfolioNews.forEach(news => {
                const symbols = JSON.parse(news.symbols || '[]');
                text += `- ${news.title}\n`;
                text += `  相关股票：${symbols.join(', ')}\n`;
                text += `  ${news.summary || '暂无摘要'}\n`;
                text += `  来源：${news.source}\n\n`;
            });
        }

        Object.entries(data.newsByCategory).forEach(([category, news]) => {
            if (news.length > 0) {
                text += `${category.toUpperCase()}：\n`;
                news.slice(0, 3).forEach(item => {
                    text += `- ${item.title}\n`;
                    text += `  ${item.summary || '暂无摘要'}\n`;
                    text += `  来源：${item.source}\n\n`;
                });
            }
        });

        if (data.portfolio.stocks && data.portfolio.stocks.length > 0) {
            text += '当前投资组合：\n';
            data.portfolio.stocks.forEach(stock => {
                text += `- ${stock.symbol}: ${stock.name}\n`;
            });
        }
    }

    text += '\n---\n本邮件由市场日报系统自动生成';
    text += `\n投资组合：${data.portfolio.name}`;
    return text;
  }

  // ...existing code...
}

module.exports = new EmailService();
