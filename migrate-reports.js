#!/usr/bin/env node

/**
 * 数据库迁移脚本：添加报告表
 * 用于为现有数据库添加新的 reports 表
 */

const DatabaseService = require('./services/DatabaseService');

async function migrateReportsTable() {
  try {
    console.log('开始迁移数据库...');
    
    // 初始化数据库连接
    await DatabaseService.init();
    
    // 检查 reports 表是否已存在
    const existingTable = await DatabaseService.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='reports'"
    );
    
    if (existingTable) {
      console.log('reports 表已存在，跳过创建');
      return;
    }
    
    // 创建 reports 表
    const createReportsTable = `
      CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        portfolio_id INTEGER,
        user_id INTEGER NOT NULL,
        report_data TEXT,
        topic TEXT,
        days INTEGER,
        status TEXT DEFAULT 'generated',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (portfolio_id) REFERENCES portfolios (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `;
    
    await DatabaseService.run(createReportsTable);
    console.log('✅ reports 表创建成功');
    
    // 从现有的邮件日志中迁移一些数据（可选）
    console.log('正在从邮件日志迁移现有报告记录...');
    
    const emailLogs = await DatabaseService.all(`
      SELECT DISTINCT 
        el.subject,
        el.sent_at,
        u.id as user_id
      FROM email_logs el
      LEFT JOIN users u ON 1=1  -- 假设第一个用户是管理员
      WHERE el.status = 'sent' 
        AND el.subject LIKE '%报告%'
      ORDER BY el.sent_at DESC
      LIMIT 50
    `);
    
    let migratedCount = 0;
    for (const log of emailLogs) {
      try {
        // 尝试从邮件主题中提取投资组合信息
        const portfolioMatch = log.subject.match(/「(.+?)」/);
        let portfolioId = null;
        
        if (portfolioMatch) {
          const portfolio = await DatabaseService.get(
            'SELECT id FROM portfolios WHERE name = ?',
            [portfolioMatch[1]]
          );
          if (portfolio) {
            portfolioId = portfolio.id;
          }
        }
        
        // 确定报告类型
        let type = 'portfolio';
        if (log.subject.includes('增强')) {
          type = 'enhanced-portfolio';
        } else if (log.subject.includes('主题')) {
          type = 'topic-research';
        }
        
        await DatabaseService.run(`
          INSERT INTO reports (type, title, portfolio_id, user_id, report_data, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          type,
          log.subject,
          portfolioId,
          log.user_id || 1, // 默认分配给第一个用户
          JSON.stringify({ migrated: true, originalSentAt: log.sent_at }),
          'sent',
          log.sent_at,
          log.sent_at
        ]);
        
        migratedCount++;
      } catch (error) {
        console.warn(`跳过迁移记录: ${log.subject}`, error.message);
      }
    }
    
    console.log(`✅ 迁移完成，共迁移 ${migratedCount} 条历史报告记录`);
    console.log('🎉 数据库迁移成功完成！');
    
  } catch (error) {
    console.error('❌ 数据库迁移失败:', error);
    process.exit(1);
  } finally {
    DatabaseService.close();
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  migrateReportsTable();
}

module.exports = migrateReportsTable;
