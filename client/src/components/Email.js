import React, { useState } from 'react';
import { 
  Card, 
  Table, 
  Button, 
  Modal, 
  Form, 
  Input, 
  message, 
  Space, 
  Typography,
  Tag,
  List,
  Popconfirm,
  Row,
  Col,
  Statistic,
  Alert
} from 'antd';
import {
  SendOutlined,
  PlusOutlined,
  DeleteOutlined,
  MailOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const Email = () => {
  const [isRecipientModalVisible, setIsRecipientModalVisible] = useState(false);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  // 获取邮件接收者列表
  const { data: recipients = [], isLoading: recipientsLoading } = useQuery(
    'email-recipients',
    () => axios.get('/api/email/recipients').then(res => res.data)
  );

  // 获取邮件发送记录
  const { data: emailLogs, isLoading: logsLoading } = useQuery(
    'email-logs',
    () => axios.get('/api/email/logs').then(res => res.data)
  );

  // 获取邮件统计
  const { data: emailStats } = useQuery(
    'email-stats',
    () => axios.get('/api/email/stats').then(res => res.data)
  );

  // 发送测试邮件
  const sendTestEmailMutation = useMutation(
    (email) => axios.post('/api/email/test', { email }),
    {
      onSuccess: () => {
        message.success('测试邮件发送成功');
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '发送失败');
      }
    }
  );

  // 发送日报
  const sendDailyReportMutation = useMutation(
    () => axios.post('/api/email/send-daily'),
    {
      onSuccess: () => {
        message.success('日报发送已开始');
        queryClient.invalidateQueries('email-logs');
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '发送失败');
      }
    }
  );

  // 添加接收者
  const addRecipientMutation = useMutation(
    (email) => axios.post('/api/email/recipients/add', { email }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('email-recipients');
        message.success('接收者添加成功');
        setIsRecipientModalVisible(false);
        form.resetFields();
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '添加失败');
      }
    }
  );

  // 删除接收者
  const deleteRecipientMutation = useMutation(
    (email) => axios.delete(`/api/email/recipients/${encodeURIComponent(email)}`),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('email-recipients');
        message.success('接收者删除成功');
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '删除失败');
      }
    }
  );

  const handleSendTestEmail = (email) => {
    sendTestEmailMutation.mutate(email);
  };

  const handleSendDailyReport = () => {
    sendDailyReportMutation.mutate();
  };

  const handleAddRecipient = () => {
    form.validateFields().then((values) => {
      addRecipientMutation.mutate(values.email);
    });
  };

  const handleDeleteRecipient = (email) => {
    deleteRecipientMutation.mutate(email);
  };

  const getStatusTag = (status) => {
    const statusConfig = {
      sent: { color: 'success', icon: <CheckCircleOutlined />, text: '已发送' },
      failed: { color: 'error', icon: <CloseCircleOutlined />, text: '发送失败' },
      pending: { color: 'processing', icon: <ClockCircleOutlined />, text: '待发送' }
    };

    const config = statusConfig[status] || statusConfig.pending;
    return (
      <Tag color={config.color} icon={config.icon}>
        {config.text}
      </Tag>
    );
  };

  const logsColumns = [
    {
      title: '接收者',
      dataIndex: 'recipient',
      key: 'recipient'
    },
    {
      title: '主题',
      dataIndex: 'subject',
      key: 'subject'
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: getStatusTag
    },
    {
      title: '发送时间',
      dataIndex: 'sent_at',
      key: 'sent_at',
      render: (date) => dayjs(date).format('YYYY-MM-DD HH:mm:ss')
    },
    {
      title: '错误信息',
      dataIndex: 'error_message',
      key: 'error_message',
      render: (error) => error ? (
        <Text type="danger" style={{ fontSize: '12px' }}>
          {error.length > 50 ? error.substring(0, 50) + '...' : error}
        </Text>
      ) : '-'
    }
  ];

  return (
    <div>
      <div className="page-header">
        <Title level={2} className="page-title">邮件管理</Title>
        <Text className="page-description">
          管理邮件接收者和发送记录
        </Text>
      </div>

      {/* 统计卡片 */}
      {emailStats && (
        <Row gutter={[24, 24]} style={{ marginBottom: '24px' }}>
          <Col xs={24} sm={6}>
            <Card>
              <Statistic
                title="总发送量"
                value={emailStats.total?.total || 0}
                prefix={<MailOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={6}>
            <Card>
              <Statistic
                title="成功发送"
                value={emailStats.total?.sent || 0}
                valueStyle={{ color: '#52c41a' }}
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={6}>
            <Card>
              <Statistic
                title="发送失败"
                value={emailStats.total?.failed || 0}
                valueStyle={{ color: '#ff4d4f' }}
                prefix={<CloseCircleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={6}>
            <Card>
              <Statistic
                title="成功率"
                value={emailStats.total?.total > 0 
                  ? Math.round((emailStats.total.sent / emailStats.total.total) * 100)
                  : 0
                }
                suffix="%"
                valueStyle={{ 
                  color: emailStats.total?.total > 0 && (emailStats.total.sent / emailStats.total.total) > 0.9 
                    ? '#52c41a' : '#faad14' 
                }}
              />
            </Card>
          </Col>
        </Row>
      )}

      <Row gutter={[24, 24]}>
        {/* 邮件接收者管理 */}
        <Col xs={24} lg={10}>
          <Card
            title="邮件接收者"
            extra={
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setIsRecipientModalVisible(true)}
              >
                添加接收者
              </Button>
            }
          >
            <List
              loading={recipientsLoading}
              dataSource={recipients}
              renderItem={(email) => (
                <List.Item
                  actions={[
                    <Button
                      type="link"
                      icon={<SendOutlined />}
                      onClick={() => handleSendTestEmail(email)}
                      loading={sendTestEmailMutation.isLoading}
                    >
                      测试邮件
                    </Button>,
                    <Popconfirm
                      title="确定要删除这个接收者吗？"
                      onConfirm={() => handleDeleteRecipient(email)}
                      okText="确定"
                      cancelText="取消"
                    >
                      <Button
                        type="link"
                        danger
                        icon={<DeleteOutlined />}
                      >
                        删除
                      </Button>
                    </Popconfirm>
                  ]}
                >
                  <List.Item.Meta
                    avatar={<MailOutlined />}
                    title={email}
                  />
                </List.Item>
              )}
              locale={{ emptyText: '暂无邮件接收者' }}
            />
          </Card>
        </Col>

        {/* 快速操作 */}
        <Col xs={24} lg={14}>
          <Card title="快速操作">
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              <Alert
                message="邮件发送说明"
                description="系统会在每个工作日早上8点自动发送市场日报邮件。您也可以手动发送当日报告。"
                type="info"
                showIcon
              />

              <Space wrap>
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  size="large"
                  onClick={handleSendDailyReport}
                  loading={sendDailyReportMutation.isLoading}
                >
                  立即发送日报
                </Button>

                <Button
                  icon={<SendOutlined />}
                  onClick={() => handleSendTestEmail()}
                  loading={sendTestEmailMutation.isLoading}
                >
                  发送测试邮件
                </Button>
              </Space>

              <div>
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  日报内容包括：最新市场新闻、投资组合相关动态、市场情绪分析等
                </Text>
              </div>
            </Space>
          </Card>
        </Col>
      </Row>

      {/* 发送记录 */}
      <Card 
        title="发送记录" 
        style={{ marginTop: '24px' }}
        extra={
          <Text type="secondary">
            最近 {emailLogs?.logs?.length || 0} 条记录
          </Text>
        }
      >
        <Table
          columns={logsColumns}
          dataSource={emailLogs?.logs || []}
          rowKey="id"
          loading={logsLoading}
          pagination={{
            ...emailLogs?.pagination,
            showSizeChanger: false,
            showQuickJumper: true,
            showTotal: (total, range) => 
              `第 ${range[0]}-${range[1]} 条，共 ${total} 条`
          }}
          scroll={{ x: 800 }}
        />
      </Card>

      {/* 添加接收者弹窗 */}
      <Modal
        title="添加邮件接收者"
        visible={isRecipientModalVisible}
        onOk={handleAddRecipient}
        onCancel={() => {
          setIsRecipientModalVisible(false);
          form.resetFields();
        }}
        confirmLoading={addRecipientMutation.isLoading}
      >
        <Form
          form={form}
          layout="vertical"
        >
          <Form.Item
            name="email"
            label="邮箱地址"
            rules={[
              { required: true, message: '请输入邮箱地址' },
              { type: 'email', message: '请输入有效的邮箱地址' }
            ]}
          >
            <Input 
              placeholder="输入邮箱地址"
              prefix={<MailOutlined />}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Email;
