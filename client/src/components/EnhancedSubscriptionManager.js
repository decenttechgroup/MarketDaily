import React, { useState } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  message,
  Space,
  Typography,
  Popconfirm,
  Tag,
  Row,
  Col,
  Statistic,
  DatePicker,
  Tabs,
  List,
  Avatar,
  Empty
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  MailOutlined,
  UserAddOutlined,
  TeamOutlined,
  PieChartOutlined,
  SendOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { TextArea } = Input;
const { RangePicker } = DatePicker;

const EnhancedSubscriptionManager = () => {
  const [activeTab, setActiveTab] = useState('subscriptions');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isBatchModalVisible, setIsBatchModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [batchForm] = Form.useForm();
  const queryClient = useQueryClient();

  // 获取邮件订阅列表
  const { data: subscriptions = [], isLoading } = useQuery(
    'subscriptions',
    () => axios.get('/api/subscriptions').then(res => res.data)
  );

  // 获取公开投资组合列表
  const { data: publicPortfolios = [] } = useQuery(
    'public-portfolios',
    () => axios.get('/api/portfolios/public/list').then(res => res.data)
  );

  // 获取邮件发送统计
  const { data: emailStats } = useQuery(
    'email-stats',
    () => axios.get('/api/email/stats').then(res => res.data)
  );

  // 获取邮件发送日志
  const { data: emailLogs = [], isLoading: logsLoading } = useQuery(
    'email-logs',
    () => axios.get('/api/email/logs', { params: { limit: 50 } }).then(res => res.data.logs)
  );

  // 添加订阅
  const addSubscriptionMutation = useMutation(
    (data) => axios.post('/api/subscriptions', data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('subscriptions');
        message.success('邮件订阅添加成功');
        setIsModalVisible(false);
        form.resetFields();
      },
      onError: (error) => {
        if (error.response?.data?.error === 'Already subscribed') {
          message.warning('该邮箱已经订阅过此投资组合');
        } else {
          message.error(error.response?.data?.error || '添加失败');
        }
      }
    }
  );

  // 批量添加订阅
  const batchAddMutation = useMutation(
    (data) => axios.post('/api/subscriptions/batch', data),
    {
      onSuccess: (response) => {
        queryClient.invalidateQueries('subscriptions');
        const { added, errors } = response.data;
        message.success(`成功添加 ${added.length} 个订阅`);
        if (errors.length > 0) {
          message.warning(`${errors.length} 个邮箱添加失败`);
        }
        setIsBatchModalVisible(false);
        batchForm.resetFields();
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '批量添加失败');
      }
    }
  );

  // 删除订阅
  const deleteSubscriptionMutation = useMutation(
    ({ email, portfolioId }) => axios.delete('/api/subscriptions/unsubscribe', {
      data: { email, portfolio_id: portfolioId }
    }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('subscriptions');
        message.success('订阅删除成功');
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '删除失败');
      }
    }
  );

  // 发送测试邮件
  const sendTestEmailMutation = useMutation(
    () => axios.post('/api/email/send-daily'),
    {
      onSuccess: () => {
        message.success('日报发送任务已启动，请查看邮件日志');
        queryClient.invalidateQueries('email-logs');
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '发送失败');
      }
    }
  );

  const handleAddSubscription = () => {
    setIsModalVisible(true);
    form.resetFields();
  };

  const handleModalOk = () => {
    form.validateFields().then((values) => {
      addSubscriptionMutation.mutate(values);
    });
  };

  const handleBatchModalOk = () => {
    batchForm.validateFields().then((values) => {
      const emails = values.emails.split('\n').map(email => email.trim()).filter(email => email);
      batchAddMutation.mutate({
        emails,
        portfolio_id: values.portfolio_id
      });
    });
  };

  const handleDeleteSubscription = (record) => {
    deleteSubscriptionMutation.mutate({
      email: record.email,
      portfolioId: record.portfolio_id
    });
  };

  const handleSendTestEmail = () => {
    sendTestEmailMutation.mutate();
  };

  const subscriptionColumns = [
    {
      title: '邮件地址',
      dataIndex: 'email',
      key: 'email',
      render: (email) => (
        <Space>
          <Avatar size="small" icon={<MailOutlined />} />
          {email}
        </Space>
      )
    },
    {
      title: '订阅组合',
      dataIndex: 'portfolio_name',
      key: 'portfolio_name',
      render: (name) => name ? (
        <Tag color="blue">{name}</Tag>
      ) : (
        <Tag color="purple">综合日报</Tag>
      )
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (isActive) => (
        <Tag color={isActive ? 'green' : 'red'} icon={isActive ? <CheckCircleOutlined /> : <CloseCircleOutlined />}>
          {isActive ? '活跃' : '暂停'}
        </Tag>
      )
    },
    {
      title: '订阅时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date) => dayjs(date).format('YYYY-MM-DD HH:mm')
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Popconfirm
            title="确定要删除这个订阅吗？"
            onConfirm={() => handleDeleteSubscription(record)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  const emailLogColumns = [
    {
      title: '接收者',
      dataIndex: 'recipient',
      key: 'recipient',
      width: '25%'
    },
    {
      title: '主题',
      dataIndex: 'subject',
      key: 'subject',
      width: '35%'
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: '15%',
      render: (status) => (
        <Tag color={status === 'sent' ? 'green' : status === 'failed' ? 'red' : 'orange'}>
          {status === 'sent' ? '已发送' : status === 'failed' ? '失败' : '待发送'}
        </Tag>
      )
    },
    {
      title: '发送时间',
      dataIndex: 'sent_at',
      key: 'sent_at',
      width: '15%',
      render: (date) => dayjs(date).format('MM-DD HH:mm')
    },
    {
      title: '错误信息',
      dataIndex: 'error_message',
      key: 'error_message',
      width: '10%',
      render: (error) => error ? (
        <Text type="danger" ellipsis={{ tooltip: error }}>
          查看错误
        </Text>
      ) : '-'
    }
  ];

  // 计算统计数据
  const totalSubscriptions = subscriptions.length;
  const activeSubscriptions = subscriptions.filter(sub => sub.is_active).length;
  const portfolioSubscriptions = subscriptions.filter(sub => sub.portfolio_id).length;
  const generalSubscriptions = subscriptions.filter(sub => !sub.portfolio_id).length;

  return (
    <div>
      <div className="page-header">
        <Title level={2} className="page-title">增强订阅管理</Title>
        <Text className="page-description">
          管理邮件订阅用户，监控邮件发送状态，支持批量操作
        </Text>
      </div>

      <Tabs 
        activeKey={activeTab} 
        onChange={setActiveTab}
        items={[
          {
            key: 'subscriptions',
            label: '订阅管理',
            children: (
              <>
                <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
                  <Col span={6}>
                    <Card>
                      <Statistic
                        title="总订阅数"
                        value={totalSubscriptions}
                        prefix={<TeamOutlined />}
                        valueStyle={{ color: '#1890ff' }}
                      />
                    </Card>
                  </Col>
                  <Col span={6}>
                    <Card>
                      <Statistic
                        title="活跃订阅"
                        value={activeSubscriptions}
                        prefix={<CheckCircleOutlined />}
                        valueStyle={{ color: '#52c41a' }}
                      />
                    </Card>
                  </Col>
                  <Col span={6}>
                    <Card>
                      <Statistic
                        title="投资组合订阅"
                        value={portfolioSubscriptions}
                        prefix={<PieChartOutlined />}
                        valueStyle={{ color: '#722ed1' }}
                      />
                    </Card>
                  </Col>
                  <Col span={6}>
                    <Card>
                      <Statistic
                        title="综合日报订阅"
                        value={generalSubscriptions}
                        prefix={<MailOutlined />}
                        valueStyle={{ color: '#fa8c16' }}
                      />
                    </Card>
                  </Col>
                </Row>

                <Card
                  title="邮件订阅列表"
                  extra={
                    <Space>
                      <Button
                        icon={<UserAddOutlined />}
                        onClick={() => setIsBatchModalVisible(true)}
                      >
                        批量添加
                      </Button>
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={handleAddSubscription}
                      >
                        添加订阅
                      </Button>
                    </Space>
                  }
                >
                  <Table
                    columns={subscriptionColumns}
                    dataSource={subscriptions}
                    rowKey={(record) => `${record.email}_${record.portfolio_id || 'general'}`}
                    loading={isLoading}
                    pagination={{
                      showSizeChanger: true,
                      showQuickJumper: true,
                      showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`
                    }}
                  />
                </Card>
              </>
            )
          },
          {
            key: 'logs',
            label: '邮件日志',
            children: (
              <Card
                title="邮件发送日志"
                extra={
                  <Space>
                    <Button
                      type="primary"
                      icon={<SendOutlined />}
                      onClick={handleSendTestEmail}
                      loading={sendTestEmailMutation.isLoading}
                    >
                      发送日报
                    </Button>
                  </Space>
                }
              >
                {emailStats && (
                  <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
                    <Col span={6}>
                      <Card size="small">
                        <Statistic
                          title="今日发送"
                          value={emailStats.todaySent || 0}
                          valueStyle={{ color: '#52c41a' }}
                        />
                      </Card>
                    </Col>
                    <Col span={6}>
                      <Card size="small">
                        <Statistic
                          title="今日失败"
                          value={emailStats.todayFailed || 0}
                          valueStyle={{ color: '#ff4d4f' }}
                        />
                      </Card>
                    </Col>
                    <Col span={6}>
                      <Card size="small">
                        <Statistic
                          title="本周发送"
                          value={emailStats.weekSent || 0}
                          valueStyle={{ color: '#1890ff' }}
                        />
                      </Card>
                    </Col>
                    <Col span={6}>
                      <Card size="small">
                        <Statistic
                          title="成功率"
                          value={emailStats.successRate || 0}
                          suffix="%"
                          valueStyle={{ color: '#722ed1' }}
                        />
                      </Card>
                    </Col>
                  </Row>
                )}

                <Table
                  columns={emailLogColumns}
                  dataSource={emailLogs}
                  rowKey="id"
                  loading={logsLoading}
                  pagination={{
                    showSizeChanger: true,
                    showQuickJumper: true,
                    showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`
                  }}
                  scroll={{ x: 1000 }}
                />
              </Card>
            )
          },
          {
            key: 'portfolio-stats',
            label: '投资组合统计',
            children: (
              <Card title="投资组合订阅统计">
                {publicPortfolios.length > 0 ? (
                  <List
                    dataSource={publicPortfolios}
                    renderItem={(portfolio) => {
                      const subscriberCount = subscriptions.filter(
                        sub => sub.portfolio_id === portfolio.id
                      ).length;
                      
                      return (
                        <List.Item>
                          <List.Item.Meta
                            avatar={<Avatar icon={<PieChartOutlined />} style={{ backgroundColor: '#1890ff' }} />}
                            title={
                              <Space>
                                <span>{portfolio.name}</span>
                                <Tag color="blue">{portfolio.stock_count} 只股票</Tag>
                                <Tag color="green">{subscriberCount} 个订阅者</Tag>
                              </Space>
                            }
                            description={
                              <Space direction="vertical" size="small">
                                <Text type="secondary">{portfolio.description || '暂无描述'}</Text>
                                <Text type="secondary">
                                  创建者: {portfolio.owner_email?.split('@')[0] || '未知'} • 
                                  创建时间: {dayjs(portfolio.created_at).format('YYYY-MM-DD')}
                                </Text>
                              </Space>
                            }
                          />
                          <div style={{ minWidth: '120px', textAlign: 'right' }}>
                            <Statistic
                              value={subscriberCount}
                              suffix="订阅者"
                              valueStyle={{ fontSize: '16px', color: '#1890ff' }}
                            />
                          </div>
                        </List.Item>
                      );
                    }}
                  />
                ) : (
                  <Empty description="暂无公开投资组合" />
                )}
              </Card>
            )
          }
        ]}
      />

      {/* 添加订阅弹窗 */}
      <Modal
        title="添加邮件订阅"
        open={isModalVisible}
        onOk={handleModalOk}
        onCancel={() => {
          setIsModalVisible(false);
          form.resetFields();
        }}
        confirmLoading={addSubscriptionMutation.isLoading}
      >
        <Form
          form={form}
          layout="vertical"
        >
          <Form.Item
            name="email"
            label="邮件地址"
            rules={[
              { required: true, message: '请输入邮件地址' },
              { type: 'email', message: '请输入有效的邮件地址' }
            ]}
          >
            <Input placeholder="user@example.com" />
          </Form.Item>

          <Form.Item
            name="portfolio_id"
            label="订阅投资组合"
            help="不选择则订阅全部新闻汇总"
          >
            <Select placeholder="选择投资组合（可选）" allowClear>
              {publicPortfolios.map(portfolio => (
                <Option key={portfolio.id} value={portfolio.id}>
                  {portfolio.name} ({portfolio.stock_count} 只股票)
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* 批量添加弹窗 */}
      <Modal
        title="批量添加邮件订阅"
        open={isBatchModalVisible}
        onOk={handleBatchModalOk}
        onCancel={() => {
          setIsBatchModalVisible(false);
          batchForm.resetFields();
        }}
        confirmLoading={batchAddMutation.isLoading}
        width={600}
      >
        <Form
          form={batchForm}
          layout="vertical"
        >
          <Form.Item
            name="portfolio_id"
            label="订阅投资组合"
            help="不选择则订阅全部新闻汇总"
          >
            <Select placeholder="选择投资组合（可选）" allowClear>
              {publicPortfolios.map(portfolio => (
                <Option key={portfolio.id} value={portfolio.id}>
                  {portfolio.name} ({portfolio.stock_count} 只股票)
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="emails"
            label="邮件地址列表"
            rules={[{ required: true, message: '请输入邮件地址' }]}
            help="每行输入一个邮件地址"
          >
            <TextArea
              placeholder={`user1@example.com
user2@example.com
user3@example.com`}
              rows={8}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default EnhancedSubscriptionManager;
