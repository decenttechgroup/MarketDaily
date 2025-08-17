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
  Tabs,
  List,
  Divider,
  Row,
  Col,
  DatePicker,
  Spin,
  Empty
} from 'antd';
import { 
  PlusOutlined, 
  DeleteOutlined, 
  EditOutlined,
  EyeOutlined,
  SettingOutlined,
  MailOutlined,
  BarChartOutlined,
  SendOutlined,
  DownloadOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const PortfolioManager = () => {
  const [activeTab, setActiveTab] = useState('portfolios');
  const [selectedPortfolio, setSelectedPortfolio] = useState(null);
  const [isPortfolioModalVisible, setIsPortfolioModalVisible] = useState(false);
  const [isStockModalVisible, setIsStockModalVisible] = useState(false);
  const [isReportModalVisible, setIsReportModalVisible] = useState(false);
  const [isSendReportModalVisible, setIsSendReportModalVisible] = useState(false);
  const [isSubscriptionModalVisible, setIsSubscriptionModalVisible] = useState(false);
  const [editingPortfolio, setEditingPortfolio] = useState(null);
  const [editingStock, setEditingStock] = useState(null);
  const [portfolioForm] = Form.useForm();
  const [stockForm] = Form.useForm();
  const [sendReportForm] = Form.useForm();
  const [subscriptionForm] = Form.useForm();
  const [selectedDate, setSelectedDate] = useState(null);
  const queryClient = useQueryClient();

  // 获取投资组合列表
  const { data: portfolios = [], isLoading: portfoliosLoading } = useQuery(
    'portfolios',
    () => axios.get('/api/portfolios').then(res => res.data)
  );

  // 获取选定投资组合的股票
  const { data: portfolioStocks = [], isLoading: stocksLoading } = useQuery(
    ['portfolio-stocks', selectedPortfolio?.id],
    () => selectedPortfolio ? axios.get(`/api/portfolios/${selectedPortfolio.id}/stocks`).then(res => res.data) : [],
    { enabled: !!selectedPortfolio }
  );

  // 获取选定投资组合的新闻
  const { data: portfolioNews = [] } = useQuery(
    ['portfolio-news', selectedPortfolio?.id],
    () => selectedPortfolio ? axios.get(`/api/portfolios/${selectedPortfolio.id}/news`).then(res => res.data) : [],
    { enabled: !!selectedPortfolio }
  );

  // 获取选定投资组合的订阅者
  const { data: portfolioSubscriptions = [] } = useQuery(
    ['portfolio-subscriptions', selectedPortfolio?.id],
    () => selectedPortfolio ? axios.get(`/api/subscriptions/portfolio/${selectedPortfolio.id}`).then(res => res.data) : [],
    { enabled: !!selectedPortfolio }
  );

  // 获取投资组合历史报告
  const { data: portfolioReports = [] } = useQuery(
    ['portfolio-reports', selectedPortfolio?.id],
    () => selectedPortfolio ? axios.get(`/api/portfolios/${selectedPortfolio.id}/reports`).then(res => res.data) : [],
    { enabled: !!selectedPortfolio }
  );

  // 创建投资组合
  const createPortfolioMutation = useMutation(
    (data) => axios.post('/api/portfolios', data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('portfolios');
        message.success('投资组合创建成功');
        setIsPortfolioModalVisible(false);
        portfolioForm.resetFields();
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '创建失败');
      }
    }
  );

  // 更新投资组合
  const updatePortfolioMutation = useMutation(
    ({ id, data }) => axios.put(`/api/portfolios/${id}`, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('portfolios');                                                                                                                                                                                                                        
        message.success('投资组合更新成功');
        setIsPortfolioModalVisible(false);
        setEditingPortfolio(null);
        portfolioForm.resetFields();
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '更新失败');
      }
    }
  );

  // 删除投资组合
  const deletePortfolioMutation = useMutation(
    (id) => axios.delete(`/api/portfolios/${id}`),
    {
      onSuccess: (data, variables) => {
        queryClient.invalidateQueries('portfolios');
        message.success('投资组合删除成功');
        if (selectedPortfolio?.id === variables) {
          setSelectedPortfolio(null);
        }
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '删除失败');
      }
    }
  );

  // 添加股票到投资组合
  const addStockMutation = useMutation(
    (data) => axios.post(`/api/portfolios/${selectedPortfolio.id}/stocks`, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['portfolio-stocks', selectedPortfolio?.id]);
        message.success('股票添加成功');
        setIsStockModalVisible(false);
        stockForm.resetFields();
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '添加失败');
      }
    }
  );

  // 从投资组合删除股票
  const deleteStockMutation = useMutation(
    (stockId) => axios.delete(`/api/portfolios/${selectedPortfolio.id}/stocks/${stockId}`),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['portfolio-stocks', selectedPortfolio?.id]);
        message.success('股票删除成功');
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '删除失败');
      }
    }
  );

  // 生成投资组合报告
  const generateReportMutation = useMutation(
    ({ portfolioId, date }) => axios.get(`/api/portfolios/${portfolioId}/report`, {
      params: date ? { date: date.format('YYYY-MM-DD') } : {}
    }),
    {
      onSuccess: (response) => {
        setReportData(response.data);
        setIsReportModalVisible(true);
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '生成报告失败');
      }
    }
  );

  // 发送投资组合报告
  const sendReportMutation = useMutation(
    (data) => axios.post(`/api/portfolios/${selectedPortfolio.id}/send-report`, data),
    {
      onSuccess: (response) => {
        message.success(`报告发送成功！发送至 ${response.data.results.length} 个邮箱`);
        setIsSendReportModalVisible(false);
        sendReportForm.resetFields();
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '发送失败');
      }
    }
  );

  // 添加投资组合订阅
  const addPortfolioSubscriptionMutation = useMutation(
    (data) => axios.post('/api/subscriptions', {
      ...data,
      portfolio_id: selectedPortfolio.id
    }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['portfolio-subscriptions', selectedPortfolio?.id]);
        message.success('邮件订阅添加成功');
        setIsSubscriptionModalVisible(false);
        subscriptionForm.resetFields();
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

  // 删除投资组合订阅
  const deletePortfolioSubscriptionMutation = useMutation(
    ({ email }) => axios.post('/api/subscriptions/unsubscribe', {
      email, 
      portfolio_id: selectedPortfolio.id
    }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['portfolio-subscriptions', selectedPortfolio?.id]);
        message.success('订阅删除成功');
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '删除失败');
      }
    }
  );

  const [reportData, setReportData] = useState(null);

  const handleCreatePortfolio = () => {
    setEditingPortfolio(null);
    setIsPortfolioModalVisible(true);
    portfolioForm.resetFields();
  };

  const handleEditPortfolio = (portfolio) => {
    setEditingPortfolio(portfolio);
    setIsPortfolioModalVisible(true);
    portfolioForm.setFieldsValue(portfolio);
  };

  const handleDeletePortfolio = (id) => {
    deletePortfolioMutation.mutate(id);
  };

  const handlePortfolioModalOk = () => {
    portfolioForm.validateFields().then((values) => {
      if (editingPortfolio) {
        updatePortfolioMutation.mutate({ id: editingPortfolio.id, data: values });
      } else {
        createPortfolioMutation.mutate(values);
      }
    });
  };

  const handleAddStock = () => {
    if (!selectedPortfolio) {
      message.warning('请先选择一个投资组合');
      return;
    }
    setEditingStock(null);
    setIsStockModalVisible(true);
    stockForm.resetFields();
  };

  const handleStockModalOk = () => {
    stockForm.validateFields().then((values) => {
      addStockMutation.mutate(values);
    });
  };

  const handleGenerateReport = () => {
    if (!selectedPortfolio) {
      message.warning('请先选择一个投资组合');
      return;
    }
    generateReportMutation.mutate({ 
      portfolioId: selectedPortfolio.id, 
      date: selectedDate 
    });
  };

  const handleSendReport = () => {
    if (!selectedPortfolio) {
      message.warning('请先选择一个投资组合');
      return;
    }
    setIsSendReportModalVisible(true);
    sendReportForm.resetFields();
  };

  const handleSendReportOk = () => {
    sendReportForm.validateFields().then((values) => {
      const emails = values.emails.split('\n').map(email => email.trim()).filter(email => email);
      sendReportMutation.mutate({
        emails,
        date: values.date ? values.date.format('YYYY-MM-DD') : null
      });
    });
  };

  const portfolioColumns = [
    {
      title: '投资组合名称',
      dataIndex: 'name',
      key: 'name',
      render: (name, record) => (
        <Space>
          <Button
            type="link"
            style={{ padding: 0, height: 'auto', fontWeight: 'bold' }}
            onClick={() => {
              setSelectedPortfolio(record);
              setTimeout(() => setActiveTab('details'), 0);
            }}
          >
            {name}
          </Button>
          {record.is_public && <Tag color="green">公开</Tag>}
        </Space>
      )
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      render: (desc) => desc || <Text type="secondary">无描述</Text>
    },
    {
      title: '股票数量',
      dataIndex: 'stock_count',
      key: 'stock_count',
      render: (count) => <Tag color="blue">{count || 0} 只</Tag>
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date) => new Date(date).toLocaleDateString()
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedPortfolio(record);
              // Use setTimeout to ensure state is updated before changing tab
              setTimeout(() => setActiveTab('details'), 0);
            }}
          >
            查看
          </Button>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEditPortfolio(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个投资组合吗？"
            onConfirm={() => handleDeletePortfolio(record.id)}
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

  const stockColumns = [
    {
      title: '股票代码',
      dataIndex: 'symbol',
      key: 'symbol',
      render: (symbol) => <Tag color="blue">{symbol}</Tag>
    },
    {
      title: '公司名称',
      dataIndex: 'name',
      key: 'name'
    },
    {
      title: '行业',
      dataIndex: 'sector',
      key: 'sector',
      render: (sector) => sector ? <Tag>{sector}</Tag> : <Text type="secondary">未分类</Text>
    },
    {
      title: '添加时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date) => new Date(date).toLocaleDateString()
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record) => (
        <Popconfirm
          title="确定要删除这只股票吗？"
          onConfirm={() => deleteStockMutation.mutate(record.id)}
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
      )
    }
  ];

  const newsColumns = [
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      render: (title, record) => (
        <a href={record.url} target="_blank" rel="noopener noreferrer">
          {title}
        </a>
      )
    },
    {
      title: '相关股票',
      dataIndex: 'symbols',
      key: 'symbols',
      render: (symbols) => {
        const parsedSymbols = JSON.parse(symbols || '[]');
        return parsedSymbols.map(symbol => (
          <Tag key={symbol} color="green">{symbol}</Tag>
        ));
      }
    },
    {
      title: '来源',
      dataIndex: 'source',
      key: 'source'
    },
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date) => new Date(date).toLocaleString()
    }
  ];

  return (
    <div>
      <div className="page-header">
        <Title level={2} className="page-title">增强投资组合管理</Title>
        <Text className="page-description">
          创建和管理多个投资组合，生成个性化报告，管理邮件订阅
        </Text>
      </div>

      <Tabs 
        activeKey={activeTab} 
        onChange={setActiveTab}
        items={[
          {
            key: 'portfolios',
            label: '投资组合列表',
            children: (
              <Card
                title={`我的投资组合 (${portfolios.length})`}
                extra={
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={handleCreatePortfolio}
                  >
                    创建投资组合
                  </Button>
                }
              >
                <Table
                  columns={portfolioColumns}
                  dataSource={portfolios}
                  rowKey="id"
                  loading={portfoliosLoading}
                  pagination={{ pageSize: 10 }}
                />
              </Card>
            )
          },
          {
            key: 'details',
            label: '投资组合详情',
            disabled: !selectedPortfolio,
            children: selectedPortfolio && (
              <Space direction="vertical" style={{ width: '100%' }} size="large">
                <Card
                  title={
                    <Space>
                      <span>{selectedPortfolio.name}</span>
                      {selectedPortfolio.is_public && <Tag color="green">公开</Tag>}
                    </Space>
                  }
                  extra={
                    <Space>
                      <Button
                        icon={<BarChartOutlined />}
                        onClick={handleGenerateReport}
                        loading={generateReportMutation.isLoading}
                      >
                        生成报告
                      </Button>
                      <Button
                        icon={<SendOutlined />}
                        onClick={handleSendReport}
                      >
                        发送报告
                      </Button>
                      <Button
                        icon={<MailOutlined />}
                        onClick={() => setActiveTab('subscriptions')}
                      >
                        订阅管理 ({portfolioSubscriptions.length})
                      </Button>
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={handleAddStock}
                      >
                        添加股票
                      </Button>
                    </Space>
                  }
                >
                  {selectedPortfolio.description && (
                    <Paragraph>{selectedPortfolio.description}</Paragraph>
                  )}
                  
                  <Row gutter={[16, 16]}>
                    <Col span={8}>
                      <Card size="small">
                        <div style={{ textAlign: 'center' }}>
                          <Title level={3} style={{ margin: 0, color: '#1890ff' }}>
                            {portfolioStocks.length}
                          </Title>
                          <Text type="secondary">股票数量</Text>
                        </div>
                      </Card>
                    </Col>
                    <Col span={8}>
                      <Card size="small">
                        <div style={{ textAlign: 'center' }}>
                          <Title level={3} style={{ margin: 0, color: '#52c41a' }}>
                            {portfolioNews.length}
                          </Title>
                          <Text type="secondary">相关新闻</Text>
                        </div>
                      </Card>
                    </Col>
                    <Col span={8}>
                      <Card size="small">
                        <div style={{ textAlign: 'center' }}>
                          <Title level={3} style={{ margin: 0, color: '#722ed1' }}>
                            {portfolioSubscriptions.length}
                          </Title>
                          <Text type="secondary">订阅用户</Text>
                        </div>
                      </Card>
                    </Col>
                  </Row>
                  
                  <Divider orientation="left">股票列表 ({portfolioStocks.length})</Divider>
                  <Table
                    columns={stockColumns}
                    dataSource={portfolioStocks}
                    rowKey="id"
                    loading={stocksLoading}
                    pagination={{ pageSize: 10 }}
                    size="small"
                  />

                  {portfolioNews.length > 0 && (
                    <>
                      <Divider orientation="left">相关新闻 ({portfolioNews.length})</Divider>
                      <Table
                        columns={newsColumns}
                        dataSource={portfolioNews}
                        rowKey="id"
                        pagination={{ pageSize: 5 }}
                        size="small"
                      />
                    </>
                  )}
                </Card>
              </Space>
            )
          },
          {
            key: 'reports',
            label: '报告管理',
            disabled: !selectedPortfolio,
            children: selectedPortfolio && (
              <Card 
                title={`${selectedPortfolio.name} - 报告管理`}
                extra={
                  <Space>
                    <DatePicker
                      placeholder="选择日期"
                      value={selectedDate}
                      onChange={setSelectedDate}
                      style={{ width: 150 }}
                    />
                    <Button
                      type="primary"
                      icon={<BarChartOutlined />}
                      onClick={handleGenerateReport}
                      loading={generateReportMutation.isLoading}
                    >
                      生成报告
                    </Button>
                  </Space>
                }
              >
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  {portfolioReports.length > 0 ? (
                    <List
                      dataSource={portfolioReports}
                      renderItem={(report) => (
                        <List.Item
                          actions={[
                            <Button 
                              icon={<EyeOutlined />}
                              onClick={() => generateReportMutation.mutate({ 
                                portfolioId: selectedPortfolio.id, 
                                date: dayjs(report.report_date) 
                              })}
                            >
                              查看
                            </Button>,
                            <Button icon={<DownloadOutlined />}>下载</Button>
                          ]}
                        >
                          <List.Item.Meta
                            avatar={<FileTextOutlined style={{ fontSize: '24px', color: '#1890ff' }} />}
                            title={`${report.report_date} 报告`}
                            description={`发送给 ${report.email_count} 个邮箱：${report.recipients?.split(',').slice(0, 3).join(', ')}${report.recipients?.split(',').length > 3 ? '...' : ''}`}
                          />
                        </List.Item>
                      )}
                    />
                  ) : (
                    <Empty description="暂无历史报告" />
                  )}
                </Space>
              </Card>
            )
          },
          {
            key: 'subscriptions',
            label: '订阅管理',
            disabled: !selectedPortfolio,
            children: selectedPortfolio && (
              <Card title={`${selectedPortfolio.name} - 邮件订阅`}>
                <List
                  dataSource={portfolioSubscriptions}
                  renderItem={(subscription) => (
                    <List.Item>
                      <List.Item.Meta
                        title={subscription.email}
                        description={`订阅时间: ${new Date(subscription.created_at).toLocaleString()}`}
                      />
                      <Tag color={subscription.is_active ? 'green' : 'red'}>
                        {subscription.is_active ? '活跃' : '已暂停'}
                      </Tag>
                    </List.Item>
                  )}
                  locale={{ emptyText: '暂无订阅者' }}
                />
              </Card>
            )
          }
        ]}
      />

      {/* 创建/编辑投资组合弹窗 */}
      <Modal
        title={editingPortfolio ? '编辑投资组合' : '创建投资组合'}
        open={isPortfolioModalVisible}
        onOk={handlePortfolioModalOk}
        onCancel={() => {
          setIsPortfolioModalVisible(false);
          setEditingPortfolio(null);
          portfolioForm.resetFields();
        }}
        confirmLoading={createPortfolioMutation.isLoading || updatePortfolioMutation.isLoading}
      >
        <Form
          form={portfolioForm}
          layout="vertical"
        >
          <Form.Item
            name="name"
            label="投资组合名称"
            rules={[{ required: true, message: '请输入投资组合名称' }]}
          >
            <Input placeholder="如：科技股投资组合" />
          </Form.Item>

          <Form.Item
            name="description"
            label="描述"
          >
            <TextArea 
              placeholder="描述这个投资组合的投资策略或目标"
              rows={3}
            />
          </Form.Item>

          <Form.Item
            name="is_public"
            label="是否公开"
            valuePropName="checked"
          >
            <Select placeholder="选择可见性">
              <Option value={true}>公开 - 其他用户可以订阅</Option>
              <Option value={false}>私有 - 仅自己可见</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* 添加股票弹窗 */}
      <Modal
        title="添加股票"
        open={isStockModalVisible}
        onOk={handleStockModalOk}
        onCancel={() => {
          setIsStockModalVisible(false);
          stockForm.resetFields();
        }}
        confirmLoading={addStockMutation.isLoading}
      >
        <Form
          form={stockForm}
          layout="vertical"
        >
          <Form.Item
            name="symbol"
            label="股票代码"
            rules={[{ required: true, message: '请输入股票代码' }]}
          >
            <Input
              placeholder="如：AAPL, TSLA"
              style={{ textTransform: 'uppercase' }}
            />
          </Form.Item>

          <Form.Item
            name="name"
            label="公司名称"
            rules={[{ required: true, message: '请输入公司名称' }]}
          >
            <Input placeholder="如：苹果公司, 特斯拉" />
          </Form.Item>

          <Form.Item
            name="sector"
            label="行业分类"
          >
            <Select placeholder="选择行业分类" allowClear>
              <Option value="科技">科技</Option>
              <Option value="金融">金融</Option>
              <Option value="医疗">医疗</Option>
              <Option value="消费">消费</Option>
              <Option value="能源">能源</Option>
              <Option value="工业">工业</Option>
              <Option value="房地产">房地产</Option>
              <Option value="公用事业">公用事业</Option>
              <Option value="材料">材料</Option>
              <Option value="通信">通信</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* 发送报告弹窗 */}
      <Modal
        title="发送投资组合报告"
        open={isSendReportModalVisible}
        onOk={handleSendReportOk}
        onCancel={() => {
          setIsSendReportModalVisible(false);
          sendReportForm.resetFields();
        }}
        confirmLoading={sendReportMutation.isLoading}
        width={600}
      >
        <Form
          form={sendReportForm}
          layout="vertical"
        >
          <Form.Item
            name="emails"
            label="邮件地址"
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
            name="date"
            label="报告日期"
            help="不选择则生成当日报告"
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 报告预览弹窗 */}
      <Modal
        title="投资组合报告预览"
        open={isReportModalVisible}
        onCancel={() => setIsReportModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setIsReportModalVisible(false)}>
            关闭
          </Button>,
          <Button key="send" type="primary" onClick={handleSendReport}>
            发送报告
          </Button>
        ]}
        width={800}
      >
        {reportData && (
          <div>
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <Card size="small">
                <Row gutter={16}>
                  <Col span={6}>
                    <div style={{ textAlign: 'center' }}>
                      <Title level={4} style={{ margin: 0, color: '#1890ff' }}>
                        {reportData.portfolio?.stockCount || 0}
                      </Title>
                      <Text type="secondary">股票数量</Text>
                    </div>
                  </Col>
                  <Col span={6}>
                    <div style={{ textAlign: 'center' }}>
                      <Title level={4} style={{ margin: 0, color: '#52c41a' }}>
                        {reportData.totalNews || 0}
                      </Title>
                      <Text type="secondary">相关新闻</Text>
                    </div>
                  </Col>
                  <Col span={6}>
                    <div style={{ textAlign: 'center' }}>
                      <Title level={4} style={{ margin: 0, color: '#722ed1' }}>
                        {reportData.marketSentiment?.toFixed(2) || 0}
                      </Title>
                      <Text type="secondary">市场情绪</Text>
                    </div>
                  </Col>
                  <Col span={6}>
                    <div style={{ textAlign: 'center' }}>
                      <Title level={4} style={{ margin: 0, color: '#fa8c16' }}>
                        {reportData.metrics?.weeklyNewsCount || 0}
                      </Title>
                      <Text type="secondary">周新闻数</Text>
                    </div>
                  </Col>
                </Row>
              </Card>

              <Card title="投资组合股票" size="small">
                {reportData.portfolio?.stocks?.length > 0 ? (
                  <Space wrap>
                    {reportData.portfolio.stocks.map(stock => (
                      <Tag key={stock.symbol} color="blue">
                        {stock.symbol} - {stock.name}
                      </Tag>
                    ))}
                  </Space>
                ) : (
                  <Text type="secondary">投资组合为空</Text>
                )}
              </Card>

              <Card title="相关新闻摘要" size="small">
                {reportData.portfolioNews?.length > 0 ? (
                  <List
                    dataSource={reportData.portfolioNews.slice(0, 3)}
                    renderItem={(news) => (
                      <List.Item>
                        <List.Item.Meta
                          title={<a href={news.url} target="_blank" rel="noopener noreferrer">{news.title}</a>}
                          description={`${news.source} - ${news.summary?.substring(0, 100)}...`}
                        />
                      </List.Item>
                    )}
                  />
                ) : (
                  <Text type="secondary">暂无相关新闻</Text>
                )}
              </Card>
            </Space>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default PortfolioManager;
