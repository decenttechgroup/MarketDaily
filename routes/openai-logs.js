const express = require('express');
const { authenticateToken } = require('./auth');
const OpenAILogger = require('../utils/OpenAILogger');

const router = express.Router();

// 获取OpenAI日志列表
router.get('/logs', authenticateToken, async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const maxEntries = Math.min(parseInt(limit), 200); // 限制最大条数

    const logData = OpenAILogger.getStructuredLogs(maxEntries);
    
    res.json({
      success: true,
      data: logData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get OpenAI logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取OpenAI使用统计分析
router.get('/analysis', authenticateToken, async (req, res) => {
  try {
    const analysis = OpenAILogger.analyzeLogPatterns();
    
    if (!analysis) {
      return res.status(500).json({ error: 'Failed to analyze logs' });
    }

    res.json({
      success: true,
      data: analysis,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get OpenAI analysis error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取最近的日志（用于实时监控）
router.get('/recent', authenticateToken, async (req, res) => {
  try {
    const recentLogs = OpenAILogger.getRecentLogs(10);
    
    res.json({
      success: true,
      data: recentLogs,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get recent OpenAI logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 清理旧日志
router.post('/cleanup', authenticateToken, async (req, res) => {
  try {
    const { days = 7 } = req.body;
    
    OpenAILogger.clearOldLogs(parseInt(days));
    
    res.json({
      success: true,
      message: `Cleared logs older than ${days} days`
    });
  } catch (error) {
    console.error('OpenAI logs cleanup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取日志文件的原始内容（用于调试）
router.get('/raw', authenticateToken, async (req, res) => {
  try {
    const { lines = 100 } = req.query;
    const rawLogs = OpenAILogger.getRecentLogs(parseInt(lines));
    
    res.set('Content-Type', 'text/plain');
    res.send(rawLogs);
  } catch (error) {
    console.error('Get raw OpenAI logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
