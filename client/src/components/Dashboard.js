import React from 'react';
import { Card, Row, Col, Statistic, List, Typography, Alert, Spin } from 'antd';
import { useQuery } from 'react-query';
import {
  RiseOutlined,
  FallOutlined,
  FileTextOutlined,
  PieChartOutlined,
  MailOutlined
} from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const Dashboard = () => {
  // 获取新闻数据
  const { data: newsData, isLoading: newsLoading } = useQuery(
    'recent-news',
    () => axios.get('/api/news?limit=5').then(res => res.data),
    { refetchInterval: 300000 } // 每5分钟刷新
  );

  // 获取投资组合统计
  const { data: portfolioStats, isLoading: portfolioLoading } = useQuery(
    'portfolio-stats',
    () => axios.get('/api/portfolio/stats').then(res => res.data)
  );

  // 获取新闻统计
  const { data: newsStats, isLoading: newsStatsLoading } = useQuery(
    'news-stats',
    () => axios.get('/api/news/stats/sentiment').then(res => res.data)
  );

  // 获取邮件统计
  const { data: emailStats, isLoading: emailStatsLoading } = useQuery(
    'email-stats',
    () => axios.get('/api/subscriptions/email/stats').then(res => res.data)
  );

  const getSentimentIcon = (sentiment) => {
    if (sentiment > 0.1) return <RiseOutlined style={{ color: '#52c41a' }} />;
    if (sentiment < -0.1) return <FallOutlined style={{ color: '#ff4d4f' }} />;
    return <FileTextOutlined style={{ color: '#faad14' }} />;
  };

  const getSentimentText = (sentiment) => {
    if (sentiment > 0.1) return '乐观';
    if (sentiment < -0.1) return '谨慎';
    return '中性';
  };

  const getSentimentColor = (sentiment) => {
    if (sentiment > 0.1) return '#52c41a';
    if (sentiment < -0.1) return '#ff4d4f';
    return '#faad14';
  };

  if (newsLoading || portfolioLoading || newsStatsLoading || emailStatsLoading) {
    return (
      <div className="loading-container">
        <Spin size="large" tip="加载数据中..." />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <Title level={2} className="page-title">仪表板</Title>
        <Text className="page-description">
          欢迎使用市场日报系统，这里是您的投资信息中心
        </Text>
      </div>

      {/* 统计卡片 */}
      <Row gutter={[24, 24]} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="投资组合股票"
              value={portfolioStats?.totalStocks || 0}
              prefix={<PieChartOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="今日新闻"
              value={newsData?.news?.length || 0}
              prefix={<FileTextOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="市场情绪"
              value={getSentimentText(newsStats?.overall?.avgSentiment || 0)}
              prefix={getSentimentIcon(newsStats?.overall?.avgSentiment || 0)}
              valueStyle={{ color: getSentimentColor(newsStats?.overall?.avgSentiment || 0) }}
            />
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="邮件发送成功率"
              value={emailStats?.total?.total > 0 
                ? Math.round((emailStats.total.sent / emailStats.total.total) * 100)
                : 0
              }
              suffix="%"
              prefix={<MailOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[24, 24]}>
        {/* 最新新闻 */}
        <Col xs={24} lg={16}>
          <Card title="最新资讯" extra={<Text type="secondary">最近更新</Text>}>
            {newsData?.news?.length > 0 ? (
              <List
                itemLayout="vertical"
                dataSource={newsData.news}
                renderItem={(item) => (
                  <List.Item key={item.id}>
                    <div className="news-item">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="news-title"
                      >
                        {item.title}
                      </a>
                      
                      <div className="news-meta">
                        <span>来源：{item.source}</span>
                        <span>时间：{dayjs(item.created_at).format('MM-DD HH:mm')}</span>
                        {item.sentiment !== null && (
                          <span className={`sentiment-${getSentimentText(item.sentiment)}`}>
                            {getSentimentIcon(item.sentiment)} {getSentimentText(item.sentiment)}
                          </span>
                        )}
                      </div>
                      
                      {item.summary && (
                        <div className="news-summary">
                          {item.summary}
                        </div>
                      )}
                      
                      {item.symbols && JSON.parse(item.symbols).length > 0 && (
                        <div className="news-tags">
                          {JSON.parse(item.symbols).map(symbol => (
                            <span key={symbol} className="portfolio-stock">
                              {symbol}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </List.Item>
                )}
              />
            ) : (
              <div className="empty-state">
                <FileTextOutlined style={{ fontSize: '48px', color: '#d9d9d9', marginBottom: '16px' }} />
                <div>暂无新闻数据</div>
              </div>
            )}
          </Card>
        </Col>

        {/* 侧边栏信息 */}
        <Col xs={24} lg={8}>
          {/* 行业分布 */}
          {portfolioStats?.sectorDistribution?.length > 0 && (
            <Card title="行业分布" style={{ marginBottom: '24px' }}>
              <List
                size="small"
                dataSource={portfolioStats.sectorDistribution}
                renderItem={(item) => (
                  <List.Item>
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                      <span>{item.sector || '未分类'}</span>
                      <Text strong>{item.count} 只</Text>
                    </div>
                  </List.Item>
                )}
              />
            </Card>
          )}

          {/* 系统状态 */}
          <Card title="系统状态">
            <div style={{ marginBottom: '16px' }}>
              <Alert
                message="新闻更新正常"
                description="每小时自动获取最新财经新闻"
                type="success"
                showIcon
                style={{ marginBottom: '8px' }}
              />
              
              <Alert
                message="邮件服务正常"
                description="每个工作日早上8点自动发送日报"
                type="info"
                showIcon
              />
            </div>
            
            <div>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                上次更新：{dayjs().format('YYYY-MM-DD HH:mm:ss')}
              </Text>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
