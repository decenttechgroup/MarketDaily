const express = require('express');
const { authenticateToken } = require('./auth');
const DatabaseService = require('../services/DatabaseService');
const EmailService = require('../services/EmailService');

const router = express.Router();

// 获取邮件订阅列表
router.get('/', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const subscriptions = await DatabaseService.all(
      `SELECT s.*, p.name as portfolio_name, p.description as portfolio_description,
       u.email as owner_email
       FROM email_subscriptions s
       LEFT JOIN portfolios p ON s.portfolio_id = p.id
       LEFT JOIN users u ON p.user_id = u.id
       WHERE s.is_active = 1
       ORDER BY s.created_at DESC`
    );

    res.json(subscriptions);
  } catch (error) {
    console.error('Get email subscriptions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 添加邮件订阅
router.post('/', async (req, res) => {
  try {
    const { email, portfolio_id } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    // 验证邮件格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // 如果指定了投资组合ID，检查是否存在且公开
    if (portfolio_id) {
      const portfolio = await DatabaseService.get(
        'SELECT * FROM portfolios WHERE id = ? AND is_public = 1',
        [portfolio_id]
      );

      if (!portfolio) {
        return res.status(404).json({ error: 'Public portfolio not found' });
      }
    }

    // 检查是否已经订阅
    const existing = await DatabaseService.get(
      'SELECT id FROM email_subscriptions WHERE email = ? AND portfolio_id = ?',
      [email, portfolio_id || null]
    );

    if (existing) {
      return res.status(400).json({ error: 'Already subscribed' });
    }

    const result = await DatabaseService.run(
      'INSERT INTO email_subscriptions (email, portfolio_id) VALUES (?, ?)',
      [email, portfolio_id || null]
    );

    const newSubscription = await DatabaseService.get(
      `SELECT s.*, p.name as portfolio_name
       FROM email_subscriptions s
       LEFT JOIN portfolios p ON s.portfolio_id = p.id
       WHERE s.id = ?`,
      [result.id]
    );

    res.status(201).json(newSubscription);
  } catch (error) {
    console.error('Add email subscription error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 更新邮件订阅状态
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    const { is_active } = req.body;

    const result = await DatabaseService.run(
      'UPDATE email_subscriptions SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [is_active ? 1 : 0, id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const updatedSubscription = await DatabaseService.get(
      `SELECT s.*, p.name as portfolio_name
       FROM email_subscriptions s
       LEFT JOIN portfolios p ON s.portfolio_id = p.id
       WHERE s.id = ?`,
      [id]
    );

    res.json(updatedSubscription);
  } catch (error) {
    console.error('Update email subscription error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 删除邮件订阅
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;

    const result = await DatabaseService.run(
      'DELETE FROM email_subscriptions WHERE id = ?',
      [id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    res.json({ message: 'Subscription deleted successfully' });
  } catch (error) {
    console.error('Delete email subscription error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 取消订阅（公开接口，通过邮件和token验证）
router.post('/unsubscribe', async (req, res) => {
  try {
    const { email, portfolio_id } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    const result = await DatabaseService.run(
      'DELETE FROM email_subscriptions WHERE email = ? AND portfolio_id = ?',
      [email, portfolio_id || null]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    res.json({ message: 'Unsubscribed successfully' });
  } catch (error) {
    console.error('Unsubscribe error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取特定投资组合的订阅者
router.get('/portfolio/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // 检查投资组合是否属于当前用户
    const portfolio = await DatabaseService.get(
      'SELECT * FROM portfolios WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    const subscriptions = await DatabaseService.all(
      'SELECT * FROM email_subscriptions WHERE portfolio_id = ? AND is_active = 1',
      [id]
    );

    res.json(subscriptions);
  } catch (error) {
    console.error('Get portfolio subscriptions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 批量添加订阅
router.post('/batch', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { emails, portfolio_id } = req.body;

    if (!emails || !Array.isArray(emails)) {
      return res.status(400).json({ error: 'Emails array required' });
    }

    const added = [];
    const errors = [];

    for (const email of emails) {
      if (!email.trim()) continue;

      try {
        // 验证邮件格式
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
          errors.push({ email, error: 'Invalid email format' });
          continue;
        }

        // 检查是否已经订阅
        const existing = await DatabaseService.get(
          'SELECT id FROM email_subscriptions WHERE email = ? AND portfolio_id = ?',
          [email.trim(), portfolio_id || null]
        );

        if (existing) {
          errors.push({ email, error: 'Already subscribed' });
          continue;
        }

        await DatabaseService.run(
          'INSERT INTO email_subscriptions (email, portfolio_id) VALUES (?, ?)',
          [email.trim(), portfolio_id || null]
        );

        added.push(email.trim());
      } catch (error) {
        errors.push({ email, error: error.message });
      }
    }

    res.json({ added, errors });
  } catch (error) {
    console.error('Batch add subscriptions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取邮件发送统计
router.get('/email/stats', authenticateToken, async (req, res) => {
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

    // 今日统计
    const today = new Date().toISOString().split('T')[0];
    const todayStats = await DatabaseService.get(
      `SELECT 
         COUNT(CASE WHEN status = 'sent' THEN 1 END) as todaySent,
         COUNT(CASE WHEN status = 'failed' THEN 1 END) as todayFailed
       FROM email_logs 
       WHERE DATE(sent_at) = ?`,
      [today]
    );

    // 本周统计
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekStats = await DatabaseService.get(
      `SELECT COUNT(CASE WHEN status = 'sent' THEN 1 END) as weekSent
       FROM email_logs 
       WHERE sent_at > ?`,
      [weekAgo.toISOString()]
    );

    // 计算成功率
    const successRate = totalStats.total > 0 
      ? Math.round((totalStats.sent / totalStats.total) * 100) 
      : 0;

    res.json({
      ...totalStats,
      ...todayStats,
      ...weekStats,
      successRate
    });
  } catch (error) {
    console.error('Get email stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取邮件发送记录
router.get('/email/logs', authenticateToken, async (req, res) => {
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

// 手动发送日报
router.post('/email/send-daily', authenticateToken, async (req, res) => {
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

module.exports = router;
