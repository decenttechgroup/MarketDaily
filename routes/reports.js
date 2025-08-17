const express = require('express');
const { authenticateToken } = require('./auth');
const DatabaseService = require('../services/DatabaseService');
const EmailService = require('../services/EmailService');

const router = express.Router();

// 获取所有投资组合报告列表
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, portfolio_id, date_from, date_to, type } = req.query;
    
    // 使用新的报告表获取报告列表
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      portfolioId: portfolio_id,
      type,
      dateFrom: date_from,
      dateTo: date_to
    };

    const result = await DatabaseService.getUserReports(req.user.id, options);

    // 为每个报告添加额外信息
    for (const report of result.reports) {
      // 检查是否已发送过邮件
      const emailSent = await DatabaseService.get(
        `SELECT COUNT(*) as count FROM email_logs 
         WHERE subject LIKE ? AND status = 'sent'`,
        [`%${report.title}%`]
      );
      
      report.email_sent = emailSent.count > 0;
      
      // 解析报告数据以获取摘要信息
      try {
        if (report.report_data) {
          const reportData = JSON.parse(report.report_data);
          report.summary = {
            totalNews: reportData.totalNews || 0,
            marketSentiment: reportData.marketSentiment || 0,
            stockCount: reportData.portfolio ? reportData.portfolio.length : 0,
            portfolioNewsCount: reportData.portfolioNews ? reportData.portfolioNews.length : 0,
            type: reportData.type || report.type
          };
        } else {
          report.summary = {
            totalNews: 0,
            marketSentiment: 0,
            stockCount: 0,
            portfolioNewsCount: 0,
            type: report.type
          };
        }
      } catch (error) {
        console.warn(`Failed to parse report data for report ${report.id}:`, error);
        report.summary = {
          totalNews: 0,
          marketSentiment: 0,
          stockCount: 0,
          portfolioNewsCount: 0,
          type: report.type
        };
      }
    }

    res.json({
      reports: result.reports,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        pages: result.pages
      }
    });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取特定报告详情
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // 获取报告详情
    const report = await DatabaseService.get(
      `SELECT r.*, p.name as portfolio_name
       FROM reports r
       LEFT JOIN portfolios p ON r.portfolio_id = p.id
       WHERE r.id = ? AND r.user_id = ?`,
      [id, req.user.id]
    );

    if (!report) {
      return res.status(404).json({ error: '报告未找到' });
    }

    // 解析报告数据
    try {
      report.report_data = JSON.parse(report.report_data);
    } catch (error) {
      console.error('Error parsing report data:', error);
      report.report_data = {};
    }

    // 检查是否已发送过邮件
    const emailLogs = await DatabaseService.all(
      `SELECT * FROM email_logs 
       WHERE subject LIKE ? 
       ORDER BY sent_at DESC`,
      [`%${report.title}%`]
    );

    report.email_logs = emailLogs;

    res.json(report);
  } catch (error) {
    console.error('Get report error:', error);
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

    // 保存报告到数据库
    const reportId = await DatabaseService.saveReport({
      type: 'portfolio',
      title: `投资组合报告 - ${portfolio.name}`,
      portfolioId: parseInt(portfolio_id),
      userId: req.user.id,
      data: reportData,
      status: 'generated'
    });

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

    // 更新报告状态
    const finalStatus = successCount > 0 ? 'sent' : 'failed';
    await DatabaseService.run(
      'UPDATE reports SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [finalStatus, reportId]
    );

    res.json({
      message: 'Report regeneration completed',
      success_count: successCount,
      fail_count: failCount,
      report_id: reportId
    });
  } catch (error) {
    console.error('Regenerate report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 生成报告（不发送邮件）
router.post('/generate', authenticateToken, async (req, res) => {
  try {
    const { portfolio_id, date, type = 'portfolio' } = req.body;

    if (!portfolio_id) {
      return res.status(400).json({ error: 'Portfolio ID is required' });
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
    let reportData;
    let reportTitle;
    
    if (type === 'enhanced-portfolio') {
      const ReportService = require('../services/ReportService');
      reportData = await ReportService.generateEnhancedPortfolioReport(portfolio_id, date);
      reportTitle = `增强投资组合报告 - ${portfolio.name}`;
    } else {
      reportData = await EmailService.generatePortfolioReport(portfolio_id, date);
      reportTitle = `投资组合报告 - ${portfolio.name}`;
    }

    // 保存报告到数据库
    const reportId = await DatabaseService.saveReport({
      type,
      title: reportTitle,
      portfolioId: parseInt(portfolio_id),
      userId: req.user.id,
      data: reportData,
      status: 'generated'
    });

    res.json({
      message: 'Report generated successfully',
      report_id: reportId,
      portfolio_name: portfolio.name,
      type,
      data: reportData
    });
  } catch (error) {
    console.error('Generate report error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
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

// 测试生成报告（用于调试）
router.post('/test-generate', authenticateToken, async (req, res) => {
  try {
    const { portfolio_id, type = 'portfolio' } = req.body;

    if (!portfolio_id) {
      return res.status(400).json({ error: 'Portfolio ID is required' });
    }

    // 检查投资组合权限
    const portfolio = await DatabaseService.get(
      'SELECT * FROM portfolios WHERE id = ? AND (user_id = ? OR is_public = 1)',
      [portfolio_id, req.user.id]
    );

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found or access denied' });
    }

    console.log(`Testing report generation for portfolio ${portfolio_id}, type: ${type}`);

    // 生成测试报告
    let reportData;
    let reportTitle;
    
    try {
      if (type === 'enhanced-portfolio') {
        const ReportService = require('../services/ReportService');
        reportData = await ReportService.generateEnhancedPortfolioReport(portfolio_id);
        reportTitle = `测试增强投资组合报告 - ${portfolio.name}`;
      } else {
        reportData = await EmailService.generatePortfolioReport(portfolio_id);
        reportTitle = `测试投资组合报告 - ${portfolio.name}`;
      }
      
      console.log('Report data generated successfully:', {
        hasData: !!reportData,
        dataKeys: Object.keys(reportData || {})
      });

      // 保存报告到数据库
      const reportId = await DatabaseService.saveReport({
        type: `test-${type}`,
        title: reportTitle,
        portfolioId: parseInt(portfolio_id),
        userId: req.user.id,
        data: reportData,
        status: 'generated'
      });

      console.log(`Report saved with ID: ${reportId}`);

      res.json({
        message: 'Test report generated and saved successfully',
        report_id: reportId,
        portfolio_name: portfolio.name,
        type,
        has_data: !!reportData,
        data_preview: reportData ? {
          date: reportData.date,
          totalNews: reportData.totalNews,
          portfolioNews: reportData.portfolioNews?.length,
          type: reportData.type
        } : null
      });
    } catch (genError) {
      console.error('Report generation error:', genError);
      res.status(500).json({ 
        error: 'Failed to generate report',
        details: genError.message
      });
    }
  } catch (error) {
    console.error('Test generate report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
