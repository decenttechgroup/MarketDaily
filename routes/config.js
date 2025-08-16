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

module.exports = router;
