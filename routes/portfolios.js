const express = require('express');
const { authenticateToken } = require('./auth');
const DatabaseService = require('../services/DatabaseService');

const router = express.Router();

// 获取用户的投资组合列表
router.get('/', authenticateToken, async (req, res) => {
  try {
    const portfolios = await DatabaseService.all(
      'SELECT * FROM portfolios WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );

    // 为每个投资组合获取股票数量
    for (const portfolio of portfolios) {
      const stockCount = await DatabaseService.get(
        'SELECT COUNT(*) as count FROM portfolio_stocks WHERE portfolio_id = ?',
        [portfolio.id]
      );
      portfolio.stock_count = stockCount.count;
    }

    res.json(portfolios);
  } catch (error) {
    console.error('Get portfolios error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 创建新的投资组合
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, description, is_public } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Portfolio name required' });
    }

    const result = await DatabaseService.run(
      'INSERT INTO portfolios (name, description, user_id, is_public) VALUES (?, ?, ?, ?)',
      [name, description || null, req.user.id, is_public ? 1 : 0]
    );

    const newPortfolio = await DatabaseService.get(
      'SELECT * FROM portfolios WHERE id = ?',
      [result.id]
    );

    res.status(201).json(newPortfolio);
  } catch (error) {
    console.error('Create portfolio error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 更新投资组合
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, is_public } = req.body;

    // 检查投资组合是否属于当前用户
    const portfolio = await DatabaseService.get(
      'SELECT * FROM portfolios WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    await DatabaseService.run(
      'UPDATE portfolios SET name = ?, description = ?, is_public = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
      [name || portfolio.name, description || portfolio.description, is_public ? 1 : 0, id, req.user.id]
    );

    const updatedPortfolio = await DatabaseService.get(
      'SELECT * FROM portfolios WHERE id = ?',
      [id]
    );

    res.json(updatedPortfolio);
  } catch (error) {
    console.error('Update portfolio error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 删除投资组合
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await DatabaseService.run(
      'DELETE FROM portfolios WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    res.json({ message: 'Portfolio deleted successfully' });
  } catch (error) {
    console.error('Delete portfolio error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取投资组合的股票
router.get('/:id/stocks', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // 检查投资组合是否属于当前用户或是公开的
    const portfolio = await DatabaseService.get(
      'SELECT * FROM portfolios WHERE id = ? AND (user_id = ? OR is_public = 1)',
      [id, req.user.id]
    );

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    const stocks = await DatabaseService.all(
      'SELECT * FROM portfolio_stocks WHERE portfolio_id = ? ORDER BY created_at DESC',
      [id]
    );

    res.json(stocks);
  } catch (error) {
    console.error('Get portfolio stocks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 添加股票到投资组合
router.post('/:id/stocks', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { symbol, name, sector } = req.body;

    if (!symbol || !name) {
      return res.status(400).json({ error: 'Symbol and name required' });
    }

    // 检查投资组合是否属于当前用户
    const portfolio = await DatabaseService.get(
      'SELECT * FROM portfolios WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    // 检查股票是否已存在
    const existing = await DatabaseService.get(
      'SELECT id FROM portfolio_stocks WHERE symbol = ? AND portfolio_id = ?',
      [symbol.toUpperCase(), id]
    );

    if (existing) {
      return res.status(400).json({ error: 'Stock already in portfolio' });
    }

    const result = await DatabaseService.run(
      'INSERT INTO portfolio_stocks (portfolio_id, symbol, name, sector) VALUES (?, ?, ?, ?)',
      [id, symbol.toUpperCase(), name, sector || null]
    );

    const newStock = await DatabaseService.get(
      'SELECT * FROM portfolio_stocks WHERE id = ?',
      [result.id]
    );

    res.status(201).json(newStock);
  } catch (error) {
    console.error('Add stock to portfolio error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 从投资组合删除股票
router.delete('/:portfolioId/stocks/:stockId', authenticateToken, async (req, res) => {
  try {
    const { portfolioId, stockId } = req.params;

    // 检查投资组合是否属于当前用户
    const portfolio = await DatabaseService.get(
      'SELECT * FROM portfolios WHERE id = ? AND user_id = ?',
      [portfolioId, req.user.id]
    );

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    const result = await DatabaseService.run(
      'DELETE FROM portfolio_stocks WHERE id = ? AND portfolio_id = ?',
      [stockId, portfolioId]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Stock not found' });
    }

    res.json({ message: 'Stock removed from portfolio' });
  } catch (error) {
    console.error('Delete stock from portfolio error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取投资组合相关新闻
router.get('/:id/news', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // 检查投资组合是否属于当前用户或是公开的
    const portfolio = await DatabaseService.get(
      'SELECT * FROM portfolios WHERE id = ? AND (user_id = ? OR is_public = 1)',
      [id, req.user.id]
    );

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    const stocks = await DatabaseService.all(
      'SELECT symbol FROM portfolio_stocks WHERE portfolio_id = ?',
      [id]
    );

    if (stocks.length === 0) {
      return res.json([]);
    }

    const symbols = stocks.map(stock => stock.symbol);
    
    // 查找包含这些股票代码的新闻
    const news = await DatabaseService.all(
      `SELECT * FROM news 
       WHERE symbols IS NOT NULL AND symbols != '[]'
       ORDER BY created_at DESC 
       LIMIT 20`
    );

    // 过滤出相关新闻
    const relevantNews = news.filter(item => {
      try {
        const newsSymbols = JSON.parse(item.symbols || '[]');
        return newsSymbols.some(symbol => symbols.includes(symbol));
      } catch {
        return false;
      }
    });

    res.json(relevantNews);
  } catch (error) {
    console.error('Get portfolio news error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取投资组合统计
router.get('/:id/stats', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // 检查投资组合是否属于当前用户或是公开的
    const portfolio = await DatabaseService.get(
      'SELECT * FROM portfolios WHERE id = ? AND (user_id = ? OR is_public = 1)',
      [id, req.user.id]
    );

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    const totalStocks = await DatabaseService.get(
      'SELECT COUNT(*) as count FROM portfolio_stocks WHERE portfolio_id = ?',
      [id]
    );

    const sectorStats = await DatabaseService.all(
      `SELECT sector, COUNT(*) as count 
       FROM portfolio_stocks 
       WHERE portfolio_id = ? AND sector IS NOT NULL 
       GROUP BY sector`,
      [id]
    );

    // 获取最近7天的相关新闻数量
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const recentNewsCount = await DatabaseService.get(
      `SELECT COUNT(*) as count FROM news 
       WHERE symbols IS NOT NULL AND symbols != '[]' 
       AND created_at > ?`,
      [weekAgo.toISOString()]
    );

    res.json({
      totalStocks: totalStocks.count,
      sectorDistribution: sectorStats,
      recentNewsCount: recentNewsCount.count
    });
  } catch (error) {
    console.error('Get portfolio stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取公开的投资组合列表
router.get('/public/list', async (req, res) => {
  try {
    const portfolios = await DatabaseService.all(
      `SELECT p.*, u.email as owner_email, 
       (SELECT COUNT(*) FROM portfolio_stocks WHERE portfolio_id = p.id) as stock_count
       FROM portfolios p 
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.is_public = 1 
       ORDER BY p.created_at DESC`
    );

    res.json(portfolios);
  } catch (error) {
    console.error('Get public portfolios error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 生成投资组合报告
router.get('/:id/report', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { date } = req.query;

    // 检查投资组合是否属于当前用户或是公开的
    const portfolio = await DatabaseService.get(
      'SELECT * FROM portfolios WHERE id = ? AND (user_id = ? OR is_public = 1)',
      [id, req.user.id]
    );

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    const EmailService = require('../services/EmailService');
    
    // 如果指定了日期，生成历史报告，否则生成当前报告
    const reportData = await EmailService.generatePortfolioReport(id, date);
    
    // 保存报告记录到数据库
    const reportId = await DatabaseService.saveReport({
      type: 'portfolio',
      title: `投资组合报告 - ${portfolio.name}`,
      portfolioId: parseInt(id),
      userId: req.user.id,
      data: reportData,
      status: 'generated'
    });
    
    res.json({
      ...reportData,
      reportId
    });
  } catch (error) {
    console.error('Generate portfolio report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 发送投资组合报告邮件
router.post('/:id/send-report', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { emails, date } = req.body;

    // 检查投资组合是否属于当前用户
    const portfolio = await DatabaseService.get(
      'SELECT * FROM portfolios WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: 'Email list is required' });
    }

    // 验证邮件格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = emails.filter(email => !emailRegex.test(email));

    if (invalidEmails.length > 0) {
      return res.status(400).json({ 
        error: 'Invalid email addresses found', 
        invalidEmails 
      });
    }

    const EmailService = require('../services/EmailService');
    
    // 生成报告
    const reportData = await EmailService.generatePortfolioReport(id, date);
    
    // 发送邮件
    const results = [];
    for (const email of emails) {
      try {
        await EmailService.sendPortfolioEmail(email, reportData, portfolio.name);
        results.push({ email, status: 'sent' });
      } catch (error) {
        results.push({ email, status: 'failed', error: error.message });
      }
    }

    res.json({ 
      message: 'Reports sent',
      results,
      portfolio: portfolio.name
    });
  } catch (error) {
    console.error('Send portfolio report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取投资组合历史报告列表
router.get('/:id/reports', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 30 } = req.query;

    // 检查投资组合是否属于当前用户或是公开的
    const portfolio = await DatabaseService.get(
      'SELECT * FROM portfolios WHERE id = ? AND (user_id = ? OR is_public = 1)',
      [id, req.user.id]
    );

    if (!portfolio) {
      return res.status(404).json({ error: 'Portfolio not found' });
    }

    // 获取最近的邮件发送记录，可以用来显示历史报告
    const reports = await DatabaseService.all(
      `SELECT DISTINCT DATE(sent_at) as report_date, COUNT(*) as email_count, 
       GROUP_CONCAT(recipient) as recipients
       FROM email_logs 
       WHERE subject LIKE '%${portfolio.name}%' 
       GROUP BY DATE(sent_at)
       ORDER BY report_date DESC 
       LIMIT ?`,
      [parseInt(limit)]
    );

    res.json(reports);
  } catch (error) {
    console.error('Get portfolio reports error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
