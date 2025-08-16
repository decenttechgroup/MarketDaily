const express = require('express');
const { authenticateToken } = require('./auth');
const DatabaseService = require('../services/DatabaseService');
const NewsService = require('../services/NewsService');

const router = express.Router();

// 获取新闻列表
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      category, 
      search,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;
    let whereClause = '1=1';
    const params = [];

    if (category && category !== 'all') {
      whereClause += ' AND category = ?';
      params.push(category);
    }

    if (search) {
      whereClause += ' AND (title LIKE ? OR summary LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const validSortColumns = ['created_at', 'title', 'sentiment', 'published_at'];
    const validSortOrders = ['ASC', 'DESC'];
    
    const orderBy = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const order = validSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';

    const news = await DatabaseService.all(
      `SELECT * FROM news 
       WHERE ${whereClause}
       ORDER BY ${orderBy} ${order}
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    // 获取总数
    const totalResult = await DatabaseService.get(
      `SELECT COUNT(*) as total FROM news WHERE ${whereClause}`,
      params
    );

    res.json({
      news,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalResult.total,
        pages: Math.ceil(totalResult.total / limit)
      }
    });
  } catch (error) {
    console.error('Get news error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取单条新闻
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const news = await DatabaseService.get(
      'SELECT * FROM news WHERE id = ?',
      [req.params.id]
    );

    if (!news) {
      return res.status(404).json({ error: 'News not found' });
    }

    res.json(news);
  } catch (error) {
    console.error('Get news by id error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取新闻分类统计
router.get('/stats/categories', authenticateToken, async (req, res) => {
  try {
    const categories = await DatabaseService.all(
      `SELECT category, COUNT(*) as count 
       FROM news 
       WHERE category IS NOT NULL 
       GROUP BY category 
       ORDER BY count DESC`
    );

    res.json(categories);
  } catch (error) {
    console.error('Get news categories error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取新闻来源统计
router.get('/stats/sources', authenticateToken, async (req, res) => {
  try {
    const sources = await DatabaseService.all(
      `SELECT source, COUNT(*) as count 
       FROM news 
       WHERE source IS NOT NULL 
       GROUP BY source 
       ORDER BY count DESC`
    );

    res.json(sources);
  } catch (error) {
    console.error('Get news sources error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取情感分析统计
router.get('/stats/sentiment', authenticateToken, async (req, res) => {
  try {
    const sentimentStats = await DatabaseService.all(
      `SELECT 
         AVG(sentiment) as avgSentiment,
         COUNT(CASE WHEN sentiment > 0.1 THEN 1 END) as positive,
         COUNT(CASE WHEN sentiment BETWEEN -0.1 AND 0.1 THEN 1 END) as neutral,
         COUNT(CASE WHEN sentiment < -0.1 THEN 1 END) as negative,
         COUNT(*) as total
       FROM news 
       WHERE sentiment IS NOT NULL`
    );

    // 最近7天的情感趋势
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const dailyStats = await DatabaseService.all(
      `SELECT 
         DATE(created_at) as date,
         AVG(sentiment) as avgSentiment,
         COUNT(*) as count
       FROM news 
       WHERE created_at > ? AND sentiment IS NOT NULL
       GROUP BY DATE(created_at)
       ORDER BY date DESC`,
      [weekAgo.toISOString()]
    );

    res.json({
      overall: sentimentStats[0],
      daily: dailyStats
    });
  } catch (error) {
    console.error('Get sentiment stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 手动更新新闻
router.post('/update', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // 异步执行新闻更新
    NewsService.updateNews()
      .then(() => {
        console.log('Manual news update completed');
      })
      .catch(error => {
        console.error('Manual news update failed:', error);
      });

    res.json({ message: 'News update started' });
  } catch (error) {
    console.error('Manual update news error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 删除新闻
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await DatabaseService.run(
      'DELETE FROM news WHERE id = ?',
      [req.params.id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'News not found' });
    }

    res.json({ message: 'News deleted successfully' });
  } catch (error) {
    console.error('Delete news error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 批量删除旧新闻
router.delete('/cleanup/old', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { days = 7 } = req.body;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await DatabaseService.run(
      'DELETE FROM news WHERE created_at < ?',
      [cutoffDate.toISOString()]
    );

    res.json({ 
      message: `Deleted ${result.changes} old news items`,
      deletedCount: result.changes
    });
  } catch (error) {
    console.error('Cleanup old news error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 搜索新闻
router.post('/search', authenticateToken, async (req, res) => {
  try {
    const { 
      query, 
      categories = [], 
      sources = [],
      dateFrom,
      dateTo,
      sentimentRange = [-1, 1],
      limit = 20
    } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Search query required' });
    }

    let whereClause = '(title LIKE ? OR summary LIKE ? OR content LIKE ?)';
    const params = [`%${query}%`, `%${query}%`, `%${query}%`];

    if (categories.length > 0) {
      whereClause += ` AND category IN (${categories.map(() => '?').join(',')})`;
      params.push(...categories);
    }

    if (sources.length > 0) {
      whereClause += ` AND source IN (${sources.map(() => '?').join(',')})`;
      params.push(...sources);
    }

    if (dateFrom) {
      whereClause += ' AND created_at >= ?';
      params.push(dateFrom);
    }

    if (dateTo) {
      whereClause += ' AND created_at <= ?';
      params.push(dateTo);
    }

    if (sentimentRange[0] !== -1 || sentimentRange[1] !== 1) {
      whereClause += ' AND sentiment BETWEEN ? AND ?';
      params.push(sentimentRange[0], sentimentRange[1]);
    }

    const news = await DatabaseService.all(
      `SELECT * FROM news 
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT ?`,
      [...params, limit]
    );

    res.json(news);
  } catch (error) {
    console.error('Search news error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取行业相关新闻
router.get('/industry/:name', authenticateToken, async (req, res) => {
  try {
    const { name } = req.params;
    const { limit = 10 } = req.query;

    // 获取用户关注的行业信息
    const industry = await DatabaseService.get(
      'SELECT keywords FROM industries WHERE name = ? AND user_id = ?',
      [name, req.user.id]
    );

    if (!industry) {
      return res.status(404).json({ error: 'Industry not found' });
    }

    const keywords = industry.keywords ? industry.keywords.split(',') : [];
    keywords.push(name);

    // 构建搜索条件
    const searchConditions = keywords.map(() => 'title LIKE ? OR summary LIKE ?').join(' OR ');
    const params = keywords.flatMap(keyword => [`%${keyword.trim()}%`, `%${keyword.trim()}%`]);

    const news = await DatabaseService.all(
      `SELECT * FROM news 
       WHERE ${searchConditions}
       ORDER BY created_at DESC
       LIMIT ?`,
      [...params, parseInt(limit)]
    );

    res.json(news);
  } catch (error) {
    console.error('Get industry news error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
