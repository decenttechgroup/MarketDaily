const express = require('express');
const { authenticateToken } = require('./auth');
const DatabaseService = require('../services/DatabaseService');
const EmailService = require('../services/EmailService');

const router = express.Router();

// 发送测试邮件
router.post('/test', authenticateToken, async (req, res) => {
  try {
    const { email } = req.body;
    const testEmail = email || req.user.email;

    const result = await EmailService.testEmail(testEmail);
    
    if (result.success) {
      res.json({ message: 'Test email sent successfully' });
    } else {
      res.status(400).json({ error: result.message });
    }
  } catch (error) {
    console.error('Send test email error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 手动发送日报
router.post('/send-daily', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // 异步发送邮件
    EmailService.sendDailyReport()
      .then(() => {
        console.log('Manual daily report sent');
      })
      .catch(error => {
        console.error('Manual daily report failed:', error);
      });

    res.json({ message: 'Daily report sending started' });
  } catch (error) {
    console.error('Send daily report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取邮件发送记录
router.get('/logs', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { page = 1, limit = 20, status } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    const params = [];

    if (status && status !== 'all') {
      whereClause += ' AND status = ?';
      params.push(status);
    }

    const logs = await DatabaseService.all(
      `SELECT * FROM email_logs 
       WHERE ${whereClause}
       ORDER BY sent_at DESC 
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    const totalResult = await DatabaseService.get(
      `SELECT COUNT(*) as total FROM email_logs WHERE ${whereClause}`,
      params
    );

    res.json({
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalResult.total,
        pages: Math.ceil(totalResult.total / limit)
      }
    });
  } catch (error) {
    console.error('Get email logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取邮件统计
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // 总发送统计
    const totalStats = await DatabaseService.get(
      `SELECT 
         COUNT(*) as total,
         COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
         COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
         COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending
       FROM email_logs`
    );

    // 最近30天的发送统计
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentStats = await DatabaseService.all(
      `SELECT 
         DATE(sent_at) as date,
         COUNT(*) as total,
         COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
         COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
       FROM email_logs 
       WHERE sent_at > ?
       GROUP BY DATE(sent_at)
       ORDER BY date DESC`,
      [thirtyDaysAgo.toISOString()]
    );

    // 失败原因统计
    const errorStats = await DatabaseService.all(
      `SELECT 
         error_message,
         COUNT(*) as count
       FROM email_logs 
       WHERE status = 'failed' AND error_message IS NOT NULL
       GROUP BY error_message
       ORDER BY count DESC
       LIMIT 10`
    );

    res.json({
      total: totalStats,
      recent: recentStats,
      errors: errorStats
    });
  } catch (error) {
    console.error('Get email stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取邮件接收者列表
router.get('/recipients', authenticateToken, async (req, res) => {
  try {
    const config = await DatabaseService.get(
      "SELECT value FROM config WHERE key = 'email_recipients' AND (user_id = ? OR user_id IS NULL)",
      [req.user.id]
    );

    let recipients = [];
    if (config) {
      try {
        recipients = JSON.parse(config.value);
      } catch (error) {
        console.error('Error parsing recipients:', error);
      }
    }

    res.json(recipients);
  } catch (error) {
    console.error('Get email recipients error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 设置邮件接收者列表
router.post('/recipients', authenticateToken, async (req, res) => {
  try {
    const { recipients } = req.body;

    if (!Array.isArray(recipients)) {
      return res.status(400).json({ error: 'Recipients must be an array' });
    }

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = recipients.filter(email => !emailRegex.test(email));

    if (invalidEmails.length > 0) {
      return res.status(400).json({ 
        error: 'Invalid email addresses found', 
        invalidEmails 
      });
    }

    const recipientsJson = JSON.stringify(recipients);

    // 检查是否已存在
    const existing = await DatabaseService.get(
      "SELECT id FROM config WHERE key = 'email_recipients' AND user_id = ?",
      [req.user.id]
    );

    if (existing) {
      await DatabaseService.run(
        "UPDATE config SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = 'email_recipients' AND user_id = ?",
        [recipientsJson, req.user.id]
      );
    } else {
      await DatabaseService.run(
        "INSERT INTO config (key, value, user_id) VALUES ('email_recipients', ?, ?)",
        [recipientsJson, req.user.id]
      );
    }

    res.json({ message: 'Email recipients updated successfully' });
  } catch (error) {
    console.error('Set email recipients error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 添加邮件接收者
router.post('/recipients/add', authenticateToken, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email address required' });
    }

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    // 获取当前接收者列表
    const config = await DatabaseService.get(
      "SELECT value FROM config WHERE key = 'email_recipients' AND user_id = ?",
      [req.user.id]
    );

    let recipients = [];
    if (config) {
      try {
        recipients = JSON.parse(config.value);
      } catch (error) {
        console.error('Error parsing recipients:', error);
      }
    }

    // 检查是否已存在
    if (recipients.includes(email)) {
      return res.status(400).json({ error: 'Email already in recipients list' });
    }

    recipients.push(email);
    const recipientsJson = JSON.stringify(recipients);

    if (config) {
      await DatabaseService.run(
        "UPDATE config SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = 'email_recipients' AND user_id = ?",
        [recipientsJson, req.user.id]
      );
    } else {
      await DatabaseService.run(
        "INSERT INTO config (key, value, user_id) VALUES ('email_recipients', ?, ?)",
        [recipientsJson, req.user.id]
      );
    }

    res.json({ message: 'Email recipient added successfully', recipients });
  } catch (error) {
    console.error('Add email recipient error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 删除邮件接收者
router.delete('/recipients/:email', authenticateToken, async (req, res) => {
  try {
    const { email } = req.params;

    // 获取当前接收者列表
    const config = await DatabaseService.get(
      "SELECT value FROM config WHERE key = 'email_recipients' AND user_id = ?",
      [req.user.id]
    );

    if (!config) {
      return res.status(404).json({ error: 'No recipients configured' });
    }

    let recipients = [];
    try {
      recipients = JSON.parse(config.value);
    } catch (error) {
      return res.status(500).json({ error: 'Error parsing recipients list' });
    }

    const originalLength = recipients.length;
    recipients = recipients.filter(recipient => recipient !== email);

    if (recipients.length === originalLength) {
      return res.status(404).json({ error: 'Email not found in recipients list' });
    }

    const recipientsJson = JSON.stringify(recipients);

    await DatabaseService.run(
      "UPDATE config SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = 'email_recipients' AND user_id = ?",
      [recipientsJson, req.user.id]
    );

    res.json({ message: 'Email recipient removed successfully', recipients });
  } catch (error) {
    console.error('Remove email recipient error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 清理邮件日志
router.delete('/logs/cleanup', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { days = 30 } = req.body;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await DatabaseService.run(
      'DELETE FROM email_logs WHERE sent_at < ?',
      [cutoffDate.toISOString()]
    );

    res.json({ 
      message: `Deleted ${result.changes} old email logs`,
      deletedCount: result.changes
    });
  } catch (error) {
    console.error('Cleanup email logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 发送投资组合报告给订阅者
router.post('/send-portfolio-reports', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { portfolio_ids, date } = req.body;
    
    if (!Array.isArray(portfolio_ids) || portfolio_ids.length === 0) {
      return res.status(400).json({ error: 'Portfolio IDs array is required' });
    }

    const results = [];
    const EmailService = require('../services/EmailService');
    const emailService = new EmailService();

    for (const portfolioId of portfolio_ids) {
      try {
        // 获取投资组合信息
        const portfolio = await DatabaseService.get(
          'SELECT * FROM portfolios WHERE id = ?',
          [portfolioId]
        );

        if (!portfolio) {
          results.push({ 
            portfolio_id: portfolioId, 
            status: 'failed', 
            error: 'Portfolio not found' 
          });
          continue;
        }

        // 获取该投资组合的订阅者
        const subscribers = await DatabaseService.all(
          'SELECT email FROM email_subscriptions WHERE portfolio_id = ? AND is_active = 1',
          [portfolioId]
        );

        if (subscribers.length === 0) {
          results.push({ 
            portfolio_id: portfolioId, 
            portfolio_name: portfolio.name,
            status: 'skipped', 
            message: 'No active subscribers' 
          });
          continue;
        }

        // 生成报告
        const reportData = await emailService.generatePortfolioReport(portfolioId, date);
        
        // 发送给每个订阅者
        const emailResults = [];
        for (const subscriber of subscribers) {
          try {
            await emailService.sendPortfolioEmail(subscriber.email, reportData, portfolio.name);
            emailResults.push({ email: subscriber.email, status: 'sent' });
          } catch (error) {
            emailResults.push({ 
              email: subscriber.email, 
              status: 'failed', 
              error: error.message 
            });
          }
        }

        results.push({
          portfolio_id: portfolioId,
          portfolio_name: portfolio.name,
          status: 'completed',
          total_subscribers: subscribers.length,
          successful_sends: emailResults.filter(r => r.status === 'sent').length,
          failed_sends: emailResults.filter(r => r.status === 'failed').length,
          email_results: emailResults
        });

      } catch (error) {
        results.push({
          portfolio_id: portfolioId,
          status: 'failed',
          error: error.message
        });
      }
    }

    res.json({
      message: 'Portfolio reports sending completed',
      results
    });

  } catch (error) {
    console.error('Send portfolio reports error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 测试邮件配置
router.post('/test-config', authenticateToken, async (req, res) => {
  try {
    const EmailService = require('../services/EmailService');
    const emailService = new EmailService();

    if (!emailService.transporter) {
      return res.status(400).json({ 
        error: 'Email configuration not found',
        configured: false
      });
    }

    // 验证配置
    const isValid = await new Promise((resolve) => {
      emailService.transporter.verify((error, success) => {
        resolve(!error && success);
      });
    });

    res.json({
      configured: true,
      valid: isValid,
      message: isValid ? 'Email configuration is valid' : 'Email configuration validation failed'
    });

  } catch (error) {
    console.error('Test email config error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
