const axios = require('axios');
const cheerio = require('cheerio');
const { OpenAI } = require('openai');
const Parser = require('rss-parser');
const DatabaseService = require('./DatabaseService');
const OpenAILogger = require('../utils/OpenAILogger');

class NewsService {
  constructor() {
    // 仅在有API密钥时初始化OpenAI
    if (process.env.OPENAI_API_KEY) {
      const config = {
        apiKey: process.env.OPENAI_API_KEY,
        timeout: 60000 // 60秒超时
      };

      // 如果设置了代理，使用代理配置
      if (process.env.HTTP_PROXY || process.env.HTTPS_PROXY) {
        try {
          const { HttpsProxyAgent } = require('https-proxy-agent');
          const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
          config.httpAgent = new HttpsProxyAgent(proxyUrl);
          console.log(`Using proxy: ${proxyUrl}`);
        } catch (error) {
          console.warn('Failed to configure proxy:', error.message);
        }
      }

      this.openai = new OpenAI(config);
    } else {
      console.warn('OpenAI API密钥未设置，将跳过AI功能');
      this.openai = null;
    }
    
    // News API配置 - 支持两种环境变量命名
    this.newsApiKey = process.env.NEWSAPI_KEY || process.env.NEWS_API_KEY;
    this.newsApiBaseUrl = 'https://newsapi.org/v2';
    
    // RSS新闻源 - 稳定可靠，无反爬虫问题
    this.rssSources = [
      {
        name: 'BBC Business',
        url: 'http://feeds.bbci.co.uk/news/business/rss.xml'
      },
      {
        name: 'CNN Business',
        url: 'http://rss.cnn.com/rss/edition.rss'
      },
      {
        name: 'Yahoo Finance',
        url: 'https://finance.yahoo.com/rss/'
      },
      {
        name: 'MarketWatch',
        url: 'http://feeds.marketwatch.com/marketwatch/topstories/'
      },
      {
        name: 'Bloomberg Markets',
        url: 'https://feeds.bloomberg.com/markets/news.rss'
      },
      {
        name: 'CNBC Markets',
        url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html'
      },
      {
        name: 'Forbes Business',
        url: 'https://www.forbes.com/business/feed/'
      },
      {
        name: 'Business Insider',
        url: 'https://www.businessinsider.com/rss'
      },
      {
        name: 'Seeking Alpha',
        url: 'https://seekingalpha.com/feed.xml'
      },
      {
        name: 'The Motley Fool',
        url: 'https://www.fool.com/feeds/index.aspx'
      },
      {
        name: 'Barrons Real-time',
        url: 'https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines'
      },
      {
        name: 'TechCrunch',
        url: 'https://feeds.feedburner.com/TechCrunch/'
      },
      {
        name: 'WSJ Markets',
        url: 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml'
      }
    ];

    // 备用网页抓取源（如果RSS失败）
    this.newsSources = [
      {
        name: 'Reuters Finance',
        url: 'https://www.reuters.com/business/finance/',
        selector: 'a[data-testid="Heading"]'
      },
      {
        name: 'Yahoo Finance',
        url: 'https://finance.yahoo.com/news/',
        selector: '.content a.titles'
      },
      {
        name: 'MarketWatch',
        url: 'https://www.marketwatch.com/latest-news',
        selector: 'h3.article__headline a'
      }
    ];

    // RSS解析器初始化
    this.rssParser = new Parser({
      timeout: 10000,
      maxRedirects: 3,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
  }

  async updateNews() {
    try {
      const portfolio = await this.getPortfolioSymbols();
      const industries = await this.getWatchedIndustries();
      
      let successCount = 0;
      
      // 优先使用RSS抓取 - 最稳定可靠
      console.log('开始RSS新闻抓取...');
      for (const rssSource of this.rssSources) {
        try {
          await this.scrapeRSSSource(rssSource, portfolio, industries);
          successCount++;
          console.log(`${rssSource.name} RSS抓取成功`);
        } catch (error) {
          console.error(`${rssSource.name} RSS抓取失败:`, error.message);
        }
      }
      
      // 如果RSS抓取失败较多，尝试News API作为补充
      if (this.newsApiKey) {
        try {
          console.log('RSS抓取成功率较低，尝试News API...');
          await this.fetchNewsFromAPI(portfolio, industries);
          successCount++;
          console.log('News API获取成功');
        } catch (error) {
          console.error('News API获取失败:', error.message);
        }
      }
      
      // 最后的备选方案：网页抓取（只有在RSS和API都失败时使用）
      if (successCount === 0) {
        console.log('RSS和API都失败，尝试网页抓取...');
        for (const source of this.newsSources) {
          try {
            await this.scrapeNewsSource(source, portfolio, industries);
            successCount++;
            console.log(`${source.name} 抓取成功`);
          } catch (error) {
            console.error(`${source.name} 抓取失败:`, error.message);
          }
        }
      }
      
      if (successCount === 0) {
        console.error('所有新闻源都获取失败，请检查网络连接和API配置');
        // 不抛出错误，避免整个更新流程失败
      } else {
        console.log(`成功从 ${successCount} 个源获取新闻`);
      }
      
      await this.cleanOldNews();
    } catch (error) {
      console.error('Error updating news:', error);
      throw error;
    }
  }

  async fetchNewsFromAPI(portfolio, industries) {
    try {
      // 构建查询关键词
      const keywords = [];
      
      console.log(`投资组合包含 ${portfolio.length} 只股票`);
      console.log(`关注行业包含 ${industries.length} 个行业`);
      
      // 添加股票代码和公司名
      portfolio.forEach(stock => {
        keywords.push(stock.symbol);
        if (stock.name) {
          keywords.push(stock.name);
        }
      });
      
      // 添加行业关键词
      industries.forEach(industry => {
        keywords.push(industry.name);
        if (industry.keywords) {
          keywords.push(...industry.keywords.split(',').map(k => k.trim()));
        }
      });
      
      // 如果没有投资组合数据，使用通用财经关键词
      if (portfolio.length === 0 && industries.length === 0) {
        console.log('没有投资组合和行业数据，使用通用财经关键词');
        keywords.push(
          'Apple', 'Microsoft', 'Google', 'Tesla', 'Amazon',
          'stock market', 'earnings', 'finance', 'investment',
          'S&P 500', 'Nasdaq', 'Dow Jones', 'Federal Reserve'
        );
      } else {
        // 添加通用财经关键词作为补充
        keywords.push('stock market', 'finance', 'earnings', 'investment');
      }
      
      // 限制关键词数量并构建查询
      const query = keywords.slice(0, 15).join(' OR ');
      console.log(`News API查询关键词: ${query}`);
      
      const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // 最近7天
      const params = {
        q: query,
        apiKey: this.newsApiKey,
        sortBy: 'publishedAt',
        pageSize: 100, // 增加页面大小
        language: 'en',
        from: fromDate
      };
      
      console.log(`News API请求参数:`, { ...params, apiKey: '[HIDDEN]' });
      
      const response = await axios.get(`${this.newsApiBaseUrl}/everything`, {
        params,
        timeout: 15000
      });

      if (response.data.status !== 'ok') {
        throw new Error(`News API错误: ${response.data.message}`);
      }

      const articles = response.data.articles || [];
      console.log(`News API返回 ${articles.length} 条新闻`);

      if (articles.length > 0) {
        console.log('前5条新闻标题:', articles.slice(0, 5).map(a => a.title));
      }

      // 处理每篇文章
      let savedCount = 0;
      let relevantCount = 0;
      
      for (const article of articles.slice(0, 50)) { // 增加处理数量
        if (!article.title || !article.url) {
          continue;
        }

        const newsArticle = {
          title: article.title,
          url: article.url,
          source: 'News API',
          description: article.description,
          publishedAt: article.publishedAt
        };

        // 放宽相关性检查 - 如果没有投资组合数据，保存所有财经新闻
        const isRelevant = portfolio.length === 0 && industries.length === 0 ? 
          this.isFinancialNews(article.title) : 
          this.isRelevantNews(article.title, portfolio, industries);
        
        if (isRelevant) {
          relevantCount++;
          try {
            await this.saveNews(newsArticle, portfolio, industries);
            savedCount++;
          } catch (saveError) {
            console.error(`保存新闻失败: ${saveError.message}`);
          }
        }
      }
      
      console.log(`相关新闻 ${relevantCount} 条，成功保存 ${savedCount} 条`);

    } catch (error) {
      console.error('News API获取错误:', error.message);
      throw error;
    }
  }

  async scrapeRSSSource(rssSource, portfolio, industries) {
    try {
      console.log(`抓取RSS: ${rssSource.name} - ${rssSource.url}`);
      
      // 解析RSS feed
      const feed = await this.rssParser.parseURL(rssSource.url);
      
      console.log(`RSS feed标题: ${feed.title}`);
      console.log(`RSS feed描述: ${feed.description}`);
      console.log(`RSS条目数量: ${feed.items.length}`);
      
      const articles = [];
      
      // 处理RSS条目
      for (const item of feed.items.slice(0, 20)) { // 只取前20条
        if (!item.title || !item.link) {
          continue;
        }
        
        const article = {
          title: item.title,
          url: item.link,
          source: rssSource.name,
          description: item.contentSnippet || item.summary || '',
          publishedAt: item.pubDate || item.isoDate
        };
        
        articles.push(article);
      }
      
      console.log(`从 ${rssSource.name} 提取到 ${articles.length} 条新闻`);
      
      // 过滤相关新闻
      const relevantArticles = articles.filter(article => 
        this.isRelevantNews(article.title, portfolio, industries)
      );
      
      console.log(`过滤后相关新闻 ${relevantArticles.length} 条`);
      
      // 保存新闻
      let savedCount = 0;
      for (const article of relevantArticles.slice(0, 10)) { // 每个RSS源最多保存10条
        try {
          await this.saveNews(article, portfolio, industries);
          savedCount++;
        } catch (saveError) {
          console.error(`保存新闻失败:`, saveError.message);
        }
      }
      
      console.log(`从 ${rssSource.name} 保存了 ${savedCount} 条新闻`);
      return savedCount;
      
    } catch (error) {
      console.error(`RSS抓取 ${rssSource.name} 失败:`, error.message);
      
      // 提供更详细的错误信息
      if (error.code === 'ENOTFOUND') {
        console.error(`${rssSource.name} RSS地址无法访问，可能URL已失效`);
      } else if (error.code === 'ECONNABORTED') {
        console.error(`${rssSource.name} RSS请求超时`);
      } else if (error.message.includes('Invalid XML')) {
        console.error(`${rssSource.name} RSS格式无效`);
      }
      
      throw error;
    }
  }

  async scrapeNewsSource(source, portfolio, industries) {
    try {
      // 改进的请求头，模拟真实浏览器
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0'
      };

      const response = await axios.get(source.url, {
        timeout: 15000,
        headers,
        maxRedirects: 5,
        validateStatus: function (status) {
          return status < 500; // 接受所有小于500的状态码
        }
      });

      // 检查响应状态
      if (response.status === 401) {
        throw new Error('访问被拒绝 (401) - 可能需要认证或被反爬虫系统阻止');
      }
      if (response.status === 403) {
        throw new Error('访问被禁止 (403) - 被反爬虫系统阻止');
      }
      if (response.status === 429) {
        throw new Error('请求过于频繁 (429) - 需要降低请求频率');
      }
      if (response.status >= 400) {
        throw new Error(`HTTP错误 ${response.status}: ${response.statusText}`);
      }

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
      let savedCount = 0;
      for (const article of relevantArticles.slice(0, 5)) { // 限制每个源最多5条
        try {
          await this.saveNews(article, portfolio, industries);
          savedCount++;
        } catch (saveError) {
          console.error(`保存新闻失败:`, saveError.message);
        }
      }
      
      console.log(`从 ${source.name} 保存了 ${savedCount} 条新闻`);

    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        console.error(`${source.name} 请求超时`);
      } else if (error.code === 'ENOTFOUND') {
        console.error(`${source.name} 域名解析失败`);
      } else if (error.code === 'ECONNREFUSED') {
        console.error(`${source.name} 连接被拒绝`);
      } else {
        console.error(`${source.name} 抓取失败:`, error.message);
      }
      throw error; // 重新抛出错误，让上层处理
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
      if (!this.openai) {
        return text.substring(0, 200) + '...';
      }

      const params = {
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
      };

      const response = await OpenAILogger.loggedOpenAICall(
        this.openai, 
        'NewsService.generateSummary', 
        params, 
        { service: 'NewsService', operation: 'generateSummary' }
      );

      return response.choices[0].message.content.trim();
    } catch (error) {
      console.error('Error generating summary:', error);
      return text.substring(0, 200) + '...';
    }
  }

  async analyzeSentiment(text) {
    try {
      if (!this.openai) {
        return 0;
      }

      const params = {
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
      };

      const response = await OpenAILogger.loggedOpenAICall(
        this.openai, 
        'NewsService.analyzeSentiment', 
        params, 
        { service: 'NewsService', operation: 'analyzeSentiment' }
      );

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

  // 检查是否为财经新闻（用于没有投资组合时的通用判断）
  isFinancialNews(title) {
    const titleLower = title.toLowerCase();
    const financialKeywords = [
      'stock', 'market', 'earnings', 'revenue', 'profit', 'loss',
      'shares', 'dividend', 'investment', 'trading', 'nasdaq', 'dow',
      's&p', 'fed', 'interest rate', 'inflation', 'gdp', 'economy',
      'wall street', 'finance', 'financial', 'company', 'business',
      'ceo', 'ipo', 'merger', 'acquisition', 'quarter', 'fiscal'
    ];
    
    return financialKeywords.some(keyword => titleLower.includes(keyword));
  }

  async getPortfolioSymbols() {
    try {
      // 获取所有投资组合的股票（包括新旧结构）
      const newPortfolioStocks = await DatabaseService.all('SELECT symbol, name FROM portfolio_stocks');
      const oldPortfolioStocks = await DatabaseService.all('SELECT symbol, name FROM portfolio');
      
      // 合并去重
      const allStocks = [...newPortfolioStocks, ...oldPortfolioStocks];
      const uniqueStocks = allStocks.filter((stock, index, self) => 
        index === self.findIndex(s => s.symbol === stock.symbol)
      );
      
      return uniqueStocks;
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
