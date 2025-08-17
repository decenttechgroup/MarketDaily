const express = require('express');
const { authenticateToken } = require('./auth');
const DatabaseService = require('../services/DatabaseService');
const EmailService = require('../services/EmailService');

const router = express.Router();

// 获取所有投资组合报告列表
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, portfolio_id, date_from, date_to } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = '1=1';
    const params = [];

    // 如果指定了投资组合ID
    if (portfolio_id && portfolio_id !== 'all') {
      // 获取投资组合名称
      const portfolio = await DatabaseService.get(
        'SELECT name FROM portfolios WHERE id = ?',
        [portfolio_id]
      );
      
      if (portfolio) {
        whereClause += ' AND el.subject LIKE ?';
        params.push(`%${portfolio.name}%`);
      }
    }

    // 日期范围过滤
    if (date_from) {
      whereClause += ' AND DATE(el.sent_at) >= ?';
      params.push(date_from);
    }

    if (date_to) {
      whereClause += ' AND DATE(el.sent_at) <= ?';
      params.push(date_to);
    }

    // 获取报告列表（基于邮件发送记录）
    const reports = await DatabaseService.all(
      `SELECT 
        el.id,
        el.subject,
        el.recipient,
        el.status,
        el.sent_at,
        el.error_message,
        DATE(el.sent_at) as report_date,
        COUNT(*) as recipient_count
       FROM email_logs el
       WHERE ${whereClause} 
         AND el.status = 'sent'
         AND el.subject LIKE '%报告%'
       GROUP BY DATE(el.sent_at), el.subject
       ORDER BY el.sent_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    // 获取总数
    const totalResult = await DatabaseService.get(
      `SELECT COUNT(DISTINCT DATE(sent_at), subject) as total 
       FROM email_logs 
       WHERE ${whereClause} 
         AND status = 'sent'
         AND subject LIKE '%报告%'`,
      params
    );

    // 为每个报告获取投资组合信息
    for (const report of reports) {
      // 尝试从邮件主题中提取投资组合名称
      const portfolioMatch = report.subject.match(/「(.+?)」/);
      if (portfolioMatch) {
        report.portfolio_name = portfolioMatch[1];
        
        // 获取投资组合详细信息
        const portfolio = await DatabaseService.get(
          'SELECT id, name, is_public FROM portfolios WHERE name = ?',
          [report.portfolio_name]
        );
        
        if (portfolio) {
          report.portfolio_id = portfolio.id;
          report.is_public = portfolio.is_public;
        }
      }
    }

    res.json({
      reports,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalResult.total,
        pages: Math.ceil(totalResult.total / limit)
      }
    });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取特定日期的报告详情
router.get('/date/:date', authenticateToken, async (req, res) => {
  try {
    const { date } = req.params;
    const { portfolio_id } = req.query;

    let whereClause = 'DATE(el.sent_at) = ? AND el.status = "sent"';
    const params = [date];

    if (portfolio_id) {
      whereClause += ' AND el.subject LIKE ?';
      params.push(`%投资组合%`);
    }

    const reportDetails = await DatabaseService.all(
      `SELECT 
        el.*,
        p.name as portfolio_name,
        p.id as portfolio_id
       FROM email_logs el
       LEFT JOIN portfolios p ON el.subject LIKE '%' || p.name || '%'
       WHERE ${whereClause}
       ORDER BY el.sent_at DESC`,
      params
    );

    res.json(reportDetails);
  } catch (error) {
    console.error('Get report details error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 重新生成报告
router.post('/regenerate', authenticateToken, async (req, res) => {
  try {
    const { portfolio_id, date, emails } = req.body;

    if (!portfolio_id || !emails || !Array.isArray(emails)) {
      return res.status(400).json({ error: 'Portfolio ID and emails are required' });
    }

    // 检查投资组合权限
    const portfolio = await DatabaseService.get(
      'SELECT * FROM portfolios WHERE id = ? AND (user_id = ? OR is_public = 1)',
      [portfolio_id, req.user.id]
    );

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found or access denied' });
    }

    // 生成报告
    const reportData = await EmailService.generatePortfolioReport(portfolio_id, date);

    // 发送邮件
    let successCount = 0;
    let failCount = 0;

    for (const email of emails) {
      try {
        await EmailService.sendPortfolioEmail(email, reportData, portfolio.name);
        successCount++;
      } catch (error) {
        console.error(`Failed to send report to ${email}:`, error);
        failCount++;
      }
    }

    res.json({
      message: 'Report regeneration completed',
      success_count: successCount,
      fail_count: failCount
    });
  } catch (error) {
    console.error('Regenerate report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取报告统计
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    // 获取报告发送统计
    const stats = await DatabaseService.all(
      `SELECT 
        DATE(sent_at) as date,
        COUNT(*) as total_emails,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as successful_emails,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_emails
       FROM email_logs 
       WHERE subject LIKE '%报告%'
         AND sent_at >= DATE('now', '-30 days')
       GROUP BY DATE(sent_at)
       ORDER BY date DESC`
    );

    // 获取投资组合报告统计
    const portfolioStats = await DatabaseService.all(
      `SELECT 
        p.name as portfolio_name,
        p.id as portfolio_id,
        COUNT(el.id) as report_count,
        MAX(el.sent_at) as last_report_date
       FROM portfolios p
       LEFT JOIN email_logs el ON el.subject LIKE '%' || p.name || '%'
         AND el.status = 'sent'
         AND el.subject LIKE '%报告%'
       WHERE p.user_id = ? OR p.is_public = 1
       GROUP BY p.id, p.name
       ORDER BY report_count DESC`,
      [req.user.id]
    );

    res.json({
      daily_stats: stats,
      portfolio_stats: portfolioStats
    });
  } catch (error) {
    console.error('Get report stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
