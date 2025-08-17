const { OpenAI } = require('openai');
const { format } = require('date-fns');
const DatabaseService = require('./DatabaseService');
const NewsService = require('./NewsService');
const axios = require('axios');
const OpenAILogger = require('../utils/OpenAILogger');

class ReportService {
  constructor() {
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
    
    // 支持多个搜索API
    this.searchAPIs = {
      newsapi: {
        baseURL: 'https://newsapi.org/v2',
        apiKey: process.env.NEWSAPI_KEY,
        enabled: !!process.env.NEWSAPI_KEY
      },
      finnhub: {
        baseURL: 'https://finnhub.io/api/v1',
        apiKey: process.env.FINNHUB_API_KEY,
        enabled: !!process.env.FINNHUB_API_KEY
      },
      alphavantage: {
        baseURL: 'https://www.alphavantage.co',
        apiKey: process.env.ALPHAVANTAGE_API_KEY,
        enabled: !!process.env.ALPHAVANTAGE_API_KEY
      }
    };
  }

  /**
   * 生成每日综合报告
   */
  async generateDailyReport(targetDate = null) {
    try {
      const reportDate = targetDate ? new Date(targetDate) : new Date();

      // 获取最新新闻
      const recentNews = await NewsService.getRecentNews(20);
      
      // 按分类组织新闻
      const newsByCategory = {};
      recentNews.forEach(news => {
        const category = news.category || 'general';
        if (!newsByCategory[category]) {
          newsByCategory[category] = [];
        }
        newsByCategory[category].push(news);
      });

      // 获取投资组合相关新闻
      const portfolio = await DatabaseService.all('SELECT * FROM portfolio');
      const portfolioNews = recentNews.filter(news => {
        const symbols = JSON.parse(news.symbols || '[]');
        return symbols.length > 0;
      });

      // 计算市场情绪
      const sentiments = recentNews.map(news => news.sentiment || 0);
      const avgSentiment = sentiments.length > 0 
        ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length 
        : 0;

      // 生成AI分析报告
      const aiAnalysis = await this.generateAIAnalysis(recentNews, portfolioNews);

      // 获取市场趋势分析
      const marketTrends = await this.analyzeMarketTrends(recentNews);

      return {
        date: format(reportDate, 'yyyy-MM-dd'),
        formattedDate: format(reportDate, 'yyyy年MM月dd日'),
        totalNews: recentNews.length,
        portfolioNews,
        newsByCategory,
        marketSentiment: avgSentiment,
        portfolio,
        aiAnalysis,
        marketTrends,
        type: 'daily'
      };
    } catch (error) {
      console.error('Error generating daily report:', error);
      throw error;
    }
  }

  /**
   * 生成投资组合专用报告
   */
  async generatePortfolioReport(portfolioId, targetDate = null) {
    try {
      const reportDate = targetDate ? new Date(targetDate) : new Date();

      // 获取投资组合信息
      const portfolio = await DatabaseService.get(
        'SELECT * FROM portfolios WHERE id = ?',
        [portfolioId]
      );

      if (!portfolio) {
        throw new Error('Portfolio not found');
      }

      // 获取投资组合中的股票
      const portfolioStocks = await DatabaseService.all(
        'SELECT * FROM portfolio_stocks WHERE portfolio_id = ?',
        [portfolioId]
      );

      if (portfolioStocks.length === 0) {
        return this.generateEmptyPortfolioReport(portfolio, reportDate);
      }

      const symbols = portfolioStocks.map(stock => stock.symbol);

      // 获取相关新闻
      let recentNews;
      if (targetDate) {
        // 获取指定日期的新闻
        const startDate = new Date(reportDate);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(reportDate);
        endDate.setHours(23, 59, 59, 999);
        
        recentNews = await DatabaseService.all(
          `SELECT * FROM news 
           WHERE created_at >= ? AND created_at <= ?
           ORDER BY created_at DESC`,
          [startDate.toISOString(), endDate.toISOString()]
        );
      } else {
        // 获取最新新闻
        recentNews = await NewsService.getRecentNews(30);
      }
      
      // 过滤投资组合相关新闻
      const portfolioNews = recentNews.filter(news => {
        const newsSymbols = JSON.parse(news.symbols || '[]');
        return newsSymbols.some(symbol => symbols.includes(symbol));
      });

      // 按分类组织新闻
      const newsByCategory = {};
      portfolioNews.forEach(news => {
        const category = news.category || 'general';
        if (!newsByCategory[category]) {
          newsByCategory[category] = [];
        }
        newsByCategory[category].push(news);
      });

      // 计算市场情绪
      const sentiments = portfolioNews.map(news => news.sentiment || 0);
      const avgSentiment = sentiments.length > 0 
        ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length 
        : 0;

      // 获取投资组合性能指标
      const performanceMetrics = await this.calculatePortfolioMetrics(portfolioId, reportDate);

      // 生成AI投资建议
      const aiRecommendations = await this.generatePortfolioRecommendations(
        portfolioStocks, 
        portfolioNews,
        performanceMetrics
      );

      // 风险分析
      const riskAnalysis = await this.analyzePortfolioRisk(portfolioStocks, portfolioNews);

      return {
        date: format(reportDate, 'yyyy-MM-dd'),
        formattedDate: format(reportDate, 'yyyy年MM月dd日'),
        portfolio: {
          id: portfolio.id,
          name: portfolio.name,
          description: portfolio.description,
          stocks: portfolioStocks,
          stockCount: portfolioStocks.length
        },
        totalNews: portfolioNews.length,
        portfolioNews,
        newsByCategory,
        marketSentiment: avgSentiment,
        metrics: performanceMetrics,
        aiRecommendations,
        riskAnalysis,
        type: 'portfolio'
      };
    } catch (error) {
      console.error('Error generating portfolio report:', error);
      throw error;
    }
  }

  /**
   * 生成通用市场报告
   */
  async generateGeneralReport(targetDate = null) {
    try {
      const reportDate = targetDate ? new Date(targetDate) : new Date();

      // 获取最新新闻
      const recentNews = await NewsService.getRecentNews(15);
      
      // 按分类组织新闻
      const newsByCategory = {};
      recentNews.forEach(news => {
        const category = news.category || 'general';
        if (!newsByCategory[category]) {
          newsByCategory[category] = [];
        }
        newsByCategory[category].push(news);
      });

      // 获取所有公开投资组合
      const publicPortfolios = await DatabaseService.all(
        `SELECT p.*, 
         (SELECT COUNT(*) FROM portfolio_stocks WHERE portfolio_id = p.id) as stock_count
         FROM portfolios p 
         WHERE p.is_public = 1 
         ORDER BY p.created_at DESC 
         LIMIT 5`
      );

      // 计算市场情绪
      const sentiments = recentNews.map(news => news.sentiment || 0);
      const avgSentiment = sentiments.length > 0 
        ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length 
        : 0;

      // 生成市场概览
      const marketOverview = await this.generateMarketOverview(recentNews);

      // 热门话题分析
      const trendingTopics = await this.analyzeTrendingTopics(recentNews);

      return {
        date: format(reportDate, 'yyyy-MM-dd'),
        formattedDate: format(reportDate, 'yyyy年MM月dd日'),
        totalNews: recentNews.length,
        portfolioNews: [],
        newsByCategory,
        marketSentiment: avgSentiment,
        portfolio: publicPortfolios,
        marketOverview,
        trendingTopics,
        isGeneral: true,
        type: 'general'
      };
    } catch (error) {
      console.error('Error generating general report:', error);
      throw error;
    }
  }

  /**
   * 使用AI生成市场分析
   */
  async generateAIAnalysis(allNews, portfolioNews) {
    try {
      if (!process.env.OPENAI_API_KEY || allNews.length === 0) {
        return {
          summary: '暂无AI分析',
          keyPoints: [],
          outlook: '数据不足，无法提供展望'
        };
      }

      const newsText = allNews.slice(0, 10).map(news => 
        `${news.title}: ${news.summary || '无摘要'}`
      ).join('\n');

      const params = {
        model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `你是一位专业的金融分析师。基于提供的新闻信息，生成简洁的市场分析报告。
            请以JSON格式返回，包含以下字段：
            - summary: 市场总体情况摘要（50字内）
            - keyPoints: 关键要点数组（每个要点30字内，最多3个）
            - outlook: 市场前景展望（100字内）`
          },
          {
            role: 'user',
            content: `请分析以下新闻并生成市场分析：\n\n${newsText}`
          }
        ],
        max_tokens: 500,
        temperature: 0.3
      };

      const response = await OpenAILogger.loggedOpenAICall(
        this.openai, 
        'ReportService.generateAIAnalysis', 
        params, 
        { 
          service: 'ReportService', 
          operation: 'generateAIAnalysis',
          newsCount: allNews.length,
          portfolioNewsCount: portfolioNews.length
        }
      );

      const result = JSON.parse(response.choices[0].message.content);
      return result;
    } catch (error) {
      console.error('Error generating AI analysis:', error);
      return {
        summary: '暂无AI分析',
        keyPoints: [],
        outlook: '分析生成失败'
      };
    }
  }

  /**
   * 分析市场趋势
   */
  async analyzeMarketTrends(news) {
    try {
      const categories = {};
      news.forEach(item => {
        const category = item.category || 'general';
        if (!categories[category]) {
          categories[category] = { count: 0, sentiment: 0, news: [] };
        }
        categories[category].count++;
        categories[category].sentiment += (item.sentiment || 0);
        categories[category].news.push(item);
      });

      const trends = Object.entries(categories).map(([category, data]) => ({
        category,
        newsCount: data.count,
        avgSentiment: data.count > 0 ? data.sentiment / data.count : 0,
        trend: data.count > 5 ? 'hot' : data.count > 2 ? 'normal' : 'low'
      })).sort((a, b) => b.newsCount - a.newsCount);

      return trends;
    } catch (error) {
      console.error('Error analyzing market trends:', error);
      return [];
    }
  }

  /**
   * 生成投资组合推荐
   */
  async generatePortfolioRecommendations(stocks, news, metrics) {
    try {
      if (!process.env.OPENAI_API_KEY || stocks.length === 0) {
        return {
          recommendations: [],
          riskLevel: 'unknown',
          summary: '暂无AI建议'
        };
      }

      const stocksText = stocks.map(stock => `${stock.symbol}: ${stock.name}`).join(', ');
      const newsText = news.slice(0, 5).map(item => 
        `${item.title}: ${item.summary || '无摘要'}`
      ).join('\n');

      const params = {
        model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `你是一位专业的投资顾问。基于投资组合和相关新闻，提供投资建议。
            请以JSON格式返回，包含：
            - recommendations: 建议数组（每个建议50字内，最多3个）
            - riskLevel: 风险等级（low/medium/high）
            - summary: 总体建议摘要（100字内）`
          },
          {
            role: 'user',
            content: `投资组合股票：${stocksText}\n\n相关新闻：\n${newsText}\n\n请提供投资建议。`
          }
        ],
        max_tokens: 400,
        temperature: 0.3
      };

      const response = await OpenAILogger.loggedOpenAICall(
        this.openai, 
        'ReportService.generatePortfolioRecommendations', 
        params, 
        { 
          service: 'ReportService', 
          operation: 'generatePortfolioRecommendations',
          stockCount: stocks.length,
          newsCount: news.length
        }
      );

      const result = JSON.parse(response.choices[0].message.content);
      return result;
    } catch (error) {
      console.error('Error generating portfolio recommendations:', error);
      return {
        recommendations: [],
        riskLevel: 'unknown',
        summary: '建议生成失败'
      };
    }
  }

  /**
   * 分析投资组合风险
   */
  async analyzePortfolioRisk(stocks, news) {
    try {
      // 计算风险指标
      const sectorDistribution = {};
      stocks.forEach(stock => {
        const sector = stock.sector || 'unknown';
        sectorDistribution[sector] = (sectorDistribution[sector] || 0) + 1;
      });

      // 分析新闻情绪分布
      const sentiments = news.map(item => item.sentiment || 0);
      const negativeNewsCount = sentiments.filter(s => s < -0.1).length;
      const positiveNewsCount = sentiments.filter(s => s > 0.1).length;

      // 集中度风险
      const concentrationRisk = Object.values(sectorDistribution).some(count => 
        count / stocks.length > 0.5
      ) ? 'high' : 'medium';

      // 新闻风险
      const newsRisk = negativeNewsCount > positiveNewsCount ? 'high' : 
                      negativeNewsCount === 0 ? 'low' : 'medium';

      return {
        concentrationRisk,
        newsRisk,
        sectorDistribution,
        sentimentDistribution: {
          positive: positiveNewsCount,
          negative: negativeNewsCount,
          neutral: news.length - positiveNewsCount - negativeNewsCount
        }
      };
    } catch (error) {
      console.error('Error analyzing portfolio risk:', error);
      return {
        concentrationRisk: 'unknown',
        newsRisk: 'unknown',
        sectorDistribution: {},
        sentimentDistribution: { positive: 0, negative: 0, neutral: 0 }
      };
    }
  }

  /**
   * 计算投资组合指标
   */
  async calculatePortfolioMetrics(portfolioId, date) {
    try {
      const oneWeekAgo = new Date(date);
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const oneMonthAgo = new Date(date);
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

      // 获取相关新闻数量变化
      const weeklyNewsCount = await DatabaseService.get(
        `SELECT COUNT(*) as count FROM news n
         WHERE n.created_at >= ? AND n.created_at <= ?
         AND EXISTS (
           SELECT 1 FROM portfolio_stocks ps 
           WHERE ps.portfolio_id = ? 
           AND JSON_EXTRACT(n.symbols, '$') LIKE '%' || ps.symbol || '%'
         )`,
        [oneWeekAgo.toISOString(), date.toISOString(), portfolioId]
      );

      const monthlyNewsCount = await DatabaseService.get(
        `SELECT COUNT(*) as count FROM news n
         WHERE n.created_at >= ? AND n.created_at <= ?
         AND EXISTS (
           SELECT 1 FROM portfolio_stocks ps 
           WHERE ps.portfolio_id = ? 
           AND JSON_EXTRACT(n.symbols, '$') LIKE '%' || ps.symbol || '%'
         )`,
        [oneMonthAgo.toISOString(), date.toISOString(), portfolioId]
      );

      // 计算情绪趋势
      const weeklyAvgSentiment = await DatabaseService.get(
        `SELECT AVG(n.sentiment) as avg_sentiment FROM news n
         WHERE n.created_at >= ? AND n.created_at <= ?
         AND n.sentiment IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM portfolio_stocks ps 
           WHERE ps.portfolio_id = ? 
           AND JSON_EXTRACT(n.symbols, '$') LIKE '%' || ps.symbol || '%'
         )`,
        [oneWeekAgo.toISOString(), date.toISOString(), portfolioId]
      );

      return {
        weeklyNewsCount: weeklyNewsCount.count || 0,
        monthlyNewsCount: monthlyNewsCount.count || 0,
        avgSentiment: weeklyAvgSentiment.avg_sentiment || 0,
        reportDate: format(date, 'yyyy-MM-dd')
      };
    } catch (error) {
      console.error('Error calculating portfolio metrics:', error);
      return {
        weeklyNewsCount: 0,
        monthlyNewsCount: 0,
        avgSentiment: 0,
        reportDate: format(date, 'yyyy-MM-dd')
      };
    }
  }

  /**
   * 生成市场概览
   */
  async generateMarketOverview(news) {
    try {
      if (!process.env.OPENAI_API_KEY || news.length === 0) {
        return '市场数据不足，无法生成概览';
      }

      const newsText = news.slice(0, 8).map(item => item.title).join('\n');

      const params = {
        model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: '你是一位金融分析师。基于新闻标题，用200字内简洁总结当前市场状况。'
          },
          {
            role: 'user',
            content: `基于以下新闻标题，总结市场概况：\n\n${newsText}`
          }
        ],
        max_tokens: 300,
        temperature: 0.3
      };

      const response = await OpenAILogger.loggedOpenAICall(
        this.openai, 
        'ReportService.generateMarketOverview', 
        params, 
        { 
          service: 'ReportService', 
          operation: 'generateMarketOverview',
          newsCount: news.length
        }
      );

      return response.choices[0].message.content.trim();
    } catch (error) {
      console.error('Error generating market overview:', error);
      return '市场概览生成失败';
    }
  }

  /**
   * 分析热门话题
   */
  async analyzeTrendingTopics(news) {
    try {
      // 简单的关键词频率分析
      const keywordCount = {};
      const stopWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];

      news.forEach(item => {
        const words = item.title.toLowerCase().split(/\s+/);
        words.forEach(word => {
          const cleanWord = word.replace(/[^\w]/g, '');
          if (cleanWord.length > 3 && !stopWords.includes(cleanWord)) {
            keywordCount[cleanWord] = (keywordCount[cleanWord] || 0) + 1;
          }
        });
      });

      // 获取前5个热门关键词
      const trending = Object.entries(keywordCount)
        .filter(([word, count]) => count > 1)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([word, count]) => ({ keyword: word, count }));

      return trending;
    } catch (error) {
      console.error('Error analyzing trending topics:', error);
      return [];
    }
  }

  /**
   * 生成空投资组合报告
   */
  generateEmptyPortfolioReport(portfolio, date) {
    return {
      date: format(date, 'yyyy-MM-dd'),
      formattedDate: format(date, 'yyyy年MM月dd日'),
      portfolio: {
        id: portfolio.id,
        name: portfolio.name,
        description: portfolio.description,
        stocks: [],
        stockCount: 0
      },
      totalNews: 0,
      portfolioNews: [],
      newsByCategory: {},
      marketSentiment: 0,
      metrics: {
        weeklyNewsCount: 0,
        monthlyNewsCount: 0,
        avgSentiment: 0,
        reportDate: format(date, 'yyyy-MM-dd')
      },
      aiRecommendations: {
        recommendations: ['请先在投资组合中添加股票'],
        riskLevel: 'low',
        summary: '投资组合为空，请添加股票后重新生成报告'
      },
      riskAnalysis: {
        concentrationRisk: 'low',
        newsRisk: 'low',
        sectorDistribution: {},
        sentimentDistribution: { positive: 0, negative: 0, neutral: 0 }
      },
      isEmpty: true,
      type: 'portfolio'
    };
  }

  /**
   * 搜索特定主题的新闻并生成报告
   */
  async generateTopicReport(topic, days = 7) {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // 搜索相关新闻
      const relevantNews = await DatabaseService.all(
        `SELECT * FROM news 
         WHERE (title LIKE ? OR content LIKE ? OR summary LIKE ?)
         AND created_at >= ? AND created_at <= ?
         ORDER BY created_at DESC
         LIMIT 20`,
        [`%${topic}%`, `%${topic}%`, `%${topic}%`, startDate.toISOString(), endDate.toISOString()]
      );

      if (relevantNews.length === 0) {
        return {
          topic,
          newsCount: 0,
          summary: `未找到关于"${topic}"的相关新闻`,
          news: [],
          sentiment: 0
        };
      }

      // 计算情绪
      const sentiments = relevantNews.map(news => news.sentiment || 0);
      const avgSentiment = sentiments.length > 0 
        ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length 
        : 0;

      // 生成主题分析
      const topicAnalysis = await this.generateTopicAnalysis(topic, relevantNews);

      return {
        topic,
        dateRange: `${format(startDate, 'yyyy-MM-dd')} 至 ${format(endDate, 'yyyy-MM-dd')}`,
        newsCount: relevantNews.length,
        news: relevantNews,
        sentiment: avgSentiment,
        analysis: topicAnalysis,
        type: 'topic'
      };
    } catch (error) {
      console.error('Error generating topic report:', error);
      throw error;
    }
  }

  /**
   * 生成主题分析
   */
  async generateTopicAnalysis(topic, news) {
    try {
      if (!process.env.OPENAI_API_KEY || news.length === 0) {
        return `关于"${topic}"的分析数据不足`;
      }

      const newsText = news.slice(0, 5).map(item => 
        `${item.title}: ${item.summary || '无摘要'}`
      ).join('\n');

      const params = {
        model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `你是一位专业的市场分析师。基于相关新闻，分析"${topic}"这个主题的影响和趋势。用150字内总结。`
          },
          {
            role: 'user',
            content: `请分析"${topic}"主题的新闻：\n\n${newsText}`
          }
        ],
        max_tokens: 250,
        temperature: 0.3
      };

      const response = await OpenAILogger.loggedOpenAICall(
        this.openai, 
        'ReportService.generateTopicAnalysis', 
        params, 
        { 
          service: 'ReportService', 
          operation: 'generateTopicAnalysis',
          topic: topic 
        }
      );

      return response.choices[0].message.content.trim();
    } catch (error) {
      console.error('Error generating topic analysis:', error);
      return `"${topic}"主题分析生成失败`;
    }
  }

  /**
   * 搜索外部新闻
   */
  async searchExternalNews(query, days = 7) {
    const results = [];
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    // NewsAPI 搜索
    if (this.searchAPIs.newsapi.enabled) {
      try {
        const response = await axios.get(`${this.searchAPIs.newsapi.baseURL}/everything`, {
          params: {
            q: query,
            from: fromDate.toISOString().split('T')[0],
            sortBy: 'relevancy',
            language: 'en',
            apiKey: this.searchAPIs.newsapi.apiKey,
            pageSize: 20
          }
        });

        if (response.data.articles) {
          results.push(...response.data.articles.map(article => ({
            title: article.title,
            summary: article.description,
            content: article.content,
            url: article.url,
            source: article.source.name,
            publishedAt: article.publishedAt,
            category: 'external',
            sentiment: 0, // 需要进一步分析
            symbols: [],
            external: true
          })));
        }
      } catch (error) {
        console.error('NewsAPI search error:', error.message);
      }
    }

    // Finnhub 市场新闻
    if (this.searchAPIs.finnhub.enabled) {
      try {
        const response = await axios.get(`${this.searchAPIs.finnhub.baseURL}/news`, {
          params: {
            category: 'general',
            token: this.searchAPIs.finnhub.apiKey
          }
        });

        if (response.data) {
          results.push(...response.data.slice(0, 10).map(item => ({
            title: item.headline,
            summary: item.summary,
            content: item.summary,
            url: item.url,
            source: item.source,
            publishedAt: new Date(item.datetime * 1000).toISOString(),
            category: 'market',
            sentiment: item.sentiment || 0,
            symbols: item.related ? item.related.split(',') : [],
            external: true
          })));
        }
      } catch (error) {
        console.error('Finnhub search error:', error.message);
      }
    }

    return results;
  }

  /**
   * 使用AI分析和总结外部新闻
   */
  async analyzeExternalNews(news) {
    if (!process.env.OPENAI_API_KEY || news.length === 0) {
      return {
        summary: '无法获取外部新闻分析',
        keyTrends: [],
        sentiment: 0
      };
    }

    try {
      const newsText = news.slice(0, 10).map(item => 
        `${item.title}: ${item.summary || '无摘要'}`
      ).join('\n');

      const params = {
        model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `你是一位专业的金融分析师。基于提供的新闻，生成市场分析报告。
            请以JSON格式返回，包含：
            - summary: 市场总体情况摘要（150字内）
            - keyTrends: 关键趋势数组（每个趋势30字内，最多5个）
            - sentiment: 整体情绪评分（-1到1之间的数字）
            - riskFactors: 风险因素数组（每个因素30字内，最多3个）`
          },
          {
            role: 'user',
            content: `请分析以下新闻并生成市场分析：\n\n${newsText}`
          }
        ],
        max_tokens: 600,
        temperature: 0.3
      };

      const response = await OpenAILogger.loggedOpenAICall(
        this.openai, 
        'ReportService.analyzeExternalNews', 
        params, 
        { 
          service: 'ReportService', 
          operation: 'analyzeExternalNews',
          newsCount: news.length 
        }
      );

      const result = JSON.parse(response.choices[0].message.content);
      return result;
    } catch (error) {
      console.error('Error analyzing external news:', error);
      return {
        summary: '外部新闻分析生成失败',
        keyTrends: [],
        sentiment: 0,
        riskFactors: []
      };
    }
  }

  /**
   * 获取股票相关的外部新闻
   */
  async getStockNews(symbols, days = 7) {
    const allNews = [];

    for (const symbol of symbols.slice(0, 5)) { // 限制查询数量
      // Finnhub 股票新闻
      if (this.searchAPIs.finnhub.enabled) {
        try {
          const fromDate = new Date();
          fromDate.setDate(fromDate.getDate() - days);
          
          const response = await axios.get(`${this.searchAPIs.finnhub.baseURL}/company-news`, {
            params: {
              symbol: symbol,
              from: fromDate.toISOString().split('T')[0],
              to: new Date().toISOString().split('T')[0],
              token: this.searchAPIs.finnhub.apiKey
            }
          });

          if (response.data) {
            allNews.push(...response.data.slice(0, 5).map(item => ({
              title: item.headline,
              summary: item.summary,
              content: item.summary,
              url: item.url,
              source: item.source,
              publishedAt: new Date(item.datetime * 1000).toISOString(),
              category: 'stock',
              sentiment: 0,
              symbols: [symbol],
              external: true
            })));
          }
        } catch (error) {
          console.error(`Stock news error for ${symbol}:`, error.message);
        }
      }

      // NewsAPI 股票新闻
      if (this.searchAPIs.newsapi.enabled) {
        try {
          const fromDate = new Date();
          fromDate.setDate(fromDate.getDate() - days);
          
          const response = await axios.get(`${this.searchAPIs.newsapi.baseURL}/everything`, {
            params: {
              q: `"${symbol}" stock OR "${symbol}" shares`,
              from: fromDate.toISOString().split('T')[0],
              sortBy: 'relevancy',
              language: 'en',
              apiKey: this.searchAPIs.newsapi.apiKey,
              pageSize: 5
            }
          });

          if (response.data.articles) {
            allNews.push(...response.data.articles.map(article => ({
              title: article.title,
              summary: article.description,
              content: article.content,
              url: article.url,
              source: article.source.name,
              publishedAt: article.publishedAt,
              category: 'stock',
              sentiment: 0,
              symbols: [symbol],
              external: true
            })));
          }
        } catch (error) {
          console.error(`NewsAPI stock search error for ${symbol}:`, error.message);
        }
      }
    }

    return allNews;
  }

  /**
   * 增强的投资组合报告生成
   */
  async generateEnhancedPortfolioReport(portfolioId, targetDate = null) {
    try {
      const reportDate = targetDate ? new Date(targetDate) : new Date();

      // 获取基本的投资组合报告
      const basicReport = await this.generatePortfolioReport(portfolioId, targetDate);
      
      if (basicReport.isEmpty) {
        return basicReport;
      }

      // 获取外部新闻数据
      const symbols = basicReport.portfolio.stocks.map(stock => stock.symbol);
      const externalNews = await this.getStockNews(symbols, 7);
      
      // 分析外部新闻
      const externalAnalysis = await this.analyzeExternalNews(externalNews);
      
      // 合并内部和外部新闻
      const allNews = [...basicReport.portfolioNews, ...externalNews];
      
      // 重新计算情绪
      const allSentiments = allNews.map(news => news.sentiment || 0);
      const enhancedSentiment = allSentiments.length > 0 
        ? allSentiments.reduce((a, b) => a + b, 0) / allSentiments.length 
        : basicReport.marketSentiment;

      // 生成增强的AI分析
      const enhancedAIAnalysis = await this.generateEnhancedAIAnalysis(
        basicReport.portfolio.stocks,
        allNews,
        basicReport.metrics
      );

      return {
        ...basicReport,
        marketSentiment: enhancedSentiment,
        portfolioNews: allNews.slice(0, 20), // 限制显示数量
        externalNews: externalNews.slice(0, 10),
        externalAnalysis,
        enhancedAIAnalysis,
        dataSource: 'enhanced',
        totalExternalNews: externalNews.length
      };
    } catch (error) {
      console.error('Error generating enhanced portfolio report:', error);
      // 如果增强报告失败，返回基本报告
      return this.generatePortfolioReport(portfolioId, targetDate);
    }
  }

  /**
   * 生成增强的AI分析
   */
  async generateEnhancedAIAnalysis(stocks, news, metrics) {
    if (!process.env.OPENAI_API_KEY || stocks.length === 0) {
      return {
        summary: '暂无增强AI分析',
        recommendations: [],
        riskAssessment: 'unknown',
        marketOutlook: '数据不足'
      };
    }

    try {
      const stocksText = stocks.map(stock => `${stock.symbol}: ${stock.name}`).join(', ');
      const newsText = news.slice(0, 15).map(item => 
        `[${item.external ? '外部' : '内部'}] ${item.title}: ${item.summary || '无摘要'}`
      ).join('\n');

      const params = {
        model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `你是一位资深的投资分析师。基于投资组合和综合新闻信息，提供专业的投资分析。
            请以JSON格式返回，包含：
            - summary: 投资组合综合分析（200字内）
            - recommendations: 具体投资建议数组（每个建议50字内，最多5个）
            - riskAssessment: 风险评估（low/medium/high/critical）
            - marketOutlook: 市场前景展望（150字内）
            - actionItems: 行动建议数组（每个建议30字内，最多3个）`
          },
          {
            role: 'user',
            content: `投资组合：${stocksText}\n\n相关新闻（包括内部和外部来源）：\n${newsText}\n\n请提供综合投资分析。`
          }
        ],
        max_tokens: 800,
        temperature: 0.3
      };

      const response = await OpenAILogger.loggedOpenAICall(
        this.openai, 
        'ReportService.generateEnhancedAIAnalysis', 
        params, 
        { 
          service: 'ReportService', 
          operation: 'generateEnhancedAIAnalysis',
          stockCount: stocks.length,
          newsCount: news.length 
        }
      );

      const result = JSON.parse(response.choices[0].message.content);
      return result;
    } catch (error) {
      console.error('Error generating enhanced AI analysis:', error);
      return {
        summary: '增强AI分析生成失败',
        recommendations: [],
        riskAssessment: 'unknown',
        marketOutlook: '分析生成失败',
        actionItems: []
      };
    }
  }

  /**
   * 生成主题深度研究报告
   */
  async generateTopicResearchReport(topic, days = 14) {
    try {
      // 搜索本地新闻
      const localNews = await DatabaseService.all(
        `SELECT * FROM news 
         WHERE (title LIKE ? OR content LIKE ? OR summary LIKE ?)
         AND created_at >= DATE('now', '-${days} days')
         ORDER BY created_at DESC
         LIMIT 30`,
        [`%${topic}%`, `%${topic}%`, `%${topic}%`]
      );

      // 搜索外部新闻
      const externalNews = await this.searchExternalNews(topic, days);
      
      // 合并所有新闻
      const allNews = [...localNews, ...externalNews];
      
      if (allNews.length === 0) {
        return {
          topic,
          summary: `未找到关于"${topic}"的相关新闻`,
          analysis: '数据不足，无法生成分析',
          newsCount: 0,
          news: [],
          sentiment: 0,
          trends: [],
          recommendations: []
        };
      }

      // 使用AI生成深度分析
      const deepAnalysis = await this.generateTopicDeepAnalysis(topic, allNews);
      
      // 计算情绪
      const sentiments = allNews.map(news => news.sentiment || 0);
      const avgSentiment = sentiments.length > 0 
        ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length 
        : 0;

      return {
        topic,
        dateRange: `过去${days}天`,
        newsCount: allNews.length,
        localNewsCount: localNews.length,
        externalNewsCount: externalNews.length,
        news: allNews.slice(0, 50),
        sentiment: avgSentiment,
        ...deepAnalysis,
        type: 'topic-research'
      };
    } catch (error) {
      console.error('Error generating topic research report:', error);
      throw error;
    }
  }

  /**
   * 生成主题深度分析
   */
  async generateTopicDeepAnalysis(topic, news) {
    if (!process.env.OPENAI_API_KEY || news.length === 0) {
      return {
        summary: `关于"${topic}"的分析数据不足`,
        analysis: '无法生成深度分析',
        trends: [],
        recommendations: []
      };
    }

    try {
      const newsText = news.slice(0, 20).map(item => 
        `[${item.external ? '外部' : '内部'}] ${item.title}: ${item.summary || '无摘要'}`
      ).join('\n');

      const params = {
        model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `你是一位专业的主题研究分析师。基于多源新闻数据，对特定主题进行深度分析。
            请以JSON格式返回，包含：
            - summary: 主题概况总结（200字内）
            - analysis: 深度分析（300字内）
            - trends: 关键趋势数组（每个趋势40字内，最多5个）
            - recommendations: 投资建议数组（每个建议50字内，最多5个）
            - riskFactors: 风险因素数组（每个因素40字内，最多3个）
            - opportunities: 机会点数组（每个机会40字内，最多3个）`
          },
          {
            role: 'user',
            content: `请深度分析主题"${topic}"：\n\n${newsText}`
          }
        ],
        max_tokens: 1000,
        temperature: 0.3
      };

      const response = await OpenAILogger.loggedOpenAICall(
        this.openai, 
        'ReportService.generateTopicDeepAnalysis', 
        params, 
        { 
          service: 'ReportService', 
          operation: 'generateTopicDeepAnalysis',
          topic: topic,
          newsCount: news.length 
        }
      );

      const result = JSON.parse(response.choices[0].message.content);
      return result;
    } catch (error) {
      console.error('Error generating topic deep analysis:', error);
      return {
        summary: `主题"${topic}"深度分析生成失败`,
        analysis: '分析生成失败',
        trends: [],
        recommendations: [],
        riskFactors: [],
        opportunities: []
      };
    }
  }
}

module.exports = new ReportService();
