/**
 * 增强报告服务使用示例
 * 
 * 本文件展示了如何使用新的ReportService和EmailService增强功能
 */

const ReportService = require('./services/ReportService');
const EmailService = require('./services/EmailService');

// 示例1：生成增强投资组合报告
async function example1_EnhancedPortfolioReport() {
  try {
    console.log('=== 示例1：生成增强投资组合报告 ===');
    
    const portfolioId = 1;
    const targetDate = new Date('2024-01-15'); // 可选，不传则使用当前日期
    
    // 生成增强报告
    const enhancedReport = await ReportService.generateEnhancedPortfolioReport(portfolioId, targetDate);
    
    console.log('报告基本信息：');
    console.log(`- 投资组合：${enhancedReport.portfolio.name}`);
    console.log(`- 股票数量：${enhancedReport.portfolio.stockCount}`);
    console.log(`- 内部新闻：${enhancedReport.portfolioNews.length}`);
    console.log(`- 外部新闻：${enhancedReport.totalExternalNews || 0}`);
    console.log(`- 市场情绪：${enhancedReport.marketSentiment.toFixed(2)}`);
    
    if (enhancedReport.enhancedAIAnalysis) {
      console.log('\n增强AI分析：');
      console.log(`- 风险评估：${enhancedReport.enhancedAIAnalysis.riskAssessment}`);
      console.log(`- 投资建议数量：${enhancedReport.enhancedAIAnalysis.recommendations?.length || 0}`);
    }
    
    return enhancedReport;
  } catch (error) {
    console.error('生成增强投资组合报告失败：', error.message);
  }
}

// 示例2：生成主题研究报告
async function example2_TopicResearchReport() {
  try {
    console.log('\n=== 示例2：生成主题研究报告 ===');
    
    const topic = '人工智能';
    const days = 14;
    
    // 生成主题报告
    const topicReport = await ReportService.generateTopicResearchReport(topic, days);
    
    console.log('主题报告信息：');
    console.log(`- 主题：${topicReport.topic}`);
    console.log(`- 时间范围：${topicReport.dateRange}`);
    console.log(`- 总新闻数：${topicReport.newsCount}`);
    console.log(`- 本地新闻：${topicReport.localNewsCount}`);
    console.log(`- 外部新闻：${topicReport.externalNewsCount}`);
    console.log(`- 情绪指数：${topicReport.sentiment.toFixed(2)}`);
    
    if (topicReport.trends && topicReport.trends.length > 0) {
      console.log('\n关键趋势：');
      topicReport.trends.forEach((trend, index) => {
        console.log(`${index + 1}. ${trend}`);
      });
    }
    
    if (topicReport.recommendations && topicReport.recommendations.length > 0) {
      console.log('\n投资建议：');
      topicReport.recommendations.forEach((rec, index) => {
        console.log(`${index + 1}. ${rec}`);
      });
    }
    
    return topicReport;
  } catch (error) {
    console.error('生成主题研究报告失败：', error.message);
  }
}

// 示例3：发送增强投资组合报告邮件
async function example3_SendEnhancedPortfolioEmail() {
  try {
    console.log('\n=== 示例3：发送增强投资组合报告邮件 ===');
    
    const emailService = EmailService;
    const portfolioId = 1;
    const recipients = ['investor1@example.com', 'investor2@example.com'];
    
    // 发送增强报告
    const results = await emailService.sendEnhancedPortfolioReport(
      portfolioId, 
      recipients,
      new Date() // 目标日期，可选
    );
    
    console.log('发送结果：');
    console.log(`- 总计：${recipients.length}`);
    console.log(`- 成功：${results.filter(r => r.status === 'sent').length}`);
    console.log(`- 失败：${results.filter(r => r.status === 'failed').length}`);
    
    results.forEach(result => {
      console.log(`  ${result.email}: ${result.status}`);
      if (result.error) {
        console.log(`    错误: ${result.error}`);
      }
    });
    
    return results;
  } catch (error) {
    console.error('发送增强投资组合报告失败：', error.message);
  }
}

// 示例4：发送主题研究报告邮件
async function example4_SendTopicResearchEmail() {
  try {
    console.log('\n=== 示例4：发送主题研究报告邮件 ===');
    
    const emailService = EmailService;
    const topic = '新能源汽车';
    const days = 7;
    const recipients = ['analyst1@example.com', 'analyst2@example.com'];
    
    // 发送主题报告
    const results = await emailService.sendTopicResearchReport(recipients, topic, days);
    
    console.log('发送结果：');
    console.log(`- 主题：${topic}`);
    console.log(`- 时间范围：${days}天`);
    console.log(`- 总计：${recipients.length}`);
    console.log(`- 成功：${results.filter(r => r.status === 'sent').length}`);
    console.log(`- 失败：${results.filter(r => r.status === 'failed').length}`);
    
    return results;
  } catch (error) {
    console.error('发送主题研究报告失败：', error.message);
  }
}

// 示例5：批量发送增强版日报
async function example5_SendEnhancedDailyReport() {
  try {
    console.log('\n=== 示例5：批量发送增强版日报 ===');
    
    const emailService = EmailService;
    
    // 发送增强版日报给所有订阅者
    const results = await emailService.sendDailyReport(true); // true 表示使用增强模式
    
    console.log('增强日报发送结果：');
    console.log(`- 总订阅者：${results.total}`);
    console.log(`- 投资组合订阅：${results.portfolioSubscriptions}`);
    console.log(`- 通用订阅：${results.generalSubscriptions}`);
    
    return results;
  } catch (error) {
    console.error('发送增强版日报失败：', error.message);
  }
}

// 示例6：向投资组合订阅者发送增强报告
async function example6_SendEnhancedReportToSubscribers() {
  try {
    console.log('\n=== 示例6：向投资组合订阅者发送增强报告 ===');
    
    const emailService = EmailService;
    const portfolioId = 1;
    
    // 发送给该投资组合的所有订阅者
    const results = await emailService.sendEnhancedReportToSubscribers(portfolioId);
    
    console.log('发送结果：');
    console.log(`- 投资组合：${results.portfolioName}`);
    console.log(`- 订阅者总数：${results.total}`);
    console.log(`- 发送成功：${results.sent}`);
    console.log(`- 发送失败：${results.failed}`);
    
    return results;
  } catch (error) {
    console.error('向投资组合订阅者发送增强报告失败：', error.message);
  }
}

// 示例7：向通用订阅者发送主题报告
async function example7_SendTopicReportToSubscribers() {
  try {
    console.log('\n=== 示例7：向通用订阅者发送主题报告 ===');
    
    const emailService = EmailService;
    const topic = '区块链技术';
    const days = 14;
    
    // 发送给所有通用订阅者
    const results = await emailService.sendTopicReportToSubscribers(topic, days);
    
    console.log('发送结果：');
    console.log(`- 主题：${topic}`);
    console.log(`- 订阅者总数：${results.total}`);
    console.log(`- 发送成功：${results.sent}`);
    console.log(`- 发送失败：${results.failed}`);
    
    return results;
  } catch (error) {
    console.error('向通用订阅者发送主题报告失败：', error.message);
  }
}

// 示例8：外部新闻搜索
async function example8_SearchExternalNews() {
  try {
    console.log('\n=== 示例8：外部新闻搜索 ===');
    
    const query = '特斯拉 Tesla';
    const days = 7;
    
    // 搜索外部新闻
    const externalNews = await ReportService.searchExternalNews(query, days);
    
    console.log('外部新闻搜索结果：');
    console.log(`- 查询：${query}`);
    console.log(`- 时间范围：${days}天`);
    console.log(`- 找到新闻：${externalNews.length}条`);
    
    // 显示前3条新闻
    externalNews.slice(0, 3).forEach((news, index) => {
      console.log(`\n${index + 1}. ${news.title}`);
      console.log(`   来源：${news.source}`);
      console.log(`   发布时间：${new Date(news.publishedAt).toLocaleString()}`);
      console.log(`   摘要：${news.summary?.substring(0, 100)}...`);
    });
    
    return externalNews;
  } catch (error) {
    console.error('搜索外部新闻失败：', error.message);
  }
}

// 主函数：运行所有示例
async function runAllExamples() {
  console.log('🚀 开始运行增强报告服务示例\n');
  
  try {
    // 运行所有示例
    await example1_EnhancedPortfolioReport();
    await example2_TopicResearchReport();
    
    // 注意：以下示例会发送真实邮件，请谨慎使用
    // await example3_SendEnhancedPortfolioEmail();
    // await example4_SendTopicResearchEmail();
    // await example5_SendEnhancedDailyReport();
    // await example6_SendEnhancedReportToSubscribers();
    // await example7_SendTopicReportToSubscribers();
    
    await example8_SearchExternalNews();
    
    console.log('\n✅ 所有示例运行完成');
  } catch (error) {
    console.error('❌ 示例运行失败：', error.message);
  }
}

// 导出示例函数，以便在其他地方使用
module.exports = {
  example1_EnhancedPortfolioReport,
  example2_TopicResearchReport,
  example3_SendEnhancedPortfolioEmail,
  example4_SendTopicResearchEmail,
  example5_SendEnhancedDailyReport,
  example6_SendEnhancedReportToSubscribers,
  example7_SendTopicReportToSubscribers,
  example8_SearchExternalNews,
  runAllExamples
};

// 如果直接运行此文件，执行所有示例
if (require.main === module) {
  runAllExamples();
}
