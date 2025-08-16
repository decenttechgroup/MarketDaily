const express = require('express');
const { authenticateToken } = require('./auth');
const DatabaseService = require('../services/DatabaseService');

const router = express.Router();

// 获取投资组合
router.get('/', authenticateToken, async (req, res) => {
  try {
    const portfolio = await DatabaseService.all(
      'SELECT * FROM portfolio WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );

    res.json(portfolio);
  } catch (error) {
    console.error('Get portfolio error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 添加股票到投资组合
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { symbol, name, sector } = req.body;

    if (!symbol || !name) {
      return res.status(400).json({ error: 'Symbol and name required' });
    }

    // 检查是否已存在
    const existing = await DatabaseService.get(
      'SELECT id FROM portfolio WHERE symbol = ? AND user_id = ?',
      [symbol.toUpperCase(), req.user.id]
    );

    if (existing) {
      return res.status(400).json({ error: 'Stock already in portfolio' });
    }

    const result = await DatabaseService.run(
      'INSERT INTO portfolio (symbol, name, sector, user_id) VALUES (?, ?, ?, ?)',
      [symbol.toUpperCase(), name, sector || null, req.user.id]
    );

    const newStock = await DatabaseService.get(
      'SELECT * FROM portfolio WHERE id = ?',
      [result.id]
    );

    res.status(201).json(newStock);
  } catch (error) {
    console.error('Add portfolio error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 更新投资组合中的股票
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, sector } = req.body;

    // 检查股票是否属于当前用户
    const stock = await DatabaseService.get(
      'SELECT * FROM portfolio WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    if (!stock) {
      return res.status(404).json({ error: 'Stock not found' });
    }

    await DatabaseService.run(
      'UPDATE portfolio SET name = ?, sector = ? WHERE id = ? AND user_id = ?',
      [name || stock.name, sector || stock.sector, id, req.user.id]
    );

    const updatedStock = await DatabaseService.get(
      'SELECT * FROM portfolio WHERE id = ?',
      [id]
    );

    res.json(updatedStock);
  } catch (error) {
    console.error('Update portfolio error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 从投资组合删除股票
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await DatabaseService.run(
      'DELETE FROM portfolio WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Stock not found' });
    }

    res.json({ message: 'Stock removed from portfolio' });
  } catch (error) {
    console.error('Delete portfolio error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 批量添加股票
router.post('/batch', authenticateToken, async (req, res) => {
  try {
    const { stocks } = req.body;

    if (!Array.isArray(stocks)) {
      return res.status(400).json({ error: 'Stocks must be an array' });
    }

    const addedStocks = [];
    const errors = [];

    for (const stock of stocks) {
      try {
        const { symbol, name, sector } = stock;

        if (!symbol || !name) {
          errors.push({ stock, error: 'Symbol and name required' });
          continue;
        }

        // 检查是否已存在
        const existing = await DatabaseService.get(
          'SELECT id FROM portfolio WHERE symbol = ? AND user_id = ?',
          [symbol.toUpperCase(), req.user.id]
        );

        if (existing) {
          errors.push({ stock, error: 'Stock already in portfolio' });
          continue;
        }

        const result = await DatabaseService.run(
          'INSERT INTO portfolio (symbol, name, sector, user_id) VALUES (?, ?, ?, ?)',
          [symbol.toUpperCase(), name, sector || null, req.user.id]
        );

        const newStock = await DatabaseService.get(
          'SELECT * FROM portfolio WHERE id = ?',
          [result.id]
        );

        addedStocks.push(newStock);
      } catch (error) {
        errors.push({ stock, error: error.message });
      }
    }

    res.json({
      added: addedStocks,
      errors: errors
    });
  } catch (error) {
    console.error('Batch add portfolio error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取投资组合相关新闻
router.get('/news', authenticateToken, async (req, res) => {
  try {
    const portfolio = await DatabaseService.all(
      'SELECT symbol FROM portfolio WHERE user_id = ?',
      [req.user.id]
    );

    if (portfolio.length === 0) {
      return res.json([]);
    }

    const symbols = portfolio.map(stock => stock.symbol);
    
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
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const totalStocks = await DatabaseService.get(
      'SELECT COUNT(*) as count FROM portfolio WHERE user_id = ?',
      [req.user.id]
    );

    const sectorStats = await DatabaseService.all(
      `SELECT sector, COUNT(*) as count 
       FROM portfolio 
       WHERE user_id = ? AND sector IS NOT NULL 
       GROUP BY sector`,
      [req.user.id]
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

module.exports = router;
