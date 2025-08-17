import React, { useState } from 'react';
import { 
  Card, 
  Form, 
  Input, 
  Button, 
  message, 
  Typography,
  Divider,
  Space,
  Table,
  Modal,
  Tag,
  Select,
  Popconfirm
} from 'antd';
import {
  SaveOutlined,
  DeleteOutlined,
  PlusOutlined,
  EditOutlined,
  KeyOutlined,
  ApiOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;
const { Password } = Input;

const Settings = () => {
  const [configForm] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const [industryForm] = Form.useForm();
  const [isIndustryModalVisible, setIsIndustryModalVisible] = useState(false);
  const [editingIndustry, setEditingIndustry] = useState(null);
  const [testingOpenAI, setTestingOpenAI] = useState(false);
  const { user, changePassword } = useAuth();
  const queryClient = useQueryClient();

  // 获取配置
  const { data: config = {}, isLoading: configLoading } = useQuery(
    'config',
    () => axios.get('/api/config').then(res => res.data)
  );

  // 获取行业列表
  const { data: industries = [], isLoading: industriesLoading } = useQuery(
    'industries',
    () => axios.get('/api/config/industries').then(res => res.data).catch(() => [])
  );

  // 保存配置
  const saveConfigMutation = useMutation(
    (data) => axios.post('/api/config/batch', { configs: data }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('config');
        message.success('配置保存成功');
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '保存失败');
      }
    }
  );

  // 修改密码
  const changePasswordMutation = useMutation(
    (data) => changePassword(data.currentPassword, data.newPassword),
    {
      onSuccess: (result) => {
        if (result.success) {
          message.success('密码修改成功');
          passwordForm.resetFields();
        } else {
          message.error(result.message);
        }
      }
    }
  );

  // 添加/更新行业
  const saveIndustryMutation = useMutation(
    (data) => axios.post('/api/config/industry', data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('industries');
        message.success('行业配置保存成功');
        setIsIndustryModalVisible(false);
        setEditingIndustry(null);
        industryForm.resetFields();
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '保存失败');
      }
    }
  );

  // 删除行业
  const deleteIndustryMutation = useMutation(
    (id) => axios.delete(`/api/config/industry/${id}`),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('industries');
        message.success('行业删除成功');
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '删除失败');
      }
    }
  );

  // 测试OpenAI API
  const testOpenAIMutation = useMutation(
    (data) => axios.post('/api/config/test-openai', data),
    {
      onSuccess: (response) => {
        message.success(`API连接成功! 模型: ${response.data.model}`);
        console.log('OpenAI Test Response:', response.data);
      },
      onError: (error) => {
        const errorMsg = error.response?.data?.error || 'API测试失败';
        const errorDetails = error.response?.data?.details;
        message.error(`${errorMsg}${errorDetails ? ': ' + errorDetails : ''}`);
        console.error('OpenAI Test Error:', error.response?.data);
      }
    }
  );

  const handleSaveConfig = () => {
    configForm.validateFields().then((values) => {
      saveConfigMutation.mutate(values);
    });
  };

  const handleChangePassword = () => {
    passwordForm.validateFields().then((values) => {
      if (values.newPassword !== values.confirmPassword) {
        message.error('两次输入的密码不一致');
        return;
      }
      changePasswordMutation.mutate(values);
    });
  };

  const handleAddIndustry = () => {
    setEditingIndustry(null);
    setIsIndustryModalVisible(true);
    industryForm.resetFields();
  };

  const handleEditIndustry = (industry) => {
    setEditingIndustry(industry);
    setIsIndustryModalVisible(true);
    industryForm.setFieldsValue({
      name: industry.name,
      keywords: industry.keywords
    });
  };

  const handleSaveIndustry = () => {
    industryForm.validateFields().then((values) => {
      const data = {
        ...values,
        id: editingIndustry?.id
      };
      saveIndustryMutation.mutate(data);
    });
  };

  const handleTestOpenAI = () => {
    configForm.validateFields(['openai_api_key', 'openai_model']).then((values) => {
      const { openai_api_key, openai_model } = values;
      if (!openai_api_key) {
        message.error('请先填写OpenAI API Key');
        return;
      }
      setTestingOpenAI(true);
      testOpenAIMutation.mutate(
        { 
          apiKey: openai_api_key, 
          model: openai_model || 'gpt-3.5-turbo' 
        },
        {
          onSettled: () => {
            setTestingOpenAI(false);
          }
        }
      );
    }).catch(() => {
      message.error('请填写完整的OpenAI配置信息');
    });
  };

  const industryColumns = [
    {
      title: '行业名称',
      dataIndex: 'name',
      key: 'name'
    },
    {
      title: '关键词',
      dataIndex: 'keywords',
      key: 'keywords',
      render: (keywords) => {
        if (!keywords) return <Text type="secondary">无</Text>;
        const keywordList = keywords.split(',').map(k => k.trim());
        return (
          <div>
            {keywordList.slice(0, 3).map(keyword => (
              <Tag key={keyword} style={{ margin: '2px' }}>
                {keyword}
              </Tag>
            ))}
            {keywordList.length > 3 && (
              <Text type="secondary">+{keywordList.length - 3}</Text>
            )}
          </div>
        );
      }
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEditIndustry(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个行业配置吗？"
            onConfirm={() => deleteIndustryMutation.mutate(record.id)}
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

  return (
    <div>
      <div className="page-header">
        <Title level={2} className="page-title">系统设置</Title>
        <Text className="page-description">
          配置系统参数、API密钥和个人偏好
        </Text>
      </div>

      {/* API配置 */}
      <Card title="API配置" style={{ marginBottom: '24px' }}>
        <Form
          form={configForm}
          layout="vertical"
          initialValues={config}
          onValuesChange={(_, allValues) => {
            // 实时保存表单值到state
          }}
        >
          <div className="config-section">
            <div className="config-section-title">LLM配置</div>
            <Form.Item
              name="openai_api_key"
              label="OpenAI API Key"
              extra="用于新闻摘要和情感分析"
            >
              <Password 
                placeholder="sk-..."
                visibilityToggle={false}
              />
            </Form.Item>

            <Form.Item
              name="openai_model"
              label="OpenAI模型"
            >
              <Select placeholder="选择模型">
                <Option value="gpt-3.5-turbo">GPT-3.5 Turbo</Option>
                <Option value="gpt-4">GPT-4</Option>
                <Option value="gpt-4-turbo">GPT-4 Turbo</Option>
                <Option value="gpt-4o">GPT-4o</Option>
                <Option value="gpt-4o-mini">GPT-4o Mini</Option>
              </Select>
            </Form.Item>

            <Form.Item>
              <Button
                type="default"
                icon={<ApiOutlined />}
                onClick={handleTestOpenAI}
                loading={testingOpenAI}
                style={{ marginBottom: '16px' }}
              >
                测试API连接
              </Button>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
                点击测试按钮验证API密钥和模型配置是否正确
              </div>
            </Form.Item>
          </div>

          <Divider />

          <div className="config-section">
            <div className="config-section-title">邮件配置</div>
            <Form.Item
              name="email_host"
              label="SMTP服务器"
            >
              <Input placeholder="smtp.gmail.com" />
            </Form.Item>

            <div className="form-row">
              <Form.Item
                name="email_port"
                label="端口"
              >
                <Input placeholder="587" />
              </Form.Item>

              <Form.Item
                name="email_user"
                label="邮箱账号"
              >
                <Input placeholder="your-email@gmail.com" />
              </Form.Item>
            </div>

            <Form.Item
              name="email_password"
              label="邮箱密码"
              extra="建议使用应用专用密码"
            >
              <Password placeholder="邮箱密码或应用密码" />
            </Form.Item>

            <Form.Item
              name="email_schedule"
              label="发送时间"
              extra="Cron格式，默认工作日早上8点"
            >
              <Input placeholder="0 8 * * 1-5" />
            </Form.Item>
          </div>

          <Divider />

          <div className="config-section">
            <div className="config-section-title">新闻源配置</div>
            <Form.Item
              name="news_api_key"
              label="News API Key"
              extra="可选，用于获取更多新闻源"
            >
              <Password placeholder="News API密钥" />
            </Form.Item>

            <Form.Item
              name="custom_news_sources"
              label="自定义新闻源"
              extra="每行一个URL"
            >
              <TextArea 
                rows={4}
                placeholder="https://example.com/rss&#10;https://another-source.com/feed"
              />
            </Form.Item>
          </div>

          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSaveConfig}
            loading={saveConfigMutation.isLoading}
            size="large"
          >
            保存配置
          </Button>
        </Form>
      </Card>

      {/* 行业关注配置 */}
      <Card 
        title="关注行业"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAddIndustry}
          >
            添加行业
          </Button>
        }
        style={{ marginBottom: '24px' }}
      >
        <Table
          columns={industryColumns}
          dataSource={industries}
          rowKey="id"
          loading={industriesLoading}
          pagination={false}
          locale={{ emptyText: '暂无行业配置，点击添加行业开始关注特定行业新闻' }}
        />
      </Card>

      {/* 账户安全 */}
      <Card title="账户安全">
        <div style={{ marginBottom: '16px' }}>
          <Text strong>当前账户：</Text>
          <Text>{user?.email}</Text>
          {user?.role === 'admin' && (
            <Tag color="blue" style={{ marginLeft: '8px' }}>管理员</Tag>
          )}
        </div>

        <Divider />

        <div className="config-section-title">修改密码</div>
        <Form
          form={passwordForm}
          layout="vertical"
          style={{ maxWidth: '400px' }}
        >
          <Form.Item
            name="currentPassword"
            label="当前密码"
            rules={[{ required: true, message: '请输入当前密码' }]}
          >
            <Password placeholder="输入当前密码" />
          </Form.Item>

          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '密码至少6位' }
            ]}
          >
            <Password placeholder="输入新密码" />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            label="确认新密码"
            rules={[{ required: true, message: '请确认新密码' }]}
          >
            <Password placeholder="再次输入新密码" />
          </Form.Item>

          <Button
            type="primary"
            icon={<KeyOutlined />}
            onClick={handleChangePassword}
            loading={changePasswordMutation.isLoading}
          >
            修改密码
          </Button>
        </Form>
      </Card>

      {/* 行业配置弹窗 */}
      <Modal
        title={editingIndustry ? '编辑行业' : '添加行业'}
        open={isIndustryModalVisible}
        onOk={handleSaveIndustry}
        onCancel={() => {
          setIsIndustryModalVisible(false);
          setEditingIndustry(null);
          industryForm.resetFields();
        }}
        confirmLoading={saveIndustryMutation.isLoading}
      >
        <Form
          form={industryForm}
          layout="vertical"
        >
          <Form.Item
            name="name"
            label="行业名称"
            rules={[{ required: true, message: '请输入行业名称' }]}
          >
            <Input placeholder="如：科技、金融、医疗" />
          </Form.Item>

          <Form.Item
            name="keywords"
            label="关键词"
            extra="用逗号分隔多个关键词，用于筛选相关新闻"
            rules={[{ required: true, message: '请输入关键词' }]}
          >
            <TextArea 
              rows={3}
              placeholder="人工智能,机器学习,云计算,大数据"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Settings;
