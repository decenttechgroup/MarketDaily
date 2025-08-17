const express = require('express');
const router = express.Router();
const EmailService = require('../services/EmailService');
const DatabaseService = require('../services/DatabaseService');
const { authenticateToken } = require('./auth');
const { body, validationResult } = require('express-validator');

/**
 * 发送增强投资组合报告
 */
router.post('/enhanced-portfolio-report', 
  authenticateToken,
  [
    body('portfolioId').isInt({ min: 1 }).withMessage('有效的投资组合ID是必需的'),
    body('emails').isArray({ min: 1 }).withMessage('至少需要一个邮件地址'),
    body('emails.*').isEmail().withMessage('邮件地址格式不正确'),
    body('date').optional().isISO8601().withMessage('日期格式不正确')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          error: '请求参数错误', 
          details: errors.array() 
        });
      }

      const { portfolioId, emails, date } = req.body;
      
      // 检查投资组合权限
      const portfolio = await DatabaseService.get(
        'SELECT * FROM portfolios WHERE id = ? AND (user_id = ? OR is_public = 1)',
        [portfolioId, req.user.id]
      );

      if (!portfolio) {
        return res.status(404).json({ error: '投资组合未找到或无权限访问' });
      }

      const targetDate = date ? new Date(date) : null;
      const result = await EmailService.sendEnhancedPortfolioReport(
        portfolioId, 
        emails, 
        targetDate
      );

      // 保存报告记录到数据库
      const reportId = await DatabaseService.saveReport({
        type: 'enhanced-portfolio',
        title: `增强投资组合报告 - ${portfolio.name}`,
        portfolioId: parseInt(portfolioId),
        userId: req.user.id,
        data: result.reportData || {},
        status: result.results.some(r => r.status === 'sent') ? 'sent' : 'failed'
      });

      const successCount = result.results.filter(r => r.status === 'sent').length;
      const failedCount = result.results.filter(r => r.status === 'failed').length;

      res.json({
        message: '增强投资组合报告发送完成',
        total: emails.length,
        sent: successCount,
        failed: failedCount,
        results: result.results,
        portfolioName: portfolio.name,
        reportId
      });
    } catch (error) {
      console.error('Send enhanced portfolio report error:', error);
      res.status(500).json({ error: '发送报告失败' });
    }
  }
);

/**
 * 发送主题研究报告
 */
router.post('/topic-research-report',
  authenticateToken,
  [
    body('topic').isLength({ min: 1, max: 100 }).withMessage('主题长度必须在1-100字符之间'),
    body('emails').isArray({ min: 1 }).withMessage('至少需要一个邮件地址'),
    body('emails.*').isEmail().withMessage('邮件地址格式不正确'),
    body('days').optional().isInt({ min: 1, max: 30 }).withMessage('天数必须在1-30之间')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          error: '请求参数错误', 
          details: errors.array() 
        });
      }

      const { topic, emails, days = 14 } = req.body;
      
      const result = await EmailService.sendTopicResearchReport(emails, topic, days);

      // 保存报告记录到数据库
      const reportId = await DatabaseService.saveReport({
        type: 'topic-research',
        title: `主题研究报告 - ${topic}`,
        portfolioId: null,
        userId: req.user.id,
        data: result.reportData || {},
        topic: topic,
        days: parseInt(days),
        status: result.results.some(r => r.status === 'sent') ? 'sent' : 'failed'
      });

      const successCount = result.results.filter(r => r.status === 'sent').length;
      const failedCount = result.results.filter(r => r.status === 'failed').length;

      res.json({
        message: '主题研究报告发送完成',
        topic,
        days,
        total: emails.length,
        sent: successCount,
        failed: failedCount,
        results: result.results,
        reportId
      });
    } catch (error) {
      console.error('Send topic research report error:', error);
      res.status(500).json({ error: '发送主题报告失败' });
    }
  }
);

/**
 * 生成并预览增强投资组合报告
 */
router.get('/enhanced-portfolio-report/:portfolioId/preview',
  authenticateToken,
  async (req, res) => {
    try {
      const { portfolioId } = req.params;
      const { date } = req.query;

      // 检查投资组合权限
      const portfolio = await DatabaseService.get(
        'SELECT * FROM portfolios WHERE id = ? AND (user_id = ? OR is_public = 1)',
        [portfolioId, req.user.id]
      );

      if (!portfolio) {
        return res.status(404).json({ error: '投资组合未找到或无权限访问' });
      }

      const targetDate = date ? new Date(date) : null;
      const reportData = await EmailService.generateEnhancedPortfolioReport(portfolioId, targetDate);

      // 保存报告记录到数据库
      const reportId = await DatabaseService.saveReport({
        type: 'enhanced-portfolio',
        title: `增强投资组合报告 - ${portfolio.name}`,
        portfolioId: parseInt(portfolioId),
        userId: req.user.id,
        data: reportData,
        status: 'generated'
      });

      res.json({
        message: '增强投资组合报告生成成功',
        data: reportData,
        portfolioName: portfolio.name,
        reportId
      });
    } catch (error) {
      console.error('Generate enhanced portfolio report preview error:', error);
      res.status(500).json({ error: '生成报告失败' });
    }
  }
);

/**
 * 生成并预览主题研究报告
 */
router.get('/topic-research-report/preview',
  authenticateToken,
  [
    body('topic').isLength({ min: 1, max: 100 }).withMessage('主题长度必须在1-100字符之间'),
    body('days').optional().isInt({ min: 1, max: 30 }).withMessage('天数必须在1-30之间')
  ],
  async (req, res) => {
    try {
      const { topic, days = 14 } = req.query;

      if (!topic) {
        return res.status(400).json({ error: '主题参数是必需的' });
      }

      const reportData = await EmailService.generateTopicReport(topic, parseInt(days));

      // 保存报告记录到数据库
      const reportId = await DatabaseService.saveReport({
        type: 'topic-research',
        title: `主题研究报告 - ${topic}`,
        portfolioId: null,
        userId: req.user.id,
        data: reportData,
        topic: topic,
        days: parseInt(days),
        status: 'generated'
      });

      res.json({
        message: '主题研究报告生成成功',
        data: reportData,
        reportId
      });
    } catch (error) {
      console.error('Generate topic research report preview error:', error);
      res.status(500).json({ error: '生成主题报告失败' });
    }
  }
);

/**
 * 发送增强日报给所有订阅者
 */
router.post('/send-enhanced-daily-report',
  authenticateToken,
  async (req, res) => {
    try {
      // 检查用户权限（可能需要管理员权限）
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: '需要管理员权限' });
      }

      const results = await EmailService.sendDailyReport(true);

      res.json({
        message: '增强日报发送完成',
        ...results
      });
    } catch (error) {
      console.error('Send enhanced daily report error:', error);
      res.status(500).json({ error: '发送增强日报失败' });
    }
  }
);

/**
 * 向投资组合订阅者发送增强报告
 */
router.post('/portfolio/:portfolioId/send-enhanced-report',
  authenticateToken,
  [
    body('date').optional().isISO8601().withMessage('日期格式不正确')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          error: '请求参数错误', 
          details: errors.array() 
        });
      }

      const { portfolioId } = req.params;
      const { date } = req.body;

      // 检查投资组合权限
      const portfolio = await DatabaseService.get(
        'SELECT * FROM portfolios WHERE id = ? AND user_id = ?',
        [portfolioId, req.user.id]
      );

      if (!portfolio) {
        return res.status(404).json({ error: '投资组合未找到或无权限访问' });
      }

      const targetDate = date ? new Date(date) : null;
      const results = await EmailService.sendEnhancedReportToSubscribers(portfolioId, targetDate);

      // 保存报告记录到数据库
      const reportId = await DatabaseService.saveReport({
        type: 'enhanced-portfolio',
        title: `增强投资组合报告 - ${portfolio.name}`,
        portfolioId: parseInt(portfolioId),
        userId: req.user.id,
        data: results.reportData || {},
        status: results.sent > 0 ? 'sent' : 'failed'
      });

      res.json({
        message: '增强投资组合报告发送完成',
        portfolioId,
        portfolioName: results.portfolioName,
        reportId,
        ...results
      });
    } catch (error) {
      console.error('Send enhanced report to subscribers error:', error);
      res.status(500).json({ error: '发送增强报告失败' });
    }
  }
);

/**
 * 向通用订阅者发送主题报告
 */
router.post('/send-topic-report-to-subscribers',
  authenticateToken,
  [
    body('topic').isLength({ min: 1, max: 100 }).withMessage('主题长度必须在1-100字符之间'),
    body('days').optional().isInt({ min: 1, max: 30 }).withMessage('天数必须在1-30之间')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          error: '请求参数错误', 
          details: errors.array() 
        });
      }

      // 检查用户权限
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: '需要管理员权限' });
      }

      const { topic, days = 14 } = req.body;
      
      const results = await EmailService.sendTopicReportToSubscribers(topic, days);

      res.json({
        message: '主题报告发送完成',
        topic,
        days,
        ...results
      });
    } catch (error) {
      console.error('Send topic report to subscribers error:', error);
      res.status(500).json({ error: '发送主题报告失败' });
    }
  }
);

module.exports = router;
