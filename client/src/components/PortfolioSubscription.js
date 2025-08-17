import React, { useState } from 'react';
import { 
  Card, 
  Button, 
  Form, 
  Input, 
  message, 
  Space, 
  Typography,
  Tag,
  List,
  Divider,
  Row,
  Col
} from 'antd';
import { 
  MailOutlined,
  UserOutlined,
  StockOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import { useQuery, useMutation } from 'react-query';
import axios from 'axios';

const { Title, Text, Paragraph } = Typography;

const PortfolioSubscription = () => {
  const [form] = Form.useForm();
  const [subscribed, setSubscribed] = useState(false);

  // 获取公开投资组合列表
  const { data: publicPortfolios = [], isLoading } = useQuery(
    'public-portfolios',
    () => axios.get('/api/portfolios/public/list').then(res => res.data)
  );

  // 订阅投资组合
  const subscribeMutation = useMutation(
    (data) => axios.post('/api/subscriptions', data),
    {
      onSuccess: () => {
        message.success('订阅成功！您将开始接收相关投资组合的市场报告');
        setSubscribed(true);
        form.resetFields();
      },
      onError: (error) => {
        if (error.response?.data?.error === 'Already subscribed') {
          message.warning('您已经订阅过此投资组合');
        } else {
          message.error(error.response?.data?.error || '订阅失败');
        }
      }
    }
  );

  const handleSubscribe = (portfolioId = null) => {
    form.validateFields().then((values) => {
      subscribeMutation.mutate({
        email: values.email,
        portfolio_id: portfolioId
      });
    });
  };

  if (subscribed) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 20px' }}>
        <Card style={{ textAlign: 'center', padding: '40px' }}>
          <CheckCircleOutlined style={{ fontSize: '64px', color: '#52c41a', marginBottom: '24px' }} />
          <Title level={2}>订阅成功！</Title>
          <Paragraph>
            感谢您的订阅！您将定期收到精选的市场报告和投资组合动态。
          </Paragraph>
          <Button type="primary" onClick={() => setSubscribed(false)}>
            继续订阅其他组合
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <Title level={1}>📊 投资组合订阅</Title>
        <Paragraph style={{ fontSize: '16px', color: '#666' }}>
          订阅感兴趣的投资组合，获取个性化的市场分析报告
        </Paragraph>
      </div>

      {/* 通用订阅 */}
      <Card style={{ marginBottom: '32px' }}>
        <Row gutter={32} align="middle">
          <Col span={16}>
            <Space direction="vertical" size="small">
              <Title level={3} style={{ margin: 0 }}>
                <MailOutlined style={{ color: '#1890ff', marginRight: '8px' }} />
                综合市场日报
              </Title>
              <Paragraph style={{ margin: 0, color: '#666' }}>
                订阅综合市场日报，获取最新的市场动态、热点新闻和行业分析
              </Paragraph>
              <Space>
                <Tag color="blue">每日推送</Tag>
                <Tag color="green">综合分析</Tag>
                <Tag color="orange">市场热点</Tag>
              </Space>
            </Space>
          </Col>
          <Col span={8} style={{ textAlign: 'right' }}>
            <Form form={form} layout="inline">
              <Form.Item
                name="email"
                rules={[
                  { required: true, message: '请输入邮件地址' },
                  { type: 'email', message: '请输入有效的邮件地址' }
                ]}
              >
                <Input
                  placeholder="输入您的邮件地址"
                  prefix={<UserOutlined />}
                  style={{ width: '200px' }}
                />
              </Form.Item>
              <Form.Item>
                <Button
                  type="primary"
                  onClick={() => handleSubscribe()}
                  loading={subscribeMutation.isLoading}
                >
                  订阅综合日报
                </Button>
              </Form.Item>
            </Form>
          </Col>
        </Row>
      </Card>

      <Divider>
        <Text style={{ color: '#666', fontSize: '16px' }}>
          或选择特定投资组合订阅
        </Text>
      </Divider>

      {/* 公开投资组合列表 */}
      <List
        loading={isLoading}
        grid={{
          gutter: 16,
          xs: 1,
          sm: 1,
          md: 2,
          lg: 2,
          xl: 3,
          xxl: 3,
        }}
        dataSource={publicPortfolios}
        renderItem={(portfolio) => (
          <List.Item>
            <Card
              hoverable
              actions={[
                <Button
                  type="primary"
                  onClick={() => handleSubscribe(portfolio.id)}
                  loading={subscribeMutation.isLoading}
                  block
                >
                  订阅此组合
                </Button>
              ]}
            >
              <Card.Meta
                avatar={<StockOutlined style={{ fontSize: '24px', color: '#1890ff' }} />}
                title={portfolio.name}
                description={
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    <Text type="secondary">
                      {portfolio.description || '暂无描述'}
                    </Text>
                    <Space>
                      <Tag color="blue">{portfolio.stock_count} 只股票</Tag>
                      <Tag color="green">
                        创建者: {portfolio.owner_email?.split('@')[0] || '未知'}
                      </Tag>
                    </Space>
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      创建时间: {new Date(portfolio.created_at).toLocaleDateString()}
                    </Text>
                  </Space>
                }
              />
            </Card>
          </List.Item>
        )}
        locale={{
          emptyText: (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <StockOutlined style={{ fontSize: '48px', color: '#d9d9d9', marginBottom: '16px' }} />
              <Title level={4} style={{ color: '#d9d9d9' }}>暂无公开投资组合</Title>
              <Text type="secondary">管理员还未创建公开的投资组合</Text>
            </div>
          )
        }}
      />

      {/* 底部说明 */}
      <Card style={{ marginTop: '40px', backgroundColor: '#fafafa' }}>
        <Title level={4}>📧 关于邮件订阅</Title>
        <Row gutter={32}>
          <Col span={8}>
            <Space direction="vertical" size="small">
              <Text strong>📅 推送频率</Text>
              <Text type="secondary">每个工作日早上8点定时推送</Text>
            </Space>
          </Col>
          <Col span={8}>
            <Space direction="vertical" size="small">
              <Text strong>📊 内容包含</Text>
              <Text type="secondary">相关新闻、市场分析、情绪指标</Text>
            </Space>
          </Col>
          <Col span={8}>
            <Space direction="vertical" size="small">
              <Text strong>🚫 取消订阅</Text>
              <Text type="secondary">邮件底部包含取消订阅链接</Text>
            </Space>
          </Col>
        </Row>
      </Card>
    </div>
  );
};

export default PortfolioSubscription;
