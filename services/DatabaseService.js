const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class DatabaseService {
  constructor() {
    this.db = null;
  }

  async init() {
    const dbDir = path.dirname(process.env.DB_PATH || './data/market_daily.db');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(process.env.DB_PATH || './data/market_daily.db', (err) => {
        if (err) {
          reject(err);
        } else {
          console.log('Connected to SQLite database');
          this.createTables().then(resolve).catch(reject);
        }
      });
    });
  }

  async createTables() {
    const tables = [
      // 用户表
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // 配置表
      `CREATE TABLE IF NOT EXISTS config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )`,
      
      // 投资组合表（组合信息）
      `CREATE TABLE IF NOT EXISTS portfolios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        user_id INTEGER,
        is_public BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )`,
      
      // 投资组合股票表
      `CREATE TABLE IF NOT EXISTS portfolio_stocks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        portfolio_id INTEGER NOT NULL,
        symbol TEXT NOT NULL,
        name TEXT NOT NULL,
        sector TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (portfolio_id) REFERENCES portfolios (id) ON DELETE CASCADE
      )`,

      // 保持旧的portfolio表兼容性（将迁移到新结构）
      `CREATE TABLE IF NOT EXISTS portfolio (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        name TEXT NOT NULL,
        sector TEXT,
        user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )`,
      
      // 关注行业表
      `CREATE TABLE IF NOT EXISTS industries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        keywords TEXT,
        user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )`,
      
      // 新闻表
      `CREATE TABLE IF NOT EXISTS news (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT,
        summary TEXT,
        url TEXT UNIQUE,
        source TEXT,
        category TEXT,
        symbols TEXT,
        sentiment REAL,
        published_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // 邮件发送记录表
      `CREATE TABLE IF NOT EXISTS email_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipient TEXT NOT NULL,
        subject TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        error_message TEXT,
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // 邮件订阅表
      `CREATE TABLE IF NOT EXISTS email_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        portfolio_id INTEGER,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (portfolio_id) REFERENCES portfolios (id) ON DELETE CASCADE
      )`
    ];

    for (const table of tables) {
      await this.run(table);
    }

    // 创建默认管理员用户
    await this.createDefaultAdmin();
    
    // 迁移旧的投资组合数据
    await this.migratePortfolioData();
  }

  async createDefaultAdmin() {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    
    try {
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      
      await this.run(
        'INSERT OR IGNORE INTO users (email, password, role) VALUES (?, ?, ?)',
        [adminEmail, hashedPassword, 'admin']
      );
      console.log(`Default admin user created: ${adminEmail}`);
    } catch (error) {
      console.error('Error creating default admin:', error);
    }
  }

  async migratePortfolioData() {
    try {
      // 检查是否已经迁移过
      const migrationCheck = await this.get(
        "SELECT value FROM config WHERE key = 'portfolio_migrated'"
      );
      
      if (migrationCheck) {
        return; // 已经迁移过
      }

      // 获取所有用户
      const users = await this.all('SELECT id FROM users');
      
      for (const user of users) {
        // 为每个用户创建默认投资组合
        const portfolioResult = await this.run(
          'INSERT INTO portfolios (name, description, user_id) VALUES (?, ?, ?)',
          ['默认投资组合', '系统自动创建的默认投资组合', user.id]
        );
        
        // 迁移该用户的旧股票数据
        const oldStocks = await this.all(
          'SELECT * FROM portfolio WHERE user_id = ?',
          [user.id]
        );
        
        for (const stock of oldStocks) {
          await this.run(
            'INSERT INTO portfolio_stocks (portfolio_id, symbol, name, sector) VALUES (?, ?, ?, ?)',
            [portfolioResult.id, stock.symbol, stock.name, stock.sector]
          );
        }
      }
      
      // 标记迁移完成
      await this.run(
        "INSERT INTO config (key, value) VALUES ('portfolio_migrated', '1')"
      );
      
      console.log('Portfolio data migration completed');
    } catch (error) {
      console.error('Error migrating portfolio data:', error);
    }
  }

  // 执行SQL语句（INSERT, UPDATE, DELETE等）
  async run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  // 获取单行数据
  async get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // 获取多行数据
  async all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // 关闭数据库连接
  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = new DatabaseService();
