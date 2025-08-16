const axios = require('axios');
const cheerio = require('cheerio');
const { OpenAI } = require('openai');
const DatabaseService = require('./DatabaseService');

class NewsService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    this.newsSources = [
      {
        name: 'Reuters Finance',
        url: 'https://www.reuters.com/business/finance/',
        selector: 'article h3 a'
      },
      {
        name: 'Yahoo Finance',
        url: 'https://finance.yahoo.com/news/',
        selector: 'h3 a'
      },
      {
        name: 'MarketWatch',
        url: 'https://www.marketwatch.com/latest-news',
        selector: 'h3 a'
      }
    ];
  }

  async updateNews() {
    try {
      const portfolio = await this.getPortfolioSymbols();
      const industries = await this.getWatchedIndustries();
      
      for (const source of this.newsSources) {
        await this.scrapeNewsSource(source, portfolio, industries);
      }
      
      await this.cleanOldNews();
    } catch (error) {
      console.error('Error updating news:', error);
      throw error;
    }
  }

  async scrapeNewsSource(source, portfolio, industries) {
    try {
      const response = await axios.get(source.url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const $ = cheerio.load(response.data);
      const articles = [];

      $(source.selector).each((i, element) => {
        const $el = $(element);
        const title = $el.text().trim();
        const url = $el.attr('href');
        
        if (title && url) {
          let fullUrl = url;
          if (url.startsWith('/')) {
            const baseUrl = new URL(source.url).origin;
            fullUrl = baseUrl + url;
          }
          
          articles.push({
            title,
            url: fullUrl,
            source: source.name
          });
        }
      });

      // 过滤相关新闻
      const relevantArticles = articles.filter(article => 
        this.isRelevantNews(article.title, portfolio, industries)
      );

      // 保存新闻
      for (const article of relevantArticles.slice(0, 5)) { // 限制每个源最多5条
        await this.saveNews(article, portfolio, industries);
      }

    } catch (error) {
      console.error(`Error scraping ${source.name}:`, error.message);
    }
  }

  isRelevantNews(title, portfolio, industries) {
    const titleLower = title.toLowerCase();
    
    // 检查股票代码
    for (const stock of portfolio) {
      if (titleLower.includes(stock.symbol.toLowerCase()) || 
          titleLower.includes(stock.name.toLowerCase())) {
        return true;
      }
    }
    
    // 检查行业关键词
    for (const industry of industries) {
      const keywords = industry.keywords ? industry.keywords.split(',') : [];
      if (keywords.some(keyword => titleLower.includes(keyword.trim().toLowerCase()))) {
        return true;
      }
      if (titleLower.includes(industry.name.toLowerCase())) {
        return true;
      }
    }
    
    // 通用财经关键词
    const financialKeywords = [
      'stock', 'market', 'earnings', 'revenue', 'profit', 'loss',
      'shares', 'dividend', 'investment', 'trading', 'nasdaq', 'dow',
      's&p', 'fed', 'interest rate', 'inflation', 'gdp'
    ];
    
    return financialKeywords.some(keyword => titleLower.includes(keyword));
  }

  async saveNews(article, portfolio, industries) {
    try {
      // 检查是否已存在
      const existing = await DatabaseService.get(
        'SELECT id FROM news WHERE url = ?',
        [article.url]
      );
      
      if (existing) {
        return;
      }

      // 获取新闻内容
      const content = await this.fetchArticleContent(article.url);
      
      // 生成摘要
      const summary = await this.generateSummary(content || article.title);
      
      // 分析相关股票
      const relatedSymbols = this.extractRelatedSymbols(article.title + ' ' + content, portfolio);
      
      // 分析情感
      const sentiment = await this.analyzeSentiment(article.title + ' ' + summary);
      
      // 确定分类
      const category = this.categorizeNews(article.title, industries);

      await DatabaseService.run(
        `INSERT INTO news (title, content, summary, url, source, category, symbols, sentiment, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          article.title,
          content,
          summary,
          article.url,
          article.source,
          category,
          JSON.stringify(relatedSymbols),
          sentiment,
          new Date().toISOString()
        ]
      );

    } catch (error) {
      console.error('Error saving news:', error);
    }
  }

  async fetchArticleContent(url) {
    try {
      const response = await axios.get(url, {
        timeout: 8000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const $ = cheerio.load(response.data);
      
      // 尝试多种内容选择器
      const contentSelectors = [
        'article p',
        '.article-body p',
        '.content p',
        '.story-body p',
        'main p'
      ];

      let content = '';
      for (const selector of contentSelectors) {
        const paragraphs = $(selector);
        if (paragraphs.length > 0) {
          content = paragraphs.map((i, el) => $(el).text()).get().join('\n');
          break;
        }
      }

      return content.substring(0, 2000); // 限制长度
    } catch (error) {
      console.error('Error fetching article content:', error.message);
      return null;
    }
  }

  async generateSummary(text) {
    try {
      if (!process.env.OPENAI_API_KEY) {
        return text.substring(0, 200) + '...';
      }

      const response = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: '你是一个专业的财经新闻分析师。请用中文总结新闻内容，突出重点信息和市场影响。'
          },
          {
            role: 'user',
            content: `请总结以下新闻内容（不超过150字）：\n\n${text}`
          }
        ],
        max_tokens: 200,
        temperature: 0.3
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      console.error('Error generating summary:', error);
      return text.substring(0, 200) + '...';
    }
  }

  async analyzeSentiment(text) {
    try {
      if (!process.env.OPENAI_API_KEY) {
        return 0;
      }

      const response = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: '分析文本的情感倾向，返回-1到1之间的数值，-1表示非常负面，0表示中性，1表示非常正面。只返回数值。'
          },
          {
            role: 'user',
            content: text
          }
        ],
        max_tokens: 10,
        temperature: 0
      });

      const sentiment = parseFloat(response.choices[0].message.content.trim());
      return isNaN(sentiment) ? 0 : Math.max(-1, Math.min(1, sentiment));
    } catch (error) {
      console.error('Error analyzing sentiment:', error);
      return 0;
    }
  }

  extractRelatedSymbols(text, portfolio) {
    const relatedSymbols = [];
    const textLower = text.toLowerCase();
    
    for (const stock of portfolio) {
      if (textLower.includes(stock.symbol.toLowerCase()) || 
          textLower.includes(stock.name.toLowerCase())) {
        relatedSymbols.push(stock.symbol);
      }
    }
    
    return relatedSymbols;
  }

  categorizeNews(title, industries) {
    const titleLower = title.toLowerCase();
    
    for (const industry of industries) {
      if (titleLower.includes(industry.name.toLowerCase())) {
        return industry.name;
      }
    }
    
    // 默认分类
    const categories = {
      'earnings': ['earnings', 'revenue', 'profit', 'loss'],
      'market': ['market', 'trading', 'index', 'dow', 'nasdaq', 's&p'],
      'policy': ['fed', 'interest rate', 'policy', 'regulation'],
      'economy': ['gdp', 'inflation', 'employment', 'economic']
    };
    
    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => titleLower.includes(keyword))) {
        return category;
      }
    }
    
    return 'general';
  }

  async getPortfolioSymbols() {
    try {
      return await DatabaseService.all('SELECT symbol, name FROM portfolio');
    } catch (error) {
      console.error('Error getting portfolio:', error);
      return [];
    }
  }

  async getWatchedIndustries() {
    try {
      return await DatabaseService.all('SELECT name, keywords FROM industries');
    } catch (error) {
      console.error('Error getting industries:', error);
      return [];
    }
  }

  async cleanOldNews() {
    try {
      // 删除7天前的新闻
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      
      await DatabaseService.run(
        'DELETE FROM news WHERE created_at < ?',
        [weekAgo.toISOString()]
      );
    } catch (error) {
      console.error('Error cleaning old news:', error);
    }
  }

  async getRecentNews(limit = 20) {
    try {
      return await DatabaseService.all(
        `SELECT * FROM news 
         ORDER BY created_at DESC 
         LIMIT ?`,
        [limit]
      );
    } catch (error) {
      console.error('Error getting recent news:', error);
      return [];
    }
  }

  async getNewsByCategory(category, limit = 10) {
    try {
      return await DatabaseService.all(
        `SELECT * FROM news 
         WHERE category = ? 
         ORDER BY created_at DESC 
         LIMIT ?`,
        [category, limit]
      );
    } catch (error) {
      console.error('Error getting news by category:', error);
      return [];
    }
  }
}

module.exports = new NewsService();
