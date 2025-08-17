const nodemailer = require('nodemailer');
const { format } = require('date-fns');
const DatabaseService = require('./DatabaseService');
const ReportService = require('./ReportService');

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

  async sendDailyReport(useEnhanced = false) {
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
        try {
          // 根据配置选择使用增强报告还是基础报告
          const reportData = useEnhanced 
            ? await ReportService.generateEnhancedPortfolioReport(portfolioId)
            : await ReportService.generatePortfolioReport(portfolioId);
          
          // 保存报告到数据库
          const reportType = useEnhanced ? 'enhanced-portfolio' : 'portfolio';
          const reportTitle = useEnhanced 
            ? `增强投资组合报告 - ${data.portfolio_name}`
            : `投资组合报告 - ${data.portfolio_name}`;
            
          const reportId = await DatabaseService.saveReport({
            type: reportType,
            title: reportTitle,
            portfolioId: parseInt(portfolioId),
            userId: null, // 系统生成的报告
            data: reportData,
            status: 'generated'
          });
          
          let successCount = 0;
          for (const email of data.emails) {
            try {
              await this.sendPortfolioEmail(email, reportData, data.portfolio_name);
              successCount++;
            } catch (emailError) {
              console.error(`Failed to send report to ${email}:`, emailError);
            }
          }
          
          // 更新报告状态
          const finalStatus = successCount > 0 ? 'sent' : 'failed';
          await DatabaseService.run(
            'UPDATE reports SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [finalStatus, reportId]
          );
          
        } catch (error) {
          console.error(`Error generating portfolio report for ${portfolioId}:`, error);
          // 发送错误通知给管理员
          await this.sendErrorNotification(portfolioId, data.portfolio_name, error);
        }
      }

      // 为通用订阅者生成综合报告
      if (generalSubscriptions.length > 0) {
        try {
          const reportData = await ReportService.generateGeneralReport();
          
          // 保存通用报告到数据库
          const reportId = await DatabaseService.saveReport({
            type: 'general',
            title: '综合市场报告',
            portfolioId: null,
            userId: null, // 系统生成的报告
            data: reportData,
            status: 'generated'
          });
          
          let successCount = 0;
          for (const email of generalSubscriptions) {
            try {
              await this.sendEmail(email, reportData);
              successCount++;
            } catch (emailError) {
              console.error(`Failed to send general report to ${email}:`, emailError);
            }
          }
          
          // 更新报告状态
          const finalStatus = successCount > 0 ? 'sent' : 'failed';
          await DatabaseService.run(
            'UPDATE reports SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [finalStatus, reportId]
          );
          
        } catch (error) {
          console.error('Error generating general report:', error);
          // 发送错误通知给管理员
          await this.sendErrorNotification('general', '综合报告', error);
        }
      }
      
      console.log(`Daily report sent to ${subscriptions.length} subscribers`);
      return {
        total: subscriptions.length,
        portfolioSubscriptions: Object.keys(portfolioSubscriptions).length,
        generalSubscriptions: generalSubscriptions.length
      };
    } catch (error) {
      console.error('Error sending daily report:', error);
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
        .ai-analysis { padding: 15px; background: #f0f8ff; border-radius: 5px; margin: 15px 0; border-left: 4px solid #1890ff; }
        .key-points { margin: 10px 0; }
        .key-points li { margin: 5px 0; }
        .trending-topics { display: flex; flex-wrap: wrap; gap: 10px; margin: 10px 0; }
        .topic-tag { background: #e6f7ff; color: #1890ff; padding: 5px 10px; border-radius: 15px; font-size: 12px; }
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
        </div>`;

    // AI分析部分
    if (data.aiAnalysis && !data.isGeneral) {
        html += `
        <div class="ai-analysis">
            <h3>🤖 AI市场分析</h3>
            <p><strong>市场概况：</strong>${data.aiAnalysis.summary}</p>
            ${data.aiAnalysis.keyPoints && data.aiAnalysis.keyPoints.length > 0 ? `
            <div class="key-points">
                <strong>关键要点：</strong>
                <ul>
                    ${data.aiAnalysis.keyPoints.map(point => `<li>${point}</li>`).join('')}
                </ul>
            </div>` : ''}
            <p><strong>市场展望：</strong>${data.aiAnalysis.outlook}</p>
        </div>`;
    }

    // 市场概览（通用报告）
    if (data.marketOverview && data.isGeneral) {
        html += `
        <div class="ai-analysis">
            <h3>📈 市场概览</h3>
            <p>${data.marketOverview}</p>
        </div>`;
    }

    // 热门话题（通用报告）
    if (data.trendingTopics && data.trendingTopics.length > 0 && data.isGeneral) {
        html += `
        <div class="section">
            <h3>🔥 热门话题</h3>
            <div class="trending-topics">
                ${data.trendingTopics.map(topic => 
                    `<span class="topic-tag">${topic.keyword} (${topic.count})</span>`
                ).join('')}
            </div>
        </div>`;
    }

    html += `
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
    if (data.portfolio && data.portfolio.length > 0) {
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

    // AI分析
    if (data.aiAnalysis && !data.isGeneral) {
        text += `AI市场分析：\n`;
        text += `市场概况：${data.aiAnalysis.summary}\n`;
        if (data.aiAnalysis.keyPoints && data.aiAnalysis.keyPoints.length > 0) {
            text += `关键要点：\n`;
            data.aiAnalysis.keyPoints.forEach(point => {
                text += `- ${point}\n`;
            });
        }
        text += `市场展望：${data.aiAnalysis.outlook}\n\n`;
    }

    // 市场概览（通用报告）
    if (data.marketOverview && data.isGeneral) {
        text += `市场概览：${data.marketOverview}\n\n`;
    }

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

    if (data.portfolio && data.portfolio.length > 0) {
        text += '当前投资组合：\n';
        data.portfolio.forEach(stock => {
            text += `- ${stock.symbol}: ${stock.name}\n`;
        });
    }

    text += '\n---\n本邮件由市场日报系统自动生成';
    return text;
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
        [recipient, `投资组合日报 - ${reportData.formattedDate}`, 'failed', error.message]
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
        .ai-recommendations {
            background: #fff7e6;
            border-radius: 6px;
            padding: 20px;
            margin: 20px 0;
            border-left: 4px solid #faad14;
        }
        .risk-analysis {
            background: #f6ffed;
            border-radius: 6px;
            padding: 20px;
            margin: 20px 0;
            border-left: 4px solid #52c41a;
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
        }
        .news-item { 
            border-left: 3px solid #1890ff; 
            padding: 15px; 
            margin: 15px 0; 
            background: #fafafa; 
            border-radius: 0 6px 6px 0;
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
        // Portfolio info with metrics
        html += `
            <div class="portfolio-info">
                <div class="portfolio-title">${data.portfolio.name}</div>
                ${data.portfolio.description ? `<p>${data.portfolio.description}</p>` : ''}
                
                <div class="metrics-grid">
                    <div class="metric-card">
                        <div class="metric-value">${data.portfolio.stockCount || 0}</div>
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
                    </div>
                </div>
            </div>`;

        // AI推荐
        if (data.aiRecommendations) {
            html += `
            <div class="ai-recommendations">
                <h3>🤖 AI投资建议</h3>
                <p><strong>总体建议：</strong>${data.aiRecommendations.summary}</p>
                <p><strong>风险等级：</strong>${data.aiRecommendations.riskLevel}</p>
                ${data.aiRecommendations.recommendations && data.aiRecommendations.recommendations.length > 0 ? `
                <div>
                    <strong>具体建议：</strong>
                    <ul>
                        ${data.aiRecommendations.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                    </ul>
                </div>` : ''}
            </div>`;
        }

        // 风险分析
        if (data.riskAnalysis) {
            html += `
            <div class="risk-analysis">
                <h3>⚠️ 风险分析</h3>
                <p><strong>集中度风险：</strong>${data.riskAnalysis.concentrationRisk}</p>
                <p><strong>新闻风险：</strong>${data.riskAnalysis.newsRisk}</p>
                <p><strong>情绪分布：</strong>正面 ${data.riskAnalysis.sentimentDistribution.positive} | 负面 ${data.riskAnalysis.sentimentDistribution.negative} | 中性 ${data.riskAnalysis.sentimentDistribution.neutral}</p>
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
                    ${news.summary ? `<div class="news-summary">${news.summary}</div>` : ''}
                    ${symbols.length > 0 ? `
                    <div class="news-symbols">
                        相关股票：${symbols.join(', ')}
                    </div>` : ''}
                </div>`;
            });
            
            html += `
            </div>`;
        }
    }

    html += `
        </div>
        
        <div class="footer">
            <p>📧 此邮件由 Market Daily 系统自动生成 • ${data.formattedDate}</p>
            <p>💡 投资组合：${data.portfolio.name} | 数据来源：多家财经媒体 | 分析由AI辅助完成</p>
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

        // AI推荐
        if (data.aiRecommendations) {
            text += `AI投资建议：\n`;
            text += `总体建议：${data.aiRecommendations.summary}\n`;
            text += `风险等级：${data.aiRecommendations.riskLevel}\n`;
            if (data.aiRecommendations.recommendations && data.aiRecommendations.recommendations.length > 0) {
                text += `具体建议：\n`;
                data.aiRecommendations.recommendations.forEach(rec => {
                    text += `- ${rec}\n`;
                });
            }
            text += '\n';
        }

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
    }

    text += '\n---\n本邮件由市场日报系统自动生成';
    text += `\n投资组合：${data.portfolio.name}`;
    return text;
  }

  /**
   * 发送自定义主题报告邮件
   */
  async sendTopicReport(recipients, topic, reportData) {
    if (!this.transporter) {
      throw new Error('Email transporter not configured');
    }

    try {
      const subject = `主题报告：${topic} - ${new Date().toLocaleDateString('zh-CN')}`;
      const htmlContent = this.generateTopicEmailHTML(reportData);
      const textContent = this.generateTopicEmailText(reportData);

      for (const recipient of recipients) {
        const mailOptions = {
          from: process.env.EMAIL_FROM,
          to: recipient,
          subject: subject,
          text: textContent,
          html: htmlContent
        };

        await this.transporter.sendMail(mailOptions);

        // 记录发送日志
        await DatabaseService.run(
          'INSERT INTO email_logs (recipient, subject, status) VALUES (?, ?, ?)',
          [recipient, subject, 'sent']
        );
      }

      console.log(`Topic report sent to ${recipients.length} recipients`);
    } catch (error) {
      console.error('Error sending topic report:', error);
      throw error;
    }
  }

  generateTopicEmailHTML(data) {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { background: #34495e; color: white; padding: 20px; text-align: center; }
        .topic-analysis { padding: 15px; background: #ecf0f1; border-radius: 5px; margin: 15px 0; }
        .news-item { margin: 15px 0; padding: 10px; background: #f8f9fa; border-radius: 5px; }
        .footer { margin-top: 30px; padding: 15px; text-align: center; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📈 主题报告：${data.topic}</h1>
            <p>${data.dateRange}</p>
        </div>

        <div class="topic-analysis">
            <h3>📊 主题分析</h3>
            <p><strong>相关新闻数量：</strong>${data.newsCount}</p>
            <p><strong>情绪指数：</strong>${data.sentiment?.toFixed(2) || 'N/A'}</p>
            <div><strong>分析结果：</strong>${data.analysis}</div>
        </div>

        <div class="section">
            <h2>📰 相关新闻</h2>
            ${data.news.map(news => `
            <div class="news-item">
                <h4><a href="${news.url}" target="_blank">${news.title}</a></h4>
                <p>${news.summary || '暂无摘要'}</p>
                <p><small>来源：${news.source} | ${new Date(news.created_at).toLocaleString('zh-CN')}</small></p>
            </div>
            `).join('')}
        </div>

        <div class="footer">
            <p>本邮件由市场日报系统自动生成</p>
            <p>主题：${data.topic} | 数据来源：多家财经媒体</p>
        </div>
    </div>
</body>
</html>`;
  }

  generateTopicEmailText(data) {
    let text = `主题报告：${data.topic}\n`;
    text += `时间范围：${data.dateRange}\n\n`;
    text += `相关新闻数量：${data.newsCount}\n`;
    text += `情绪指数：${data.sentiment?.toFixed(2) || 'N/A'}\n\n`;
    text += `分析结果：${data.analysis}\n\n`;
    
    if (data.news.length > 0) {
        text += '相关新闻：\n';
        data.news.forEach(news => {
            text += `- ${news.title}\n`;
            text += `  ${news.summary || '暂无摘要'}\n`;
            text += `  来源：${news.source}\n\n`;
        });
    }

    text += '\n---\n本邮件由市场日报系统自动生成';
    text += `\n主题：${data.topic}`;
    return text;
  }

  /**
   * 发送错误通知给管理员
   */
  async sendErrorNotification(portfolioId, portfolioName, error) {
    try {
      const adminEmail = process.env.ADMIN_EMAIL;
      if (!adminEmail || !this.transporter) {
        return;
      }

      const subject = `报告生成错误 - ${portfolioName}`;
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #ff4d4f;">报告生成错误</h2>
          <p><strong>投资组合ID:</strong> ${portfolioId}</p>
          <p><strong>投资组合名称:</strong> ${portfolioName}</p>
          <p><strong>错误时间:</strong> ${new Date().toLocaleString('zh-CN')}</p>
          <p><strong>错误信息:</strong></p>
          <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px;">${error.message}</pre>
          <p><strong>错误堆栈:</strong></p>
          <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px; font-size: 12px;">${error.stack}</pre>
        </div>
      `;

      await this.transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: adminEmail,
        subject: subject,
        html: htmlContent
      });

      console.log(`Error notification sent to admin for portfolio ${portfolioId}`);
    } catch (notificationError) {
      console.error('Failed to send error notification:', notificationError);
    }
  }

  /**
   * 发送主题研究报告
   */
  async sendTopicResearchReport(recipients, topic, days = 14) {
    if (!this.transporter) {
      throw new Error('Email transporter not configured');
    }

    try {
      // 使用ReportService生成主题研究报告
      const reportData = await ReportService.generateTopicResearchReport(topic, days);
      
      const subject = `主题研究报告：${topic} - ${new Date().toLocaleDateString('zh-CN')}`;
      const htmlContent = this.generateTopicResearchEmailHTML(reportData);
      const textContent = this.generateTopicResearchEmailText(reportData);

      const results = [];
      for (const recipient of recipients) {
        try {
          const mailOptions = {
            from: process.env.EMAIL_FROM,
            to: recipient,
            subject: subject,
            text: textContent,
            html: htmlContent
          };

          await this.transporter.sendMail(mailOptions);

          // 记录发送日志
          await DatabaseService.run(
            'INSERT INTO email_logs (recipient, subject, status) VALUES (?, ?, ?)',
            [recipient, subject, 'sent']
          );

          results.push({ email: recipient, status: 'sent' });
        } catch (error) {
          await DatabaseService.run(
            'INSERT INTO email_logs (recipient, subject, status, error_message) VALUES (?, ?, ?, ?)',
            [recipient, subject, 'failed', error.message]
          );
          
          results.push({ email: recipient, status: 'failed', error: error.message });
        }
      }

      console.log(`Topic research report sent to ${recipients.length} recipients`);
      
      // 返回结果和报告数据
      return {
        results,
        reportData
      };
    } catch (error) {
      console.error('Error sending topic research report:', error);
      throw error;
    }
  }

  /**
   * 发送增强的投资组合报告
   */
  async sendEnhancedPortfolioReport(portfolioId, recipients, targetDate = null) {
    if (!this.transporter) {
      throw new Error('Email transporter not configured');
    }

    try {
      // 使用ReportService生成增强报告
      const reportData = await ReportService.generateEnhancedPortfolioReport(portfolioId, targetDate);
      
      const subject = `${reportData.portfolio.name} 增强投资组合报告 - ${reportData.formattedDate}`;
      const htmlContent = this.generateEnhancedPortfolioEmailHTML(reportData);
      const textContent = this.generateEnhancedPortfolioEmailText(reportData);

      const results = [];
      for (const recipient of recipients) {
        try {
          const mailOptions = {
            from: process.env.EMAIL_FROM,
            to: recipient,
            subject: subject,
            text: textContent,
            html: htmlContent
          };

          await this.transporter.sendMail(mailOptions);

          // 记录发送日志
          await DatabaseService.run(
            'INSERT INTO email_logs (recipient, subject, status) VALUES (?, ?, ?)',
            [recipient, subject, 'sent']
          );

          results.push({ email: recipient, status: 'sent' });
        } catch (error) {
          await DatabaseService.run(
            'INSERT INTO email_logs (recipient, subject, status, error_message) VALUES (?, ?, ?, ?)',
            [recipient, subject, 'failed', error.message]
          );
          
          results.push({ email: recipient, status: 'failed', error: error.message });
        }
      }

      console.log(`Enhanced portfolio report sent to ${recipients.length} recipients`);
      
      // 返回结果和报告数据
      return {
        results,
        reportData
      };
    } catch (error) {
      console.error('Error sending enhanced portfolio report:', error);
      throw error;
    }
  }

  /**
   * 生成主题研究报告HTML邮件
   */
  generateTopicResearchEmailHTML(data) {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>主题研究报告：${data.topic}</title>
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
            max-width: 900px; 
            margin: 0 auto; 
            background: white; 
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header { 
            background: linear-gradient(135deg, #667eea, #764ba2); 
            color: white; 
            padding: 40px 30px; 
            text-align: center; 
        }
        .header h1 { 
            margin: 0; 
            font-size: 32px; 
            font-weight: 300;
        }
        .content { 
            padding: 40px 30px; 
        }
        .summary-section {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 25px;
            margin-bottom: 30px;
            border-left: 5px solid #667eea;
        }
        .analysis-section {
            background: #fff7e6;
            border-radius: 8px;
            padding: 25px;
            margin: 25px 0;
            border-left: 5px solid #faad14;
        }
        .trends-section {
            background: #e6f7ff;
            border-radius: 8px;
            padding: 25px;
            margin: 25px 0;
            border-left: 5px solid #1890ff;
        }
        .recommendations-section {
            background: #f6ffed;
            border-radius: 8px;
            padding: 25px;
            margin: 25px 0;
            border-left: 5px solid #52c41a;
        }
        .risks-section {
            background: #fff2f0;
            border-radius: 8px;
            padding: 25px;
            margin: 25px 0;
            border-left: 5px solid #ff4d4f;
        }
        .metrics-grid {
            display: flex;
            gap: 20px;
            margin: 25px 0;
            flex-wrap: wrap;
        }
        .metric-card {
            flex: 1;
            min-width: 150px;
            background: white;
            border: 1px solid #e8e8e8;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .metric-value {
            font-size: 28px;
            font-weight: 600;
            color: #667eea;
            margin-bottom: 5px;
        }
        .metric-label {
            font-size: 14px;
            color: #666;
        }
        .sentiment-indicator {
            display: inline-block;
            padding: 8px 16px;
            border-radius: 20px;
            color: white;
            font-weight: 500;
            background: ${data.sentiment > 0.1 ? '#52c41a' : data.sentiment < -0.1 ? '#ff4d4f' : '#faad14'};
        }
        .news-list {
            max-height: 400px;
            overflow-y: auto;
            margin-top: 20px;
        }
        .news-item {
            border-left: 3px solid #667eea;
            padding: 15px;
            margin: 15px 0;
            background: #fafafa;
            border-radius: 0 6px 6px 0;
        }
        .news-title {
            font-weight: 600;
            color: #2c3e50;
            margin-bottom: 8px;
        }
        .news-meta {
            font-size: 12px;
            color: #666;
            margin-top: 8px;
        }
        .trend-item, .recommendation-item, .risk-item {
            background: white;
            padding: 15px;
            margin: 10px 0;
            border-radius: 6px;
            border-left: 4px solid #667eea;
        }
        .footer { 
            background: #f8f9fa; 
            padding: 30px; 
            text-align: center; 
            color: #666; 
            font-size: 14px;
            border-top: 1px solid #e8e8e8;
        }
        .tag {
            display: inline-block;
            background: #e6f7ff;
            color: #1890ff;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 12px;
            margin: 2px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 主题研究报告</h1>
            <h2>${data.topic}</h2>
            <p>${data.dateRange}</p>
        </div>
        
        <div class="content">
            <div class="metrics-grid">
                <div class="metric-card">
                    <div class="metric-value">${data.newsCount}</div>
                    <div class="metric-label">相关新闻</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${data.localNewsCount || 0}</div>
                    <div class="metric-label">本地新闻</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${data.externalNewsCount || 0}</div>
                    <div class="metric-label">外部新闻</div>
                </div>
                <div class="metric-card">
                    <div class="sentiment-indicator">
                        ${data.sentiment > 0.1 ? '乐观' : data.sentiment < -0.1 ? '谨慎' : '中性'}
                    </div>
                    <div class="metric-label">情绪指数</div>
                </div>
            </div>

            <div class="summary-section">
                <h3>📝 研究概况</h3>
                <p>${data.summary}</p>
            </div>

            <div class="analysis-section">
                <h3>🔍 深度分析</h3>
                <p>${data.analysis}</p>
            </div>

            ${data.trends && data.trends.length > 0 ? `
            <div class="trends-section">
                <h3>📈 关键趋势</h3>
                ${data.trends.map(trend => `
                    <div class="trend-item">• ${trend}</div>
                `).join('')}
            </div>` : ''}

            ${data.recommendations && data.recommendations.length > 0 ? `
            <div class="recommendations-section">
                <h3>💡 投资建议</h3>
                ${data.recommendations.map(rec => `
                    <div class="recommendation-item">• ${rec}</div>
                `).join('')}
            </div>` : ''}

            ${data.riskFactors && data.riskFactors.length > 0 ? `
            <div class="risks-section">
                <h3>⚠️ 风险因素</h3>
                ${data.riskFactors.map(risk => `
                    <div class="risk-item">• ${risk}</div>
                `).join('')}
            </div>` : ''}

            ${data.opportunities && data.opportunities.length > 0 ? `
            <div class="recommendations-section">
                <h3>🎯 机会点</h3>
                ${data.opportunities.map(opp => `
                    <div class="recommendation-item">• ${opp}</div>
                `).join('')}
            </div>` : ''}

            <div class="analysis-section">
                <h3>📰 相关新闻 (前10条)</h3>
                <div class="news-list">
                    ${data.news.slice(0, 10).map(news => `
                    <div class="news-item">
                        <div class="news-title">
                            <a href="${news.url}" target="_blank">${news.title}</a>
                            ${news.external ? '<span class="tag">外部</span>' : '<span class="tag">内部</span>'}
                        </div>
                        <div>${news.summary || '暂无摘要'}</div>
                        <div class="news-meta">
                            来源：${news.source} | ${new Date(news.publishedAt || news.created_at).toLocaleString('zh-CN')}
                        </div>
                    </div>
                    `).join('')}
                </div>
            </div>
        </div>
        
        <div class="footer">
            <p>📧 此邮件由 Market Daily 系统自动生成 • ${new Date().toLocaleDateString('zh-CN')}</p>
            <p>💡 主题：${data.topic} | 数据来源：多家财经媒体及外部API | 分析由AI辅助完成</p>
        </div>
    </div>
</body>
</html>`;
  }

  /**
   * 生成投资组合报告 - 现在使用ReportService
   */
  async generatePortfolioReport(portfolioId, targetDate = null) {
    try {
      // 直接使用ReportService生成报告
      return await ReportService.generatePortfolioReport(portfolioId, targetDate);
    } catch (error) {
      console.error('Error generating portfolio report:', error);
      throw error;
    }
  }

  /**
   * 生成增强的投资组合报告 - 使用ReportService的增强功能
   */
  async generateEnhancedPortfolioReport(portfolioId, targetDate = null) {
    try {
      // 使用ReportService生成增强报告
      return await ReportService.generateEnhancedPortfolioReport(portfolioId, targetDate);
    } catch (error) {
      console.error('Error generating enhanced portfolio report:', error);
      // 如果增强报告失败，回退到基础报告
      return await this.generatePortfolioReport(portfolioId, targetDate);
    }
  }

  /**
   * 生成主题研究报告
   */
  async generateTopicReport(topic, days = 14) {
    try {
      return await ReportService.generateTopicResearchReport(topic, days);
    } catch (error) {
      console.error('Error generating topic report:', error);
      throw error;
    }
  }

  /**
   * 批量发送主题研究报告
   */
  async sendTopicReportToSubscribers(topic, days = 14) {
    try {
      // 获取所有活跃的通用订阅者
      const generalSubscriptions = await DatabaseService.all(
        `SELECT DISTINCT email FROM email_subscriptions 
         WHERE is_active = 1 AND portfolio_id IS NULL`
      );

      if (generalSubscriptions.length === 0) {
        console.log('No general subscribers found for topic report');
        return { sent: 0, failed: 0 };
      }

      const emails = generalSubscriptions.map(sub => sub.email);
      const results = await this.sendTopicResearchReport(emails, topic, days);
      
      const successCount = results.filter(r => r.status === 'sent').length;
      const failedCount = results.filter(r => r.status === 'failed').length;
      
      console.log(`Topic report "${topic}" sent to ${successCount}/${emails.length} subscribers`);
      return { sent: successCount, failed: failedCount, total: emails.length };
    } catch (error) {
      console.error('Error sending topic report to subscribers:', error);
      throw error;
    }
  }

  /**
   * 发送投资组合增强报告给订阅者
   */
  async sendEnhancedReportToSubscribers(portfolioId, targetDate = null) {
    try {
      // 获取该投资组合的所有活跃订阅者
      const subscriptions = await DatabaseService.all(
        `SELECT s.email, p.name as portfolio_name
         FROM email_subscriptions s
         JOIN portfolios p ON s.portfolio_id = p.id
         WHERE s.portfolio_id = ? AND s.is_active = 1`,
        [portfolioId]
      );

      if (subscriptions.length === 0) {
        console.log(`No subscribers found for portfolio ${portfolioId}`);
        return { sent: 0, failed: 0 };
      }

      const emails = subscriptions.map(sub => sub.email);
      const result = await this.sendEnhancedPortfolioReport(portfolioId, emails, targetDate);
      
      const successCount = result.results.filter(r => r.status === 'sent').length;
      const failedCount = result.results.filter(r => r.status === 'failed').length;
      
      console.log(`Enhanced portfolio report sent to ${successCount}/${emails.length} subscribers`);
      return { 
        sent: successCount, 
        failed: failedCount, 
        total: emails.length,
        portfolioName: subscriptions[0]?.portfolio_name,
        reportData: result.reportData
      };
    } catch (error) {
      console.error('Error sending enhanced report to subscribers:', error);
      throw error;
    }
  }
}

module.exports = new EmailService();
