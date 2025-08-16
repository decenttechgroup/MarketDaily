const express = require('express');
const { authenticateToken } = require('./auth');
const DatabaseService = require('../services/DatabaseService');

const router = express.Router();

// 获取用户关注的行业
router.get('/industries', authenticateToken, async (req, res) => {
  try {
    const industries = await DatabaseService.all(
      'SELECT * FROM industries WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );

    res.json(industries);
  } catch (error) {
    console.error('Get industries error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 添加关注行业
router.post('/industry', authenticateToken, async (req, res) => {
  try {
    const { id, name, keywords } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Industry name required' });
    }

    if (id) {
      // 更新现有行业
      const existing = await DatabaseService.get(
        'SELECT id FROM industries WHERE id = ? AND user_id = ?',
        [id, req.user.id]
      );

      if (!existing) {
        return res.status(404).json({ error: 'Industry not found' });
      }

      await DatabaseService.run(
        'UPDATE industries SET name = ?, keywords = ? WHERE id = ? AND user_id = ?',
        [name, keywords || null, id, req.user.id]
      );

      const updatedIndustry = await DatabaseService.get(
        'SELECT * FROM industries WHERE id = ?',
        [id]
      );

      res.json(updatedIndustry);
    } else {
      // 添加新行业
      const result = await DatabaseService.run(
        'INSERT INTO industries (name, keywords, user_id) VALUES (?, ?, ?)',
        [name, keywords || null, req.user.id]
      );

      const newIndustry = await DatabaseService.get(
        'SELECT * FROM industries WHERE id = ?',
        [result.id]
      );

      res.status(201).json(newIndustry);
    }
  } catch (error) {
    console.error('Save industry error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 删除关注行业
router.delete('/industry/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await DatabaseService.run(
      'DELETE FROM industries WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Industry not found' });
    }

    res.json({ message: 'Industry deleted successfully' });
  } catch (error) {
    console.error('Delete industry error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
