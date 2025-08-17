const express = require('express');
const { authenticateToken } = require('./auth');
const DatabaseService = require('../services/DatabaseService');

const router = express.Router();

// 获取配置
router.get('/', authenticateToken, async (req, res) => {
  try {
    const configs = await DatabaseService.all(
      'SELECT key, value FROM config WHERE user_id = ? OR user_id IS NULL',
      [req.user.id]
    );

    const configObj = {};
    configs.forEach(config => {
      try {
        configObj[config.key] = JSON.parse(config.value);
      } catch {
        configObj[config.key] = config.value;
      }
    });

    res.json(configObj);
  } catch (error) {
    console.error('Get config error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取单个配置
router.get('/:key', authenticateToken, async (req, res) => {
  try {
    const config = await DatabaseService.get(
      'SELECT value FROM config WHERE key = ? AND (user_id = ? OR user_id IS NULL)',
      [req.params.key, req.user.id]
    );

    if (!config) {
      return res.status(404).json({ error: 'Configuration not found' });
    }

    try {
      res.json({ value: JSON.parse(config.value) });
    } catch {
      res.json({ value: config.value });
    }
  } catch (error) {
    console.error('Get config error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 设置配置
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { key, value } = req.body;

    if (!key) {
      return res.status(400).json({ error: 'Configuration key required' });
    }

    const valueStr = typeof value === 'string' ? value : JSON.stringify(value);

    // 检查是否已存在
    const existing = await DatabaseService.get(
      'SELECT id FROM config WHERE key = ? AND user_id = ?',
      [key, req.user.id]
    );

    if (existing) {
      await DatabaseService.run(
        'UPDATE config SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ? AND user_id = ?',
        [valueStr, key, req.user.id]
      );
    } else {
      await DatabaseService.run(
        'INSERT INTO config (key, value, user_id) VALUES (?, ?, ?)',
        [key, valueStr, req.user.id]
      );
    }

    res.json({ message: 'Configuration saved successfully' });
  } catch (error) {
    console.error('Set config error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 删除配置
router.delete('/:key', authenticateToken, async (req, res) => {
  try {
    const result = await DatabaseService.run(
      'DELETE FROM config WHERE key = ? AND user_id = ?',
      [req.params.key, req.user.id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Configuration not found' });
    }

    res.json({ message: 'Configuration deleted successfully' });
  } catch (error) {
    console.error('Delete config error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 获取系统配置（仅管理员）
router.get('/system/all', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const configs = await DatabaseService.all('SELECT * FROM config');
    res.json(configs);
  } catch (error) {
    console.error('Get system config error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 设置系统配置（仅管理员）
router.post('/system', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { key, value, global = false } = req.body;

    if (!key) {
      return res.status(400).json({ error: 'Configuration key required' });
    }

    const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
    const userId = global ? null : req.user.id;

    // 检查是否已存在
    const existing = await DatabaseService.get(
      'SELECT id FROM config WHERE key = ? AND user_id IS ?',
      [key, userId]
    );

    if (existing) {
      await DatabaseService.run(
        'UPDATE config SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ? AND user_id IS ?',
        [valueStr, key, userId]
      );
    } else {
      await DatabaseService.run(
        'INSERT INTO config (key, value, user_id) VALUES (?, ?, ?)',
        [key, valueStr, userId]
      );
    }

    res.json({ message: 'System configuration saved successfully' });
  } catch (error) {
    console.error('Set system config error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 批量设置配置
router.post('/batch', authenticateToken, async (req, res) => {
  try {
    const { configs } = req.body;

    if (!configs || typeof configs !== 'object') {
      return res.status(400).json({ error: 'Invalid configuration data' });
    }

    for (const [key, value] of Object.entries(configs)) {
      const valueStr = typeof value === 'string' ? value : JSON.stringify(value);

      const existing = await DatabaseService.get(
        'SELECT id FROM config WHERE key = ? AND user_id = ?',
        [key, req.user.id]
      );

      if (existing) {
        await DatabaseService.run(
          'UPDATE config SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ? AND user_id = ?',
          [valueStr, key, req.user.id]
        );
      } else {
        await DatabaseService.run(
          'INSERT INTO config (key, value, user_id) VALUES (?, ?, ?)',
          [key, valueStr, req.user.id]
        );
      }
    }

    res.json({ message: 'Configurations saved successfully' });
  } catch (error) {
    console.error('Batch set config error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 测试OpenAI API连接
router.post('/test-openai', authenticateToken, async (req, res) => {
  try {
    const { apiKey, model } = req.body;

    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }

    const { OpenAI } = require('openai');
    
    // 配置OpenAI客户端
    const config = {
      apiKey: apiKey,
      timeout: 10000 // 10秒超时
    };

    // 如果设置了代理，使用代理配置
    if (process.env.HTTP_PROXY || process.env.HTTPS_PROXY) {
      try {
        const { HttpsProxyAgent } = require('https-proxy-agent');
        const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
        config.httpAgent = new HttpsProxyAgent(proxyUrl);
        console.log(`Testing OpenAI with proxy: ${proxyUrl}`);
      } catch (error) {
        console.warn('Failed to configure proxy for test:', error.message);
      }
    }

    const openai = new OpenAI(config);
    const OpenAILogger = require('../utils/OpenAILogger');
    
    // 测试聊天完成API
    const params = {
      model: model || 'gpt-3.5-turbo',
      messages: [
        {
          role: 'user',
          content: 'Hello! Please respond with "API connection successful" to confirm the connection is working.'
        }
      ],
      max_tokens: 50,
      temperature: 0
    };

    const response = await OpenAILogger.loggedOpenAICall(
      openai, 
      'config.test-openai', 
      params, 
      { 
        service: 'config', 
        operation: 'test-openai',
        testUser: req.user.username || 'unknown'
      }
    );

    const message = response.choices[0]?.message?.content || 'No response';
    
    res.json({ 
      success: true, 
      message: 'OpenAI API connection successful',
      response: message,
      model: response.model,
      usage: response.usage
    });
  } catch (error) {
    console.error('OpenAI test error:', error);
    
    let errorMessage = 'API connection failed';
    let errorDetails = error.message;
    
    if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
      errorMessage = 'Network connection failed. Check your proxy settings if you are behind a firewall.';
    } else if (error.status === 401) {
      errorMessage = 'Invalid API key';
    } else if (error.status === 429) {
      errorMessage = 'API rate limit exceeded';
    } else if (error.status === 400) {
      errorMessage = 'Invalid request. Check if the model name is correct.';
    }
    
    res.status(400).json({ 
      success: false, 
      error: errorMessage,
      details: errorDetails
    });
  }
});

module.exports = router;
