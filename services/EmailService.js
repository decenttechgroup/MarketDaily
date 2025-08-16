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

    this.transporter = nodemailer.createTransporter({
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
      const recipients = await this.getEmailRecipients();
      const reportData = await this.generateDailyReport();
      
      for (const recipient of recipients) {
        await this.sendEmail(recipient, reportData);
      }
      
      console.log(`Daily report sent to ${recipients.length} recipients`);
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

  async getEmailRecipients() {
    try {
      const config = await DatabaseService.all(
        "SELECT value FROM config WHERE key = 'email_recipients'"
      );
      
      if (config.length > 0) {
        return JSON.parse(config[0].value);
      }
      
      // 默认发送给管理员
      return [process.env.ADMIN_EMAIL || 'admin@example.com'];
    } catch (error) {
      console.error('Error getting email recipients:', error);
      return [process.env.ADMIN_EMAIL || 'admin@example.com'];
    }
  }

  async testEmail(recipient) {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not configured');
      }

      const testData = {
        date: format(new Date(), 'yyyy-MM-dd'),
        formattedDate: format(new Date(), 'yyyy年MM月dd日'),
        totalNews: 1,
        portfolioNews: [],
        newsByCategory: {
          'test': [{
            title: '这是一封测试邮件',
            summary: '系统邮件功能测试正常',
            source: '系统测试',
            url: '#'
          }]
        },
        marketSentiment: 0,
        portfolio: []
      };

      const result = await this.sendEmail(recipient, testData);
      return { success: true, message: 'Test email sent successfully' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
}

module.exports = new EmailService();
