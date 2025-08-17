import React, { useState } from 'react';
import { 
  Card, 
  Form, 
  Input, 
  Button, 
  Select, 
  InputNumber, 
  TextArea, 
  Space, 
  message, 
  Divider,
  Typography,
  Alert
} from 'antd';
import { 
  SendOutlined, 
  ExperimentOutlined, 
  SearchOutlined,
  MailOutlined,
  RocketOutlined
} from '@ant-design/icons';
import { useQueryClient } from 'react-query';
import axios from 'axios';

const { Title, Text } = Typography;
const { Option } = Select;

const EnhancedReportsManager = () => {
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [activeTab, setActiveTab] = useState('enhanced-portfolio');
  const queryClient = useQueryClient();

  // 发送增强投资组合报告
  const handleSendEnhancedPortfolioReport = async (values) => {
    setLoading(true);
    try {
      const emails = values.emails.split('\n').map(email => email.trim()).filter(email => email);
      const response = await axios.post('/api/enhanced-reports/enhanced-portfolio-report', {
        portfolioId: values.portfolioId,
        emails,
        date: values.date
      });
      
      message.success(`增强投资组合报告发送成功！发送至 ${response.data.sent} 个邮箱`);
      
      // 刷新报告列表
      queryClient.invalidateQueries('reports');
    } catch (error) {
      message.error(error.response?.data?.error || '发送失败');
    } finally {
      setLoading(false);
    }
  };

  // 发送主题研究报告
  const handleSendTopicReport = async (values) => {
    setLoading(true);
    try {
      const emails = values.emails.split('\n').map(email => email.trim()).filter(email => email);
      const response = await axios.post('/api/enhanced-reports/topic-research-report', {
        topic: values.topic,
        emails,
        days: values.days || 14
      });
      
      message.success(`主题研究报告发送成功！发送至 ${response.data.sent} 个邮箱`);
      
      // 刷新报告列表
      queryClient.invalidateQueries('reports');
    } catch (error) {
      message.error(error.response?.data?.error || '发送失败');
    } finally {
      setLoading(false);
    }
  };

  // 预览增强投资组合报告
  const handlePreviewEnhancedReport = async (portfolioId, date) => {
    setLoading(true);
    try {
      const response = await axios.get(
        `/api/enhanced-reports/enhanced-portfolio-report/${portfolioId}/preview`,
        { params: { date } }
      );
      
      setPreviewData(response.data.data);
      message.success('报告预览生成成功');
      
      // 刷新报告列表，因为预览也会创建报告记录
      queryClient.invalidateQueries('reports');
    } catch (error) {
      message.error(error.response?.data?.error || '预览生成失败');
    } finally {
      setLoading(false);
    }
  };

  // 预览主题研究报告
  const handlePreviewTopicReport = async (topic, days) => {
    setLoading(true);
    try {
      const response = await axios.get('/api/enhanced-reports/topic-research-report/preview', {
        params: { topic, days: days || 14 }
      });
      
      setPreviewData(response.data.data);
      message.success('主题报告预览生成成功');
      
      // 刷新报告列表，因为预览也会创建报告记录
      queryClient.invalidateQueries('reports');
    } catch (error) {
      message.error(error.response?.data?.error || '预览生成失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px' }}>
      <Title level={2}>
        <RocketOutlined /> 增强报告管理器
      </Title>
      
      <Alert
        message="新功能介绍"
        description="增强报告集成了外部数据源和AI分析，提供更全面的市场洞察和投资建议。"
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <div style={{ display: 'flex', gap: 20 }}>
        {/* 左侧功能面板 */}
        <div style={{ flex: 1 }}>
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            
            {/* 增强投资组合报告 */}
            <Card 
              title={
                <span>
                  <ExperimentOutlined /> 增强投资组合报告
                </span>
              }
              extra={
                <Button 
                  type="link" 
                  onClick={() => setActiveTab(activeTab === 'enhanced-portfolio' ? '' : 'enhanced-portfolio')}
                >
                  {activeTab === 'enhanced-portfolio' ? '收起' : '展开'}
                </Button>
              }
            >
              {activeTab === 'enhanced-portfolio' && (
                <Form onFinish={handleSendEnhancedPortfolioReport} layout="vertical">
                  <Form.Item
                    name="portfolioId"
                    label="投资组合ID"
                    rules={[{ required: true, message: '请输入投资组合ID' }]}
                  >
                    <InputNumber 
                      style={{ width: '100%' }} 
                      placeholder="输入投资组合ID"
                      min={1}
                    />
                  </Form.Item>
                  
                  <Form.Item
                    name="emails"
                    label="邮件地址（每行一个）"
                    rules={[{ required: true, message: '请输入邮件地址' }]}
                  >
                    <TextArea 
                      rows={4} 
                      placeholder="user1@example.com&#10;user2@example.com"
                    />
                  </Form.Item>
                  
                  <Form.Item name="date" label="指定日期（可选）">
                    <Input type="date" />
                  </Form.Item>

                  <Space>
                    <Button 
                      type="primary" 
                      htmlType="submit" 
                      loading={loading}
                      icon={<SendOutlined />}
                    >
                      发送增强报告
                    </Button>
                    <Button 
                      onClick={() => {
                        const portfolioId = document.querySelector('input[placeholder="输入投资组合ID"]').value;
                        const date = document.querySelector('input[type="date"]').value;
                        if (portfolioId) {
                          handlePreviewEnhancedReport(portfolioId, date);
                        } else {
                          message.warning('请先输入投资组合ID');
                        }
                      }}
                      loading={loading}
                      icon={<SearchOutlined />}
                    >
                      预览报告
                    </Button>
                  </Space>
                </Form>
              )}
            </Card>

            {/* 主题研究报告 */}
            <Card 
              title={
                <span>
                  <SearchOutlined /> 主题研究报告
                </span>
              }
              extra={
                <Button 
                  type="link" 
                  onClick={() => setActiveTab(activeTab === 'topic-research' ? '' : 'topic-research')}
                >
                  {activeTab === 'topic-research' ? '收起' : '展开'}
                </Button>
              }
            >
              {activeTab === 'topic-research' && (
                <Form onFinish={handleSendTopicReport} layout="vertical">
                  <Form.Item
                    name="topic"
                    label="研究主题"
                    rules={[{ required: true, message: '请输入研究主题' }]}
                  >
                    <Input placeholder="例如：人工智能、新能源、生物科技" />
                  </Form.Item>
                  
                  <Form.Item
                    name="days"
                    label="时间范围（天）"
                    initialValue={14}
                  >
                    <InputNumber min={1} max={30} style={{ width: '100%' }} />
                  </Form.Item>
                  
                  <Form.Item
                    name="emails"
                    label="邮件地址（每行一个）"
                    rules={[{ required: true, message: '请输入邮件地址' }]}
                  >
                    <TextArea 
                      rows={4} 
                      placeholder="user1@example.com&#10;user2@example.com"
                    />
                  </Form.Item>

                  <Space>
                    <Button 
                      type="primary" 
                      htmlType="submit" 
                      loading={loading}
                      icon={<MailOutlined />}
                    >
                      发送主题报告
                    </Button>
                    <Button 
                      onClick={() => {
                        const topic = document.querySelector('input[placeholder*="人工智能"]').value;
                        const days = document.querySelector('input[type="number"]').value;
                        if (topic) {
                          handlePreviewTopicReport(topic, days);
                        } else {
                          message.warning('请先输入研究主题');
                        }
                      }}
                      loading={loading}
                      icon={<SearchOutlined />}
                    >
                      预览报告
                    </Button>
                  </Space>
                </Form>
              )}
            </Card>

            {/* 批量操作 */}
            <Card title={<span><SendOutlined /> 批量操作</span>}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Button 
                  size="large" 
                  block 
                  onClick={async () => {
                    setLoading(true);
                    try {
                      const response = await axios.post('/api/enhanced-reports/send-enhanced-daily-report');
                      message.success(`增强日报发送完成！总计 ${response.data.total} 个订阅者`);
                    } catch (error) {
                      message.error(error.response?.data?.error || '发送失败');
                    } finally {
                      setLoading(false);
                    }
                  }}
                  loading={loading}
                >
                  发送增强版日报给所有订阅者
                </Button>
                
                <Text type="secondary" style={{ fontSize: 12 }}>
                  注意：此操作将向所有活跃订阅者发送增强版投资组合报告和综合市场报告
                </Text>
              </Space>
            </Card>

          </Space>
        </div>

        {/* 右侧预览面板 */}
        <div style={{ flex: 1 }}>
          <Card title="报告预览" style={{ height: '600px', overflow: 'auto' }}>
            {previewData ? (
              <div>
                <Title level={4}>{previewData.topic || previewData.portfolio?.name}</Title>
                
                {previewData.summary && (
                  <div style={{ marginBottom: 16 }}>
                    <Text strong>概况：</Text>
                    <div>{previewData.summary}</div>
                  </div>
                )}
                
                {previewData.analysis && (
                  <div style={{ marginBottom: 16 }}>
                    <Text strong>分析：</Text>
                    <div>{previewData.analysis}</div>
                  </div>
                )}
                
                {previewData.newsCount && (
                  <div style={{ marginBottom: 16 }}>
                    <Text strong>新闻数量：</Text> {previewData.newsCount}
                    {previewData.externalNewsCount && (
                      <span> (外部: {previewData.externalNewsCount})</span>
                    )}
                  </div>
                )}
                
                {previewData.marketSentiment !== undefined && (
                  <div style={{ marginBottom: 16 }}>
                    <Text strong>市场情绪：</Text> 
                    <span style={{ 
                      color: previewData.marketSentiment > 0.1 ? 'green' : 
                             previewData.marketSentiment < -0.1 ? 'red' : 'orange' 
                    }}>
                      {previewData.marketSentiment?.toFixed(2)} 
                      ({previewData.marketSentiment > 0.1 ? '乐观' : 
                        previewData.marketSentiment < -0.1 ? '谨慎' : '中性'})
                    </span>
                  </div>
                )}
                
                {previewData.enhancedAIAnalysis && (
                  <div style={{ marginBottom: 16 }}>
                    <Divider>增强AI分析</Divider>
                    <div><Text strong>风险评估：</Text> {previewData.enhancedAIAnalysis.riskAssessment}</div>
                    <div><Text strong>市场展望：</Text> {previewData.enhancedAIAnalysis.marketOutlook}</div>
                  </div>
                )}
                
                {previewData.trends && previewData.trends.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <Text strong>关键趋势：</Text>
                    <ul>
                      {previewData.trends.map((trend, index) => (
                        <li key={index}>{trend}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {previewData.recommendations && previewData.recommendations.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <Text strong>投资建议：</Text>
                    <ul>
                      {previewData.recommendations.map((rec, index) => (
                        <li key={index}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: '#999', paddingTop: '100px' }}>
                <SearchOutlined style={{ fontSize: 48, marginBottom: 16 }} />
                <div>点击预览按钮查看报告内容</div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

export default EnhancedReportsManager;
