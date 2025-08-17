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
  Switch,
  Upload,
  Divider
} from 'antd';
import { 
  PlusOutlined, 
  DeleteOutlined, 
  EditOutlined,
  UploadOutlined,
  MailOutlined,
  UserAddOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const SubscriptionManager = () => {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isBatchModalVisible, setIsBatchModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [batchForm] = Form.useForm();
  const queryClient = useQueryClient();

  // 获取邮件订阅列表
  const { data: subscriptions = [], isLoading } = useQuery(
    'email-subscriptions',
    () => axios.get('/api/subscriptions').then(res => res.data)
  );

  // 获取公开投资组合列表
  const { data: publicPortfolios = [] } = useQuery(
    'public-portfolios',
    () => axios.get('/api/portfolios/public/list').then(res => res.data)
  );

  // 添加邮件订阅
  const addSubscriptionMutation = useMutation(
    (data) => axios.post('/api/subscriptions', data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('email-subscriptions');
        message.success('邮件订阅添加成功');
        setIsModalVisible(false);
        form.resetFields();
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '添加失败');
      }
    }
  );

  // 批量添加邮件订阅
  const batchAddMutation = useMutation(
    (data) => axios.post('/api/subscriptions/batch', data),
    {
      onSuccess: (response) => {
        queryClient.invalidateQueries('email-subscriptions');
        const { added, errors } = response.data;
        message.success(`成功添加 ${added.length} 个订阅`);
        if (errors.length > 0) {
          message.warning(`${errors.length} 个邮件添加失败`);
        }
        setIsBatchModalVisible(false);
        batchForm.resetFields();
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '批量添加失败');
      }
    }
  );

  // 更新订阅状态
  const updateSubscriptionMutation = useMutation(
    ({ id, is_active }) => axios.put(`/api/subscriptions/${id}`, { is_active }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('email-subscriptions');
        message.success('订阅状态更新成功');
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '更新失败');
      }
    }
  );

  // 删除订阅
  const deleteSubscriptionMutation = useMutation(
    (id) => axios.delete(`/api/subscriptions/${id}`),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('email-subscriptions');
        message.success('订阅删除成功');
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '删除失败');
      }
    }
  );

  const handleAddSubscription = () => {
    setIsModalVisible(true);
    form.resetFields();
  };

  const handleBatchAdd = () => {
    setIsBatchModalVisible(true);
    batchForm.resetFields();
  };

  const handleModalOk = () => {
    form.validateFields().then((values) => {
      addSubscriptionMutation.mutate(values);
    });
  };

  const handleBatchModalOk = () => {
    batchForm.validateFields().then((values) => {
      const emails = values.emails.split('\n')
        .map(email => email.trim())
        .filter(email => email);
      
      batchAddMutation.mutate({
        emails,
        portfolio_id: values.portfolio_id
      });
    });
  };

  const handleImportCSV = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csv = e.target.result;
        const lines = csv.split('\n');
        const emails = [];
        
        // 跳过标题行，解析邮件地址
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line) {
            const parts = line.split(',');
            const email = parts[0]?.trim();
            if (email && email.includes('@')) {
              emails.push(email);
            }
          }
        }
        
        if (emails.length > 0) {
          batchForm.setFieldsValue({
            emails: emails.join('\n')
          });
          setIsBatchModalVisible(true);
        } else {
          message.error('CSV文件中未找到有效的邮件地址');
        }
      } catch (error) {
        message.error('CSV文件解析失败');
      }
    };
    reader.readAsText(file);
    return false; // 阻止默认上传
  };

  const handleToggleActive = (record) => {
    updateSubscriptionMutation.mutate({
      id: record.id,
      is_active: !record.is_active
    });
  };

  const columns = [
    {
      title: '邮件地址',
      dataIndex: 'email',
      key: 'email'
    },
    {
      title: '订阅投资组合',
      dataIndex: 'portfolio_name',
      key: 'portfolio_name',
      render: (name) => name ? <Tag color="blue">{name}</Tag> : <Tag>全部新闻</Tag>
    },
    {
      title: '组合所有者',
      dataIndex: 'owner_email',
      key: 'owner_email',
      render: (email) => email || <Text type="secondary">系统</Text>
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (isActive, record) => (
        <Switch
          checked={isActive}
          onChange={() => handleToggleActive(record)}
          checkedChildren="活跃"
          unCheckedChildren="暂停"
        />
      )
    },
    {
      title: '订阅时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date) => new Date(date).toLocaleString()
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Popconfirm
            title="确定要删除这个订阅吗？"
            onConfirm={() => deleteSubscriptionMutation.mutate(record.id)}
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
        </Space>
      )
    }
  ];

  // 统计数据
  const totalSubscriptions = subscriptions.length;
  const activeSubscriptions = subscriptions.filter(s => s.is_active).length;
  const portfolioSubscriptions = subscriptions.filter(s => s.portfolio_id).length;
  const generalSubscriptions = subscriptions.filter(s => !s.portfolio_id).length;

  return (
    <div>
      <div className="page-header">
        <Title level={2} className="page-title">邮件订阅管理</Title>
        <Text className="page-description">
          管理邮件订阅者，支持按投资组合订阅个性化报告
        </Text>
      </div>

      {/* 统计卡片 */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
        <Card size="small" style={{ flex: 1 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1890ff' }}>
              {totalSubscriptions}
            </div>
            <div>总订阅数</div>
          </div>
        </Card>
        <Card size="small" style={{ flex: 1 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#52c41a' }}>
              {activeSubscriptions}
            </div>
            <div>活跃订阅</div>
          </div>
        </Card>
        <Card size="small" style={{ flex: 1 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#fa8c16' }}>
              {portfolioSubscriptions}
            </div>
            <div>组合订阅</div>
          </div>
        </Card>
        <Card size="small" style={{ flex: 1 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#722ed1' }}>
              {generalSubscriptions}
            </div>
            <div>通用订阅</div>
          </div>
        </Card>
      </div>

      <Card
        title={`邮件订阅列表 (${subscriptions.length})`}
        extra={
          <Space>
            <Upload
              beforeUpload={handleImportCSV}
              showUploadList={false}
              accept=".csv"
            >
              <Button icon={<UploadOutlined />}>
                导入CSV
              </Button>
            </Upload>
            
            <Button
              icon={<UserAddOutlined />}
              onClick={handleBatchAdd}
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
          columns={columns}
          dataSource={subscriptions}
          rowKey="id"
          loading={isLoading}
          pagination={{ 
            pageSize: 20,
            showTotal: (total, range) => `显示 ${range[0]}-${range[1]} 条，共 ${total} 条`
          }}
        />
      </Card>

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
            <Input placeholder="subscriber@example.com" />
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

export default SubscriptionManager;
