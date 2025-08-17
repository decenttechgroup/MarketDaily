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

const SubscriptionManager = () => {
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

  // 获取投资组合列表
  const { data: portfolios = [], isLoading: portfoliosLoading } = useQuery(
    'portfolios',
    () => axios.get('/api/portfolios').then(res => res.data)
  );

  // 获取邮件发送统计
  const { data: emailStats } = useQuery(
    'email-stats',
    () => axios.get('/api/subscriptions/email/stats').then(res => res.data)
  );

  // 获取邮件发送日志
  const { data: emailLogs = [], isLoading: logsLoading } = useQuery(
    'email-logs',
    () => axios.get('/api/subscriptions/email/logs', { params: { limit: 50 } }).then(res => res.data.logs)
  );

  // 添加订阅
  const addSubscriptionMutation = useMutation(
    (data) => axios.post('/api/subscriptions', data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('subscriptions');
        // 不在这里显示成功消息，在handleModalOk中统一显示
      },
      onError: (error) => {
        if (error.response?.data?.error === 'Already subscribed') {
          message.warning('该邮箱已经订阅过该投资组合');
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
    ({ email, portfolioId }) => axios.post('/api/subscriptions/unsubscribe', {
      email, 
      portfolio_id: portfolioId
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
    () => axios.post('/api/subscriptions/email/send-daily'),
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
    form.validateFields().then(async (values) => {
      const { email, portfolio_ids } = values;
      
      try {
        // 如果没有选择投资组合，则订阅综合日报
        if (!portfolio_ids || portfolio_ids.length === 0) {
          await addSubscriptionMutation.mutateAsync({ email });
          message.success('综合日报订阅添加成功');
        } else {
          // 为每个选中的投资组合创建订阅
          const promises = portfolio_ids.map(portfolioId => 
            addSubscriptionMutation.mutateAsync({
              email,
              portfolio_id: portfolioId
            })
          );
          await Promise.all(promises);
          message.success(`成功添加 ${portfolio_ids.length} 个投资组合订阅`);
        }
        
        setIsModalVisible(false);
        form.resetFields();
      } catch (error) {
        // 错误已在mutation中处理
      }
    });
  };

  const handleBatchModalOk = () => {
    batchForm.validateFields().then((values) => {
      const emails = values.emails.split('\n').map(email => email.trim()).filter(email => email);
      const { portfolioIds } = values;
      
      // 如果没有选择投资组合，则订阅综合日报
      if (!portfolioIds || portfolioIds.length === 0) {
        batchAddMutation.mutate({
          emails
        });
      } else {
        // 为每个选中的投资组合创建订阅
        portfolioIds.forEach(portfolioId => {
          batchAddMutation.mutate({
            emails,
            portfolio_id: portfolioId
          });
        });
      }
    });
  };

  const handleDeleteSubscription = (params) => {
    deleteSubscriptionMutation.mutate({
      email: params.email,
      portfolioId: params.portfolioId
    });
  };

  const handleDeleteAllSubscriptions = (email) => {
    // 找到该邮箱的所有订阅并删除
    const emailSubscriptions = subscriptions.filter(sub => sub.email === email);
    emailSubscriptions.forEach(subscription => {
      deleteSubscriptionMutation.mutate({
        email: subscription.email,
        portfolioId: subscription.portfolio_id
      });
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
      render: (email, record) => (
        <Space direction="vertical" size="small">
          <Space>
            <Avatar size="small" icon={<MailOutlined />} />
            {email}
            {record.subscriptionCount > 1 && (
              <Tag color="blue">{record.subscriptionCount}个订阅</Tag>
            )}
          </Space>
        </Space>
      )
    },
    {
      title: '订阅类型',
      dataIndex: 'portfolio_name',
      key: 'portfolio_name',
      render: (name, record) => (
        <Space direction="vertical" size="small">
          {record.hasGeneralSubscription && (
            <Tag color="purple">综合日报</Tag>
          )}
          {record.portfolios && record.portfolios.length > 0 && 
            record.portfolios.map(portfolio => (
              <Tag key={portfolio.id} color="blue">{portfolio.name}</Tag>
            ))
          }
        </Space>
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
        <Space direction="vertical" size="small">
          {record.hasGeneralSubscription && (
            <Popconfirm
              title="确定要删除综合日报订阅吗？"
              onConfirm={() => handleDeleteSubscription({ email: record.email, portfolioId: null })}
              okText="确定"
              cancelText="取消"
            >
              <Button type="link" danger size="small">
                删除综合日报
              </Button>
            </Popconfirm>
          )}
          {record.portfolios && record.portfolios.length > 0 && 
            record.portfolios.map(portfolio => (
              <Popconfirm
                key={portfolio.id}
                title={`确定要删除"${portfolio.name}"订阅吗？`}
                onConfirm={() => handleDeleteSubscription({ email: record.email, portfolioId: portfolio.id })}
                okText="确定"
                cancelText="取消"
              >
                <Button type="link" danger size="small">
                  删除{portfolio.name}
                </Button>
              </Popconfirm>
            ))
          }
          {record.subscriptionCount > 1 && (
            <Popconfirm
              title="确定要删除该邮箱的所有订阅吗？"
              onConfirm={() => handleDeleteAllSubscriptions(record.email)}
              okText="确定"
              cancelText="取消"
            >
              <Button type="link" danger size="small">
                删除全部
              </Button>
            </Popconfirm>
          )}
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

  // 合并同一邮箱的多个订阅
  const mergedSubscriptions = subscriptions.reduce((acc, subscription) => {
    const existingEmail = acc.find(item => item.email === subscription.email);
    
    if (existingEmail) {
      // 如果已有该邮箱，添加投资组合信息
      if (subscription.portfolio_name) {
        existingEmail.portfolios = existingEmail.portfolios || [];
        existingEmail.portfolios.push({
          id: subscription.portfolio_id,
          name: subscription.portfolio_name
        });
      } else {
        existingEmail.hasGeneralSubscription = true;
      }
      existingEmail.subscriptionCount = (existingEmail.subscriptionCount || 1) + 1;
    } else {
      // 新邮箱
      const newSubscription = {
        ...subscription,
        subscriptionCount: 1,
        portfolios: subscription.portfolio_name ? [{
          id: subscription.portfolio_id,
          name: subscription.portfolio_name
        }] : [],
        hasGeneralSubscription: !subscription.portfolio_name
      };
      acc.push(newSubscription);
    }
    
    return acc;
  }, []);

  return (
    <div>
      <div className="page-header">
        <Title level={2} className="page-title">订阅管理</Title>
        <Text className="page-description">
          管理综合日报邮件订阅用户，监控邮件发送状态，支持批量操作
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
                  <Col span={8}>
                    <Card>
                      <Statistic
                        title="总邮箱数"
                        value={mergedSubscriptions.length}
                        prefix={<TeamOutlined />}
                        valueStyle={{ color: '#1890ff' }}
                      />
                    </Card>
                  </Col>
                  <Col span={8}>
                    <Card>
                      <Statistic
                        title="活跃订阅"
                        value={activeSubscriptions}
                        prefix={<CheckCircleOutlined />}
                        valueStyle={{ color: '#52c41a' }}
                      />
                    </Card>
                  </Col>
                  <Col span={8}>
                    <Card>
                      <Statistic
                        title="总订阅数"
                        value={totalSubscriptions}
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
                    dataSource={mergedSubscriptions}
                    rowKey="email"
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
            name="portfolio_ids"
            label="订阅投资组合"
            help="可选择多个投资组合，不选择则订阅综合日报"
          >
            <Select 
              mode="multiple"
              placeholder="选择投资组合（可选）"
              allowClear
              loading={portfoliosLoading}
            >
              {portfolios.map(portfolio => (
                <Option key={portfolio.id} value={portfolio.id}>
                  {portfolio.name}
                  {portfolio.description && (
                    <Text type="secondary" style={{ marginLeft: 8 }}>
                      - {portfolio.description}
                    </Text>
                  )}
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
            name="emails"
            label="邮件地址列表"
            rules={[{ required: true, message: '请输入邮件地址' }]}
            help="每行输入一个邮件地址"
          >
            <TextArea
              placeholder={`user1@example.com
user2@example.com
user3@example.com`}
              rows={6}
            />
          </Form.Item>
          
          <Form.Item
            name="portfolioIds"
            label="订阅投资组合"
            help="可选择多个投资组合，不选择则订阅综合日报"
          >
            <Select 
              mode="multiple"
              placeholder="选择投资组合（可选）"
              allowClear
              loading={portfoliosLoading}
            >
              {portfolios.map(portfolio => (
                <Option key={portfolio.id} value={portfolio.id}>
                  {portfolio.name}
                  {portfolio.description && (
                    <Text type="secondary" style={{ marginLeft: 8 }}>
                      - {portfolio.description}
                    </Text>
                  )}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default SubscriptionManager;
