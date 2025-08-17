import React, { useState } from 'react';
import { 
  Card, 
  Table, 
  Button, 
  Space, 
  Typography,
  Tag,
  Modal,
  Row,
  Col,
  DatePicker,
  Select,
  Statistic,
  message,
  Tabs,
  List,
  Avatar,
  Tooltip
} from 'antd';
import {
  ReloadOutlined,
  FileTextOutlined,
  SendOutlined,
  EyeOutlined,
  BarChartOutlined,
  CalendarOutlined,
  MailOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;
const { TabPane } = Tabs;

const ReportCenter = () => {
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedPortfolio, setSelectedPortfolio] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [isReportDetailVisible, setIsReportDetailVisible] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [isRegenerateModalVisible, setIsRegenerateModalVisible] = useState(false);
  const queryClient = useQueryClient();

  // 获取报告列表
  const { data: reportsData, isLoading: reportsLoading } = useQuery(
    ['reports', currentPage, selectedPortfolio, selectedDate],
    () => {
      const params = {
        page: currentPage,
        limit: 20
      };
      
      if (selectedPortfolio !== 'all') {
        params.portfolio_id = selectedPortfolio;
      }
      
      if (selectedDate) {
        params.date_from = selectedDate.format('YYYY-MM-DD');
        params.date_to = selectedDate.format('YYYY-MM-DD');
      }
      
      return axios.get('/api/reports', { params }).then(res => res.data);
    },
    { keepPreviousData: true }
  );

  // 获取投资组合列表
  const { data: portfolios = [] } = useQuery(
    'portfolios',
    () => axios.get('/api/portfolios').then(res => res.data)
  );

  // 获取报告统计
  const { data: reportStats } = useQuery(
    'report-stats',
    () => axios.get('/api/reports/stats').then(res => res.data),
    { refetchInterval: 300000 }
  );

  // 重新生成报告
  const regenerateReportMutation = useMutation(
    (data) => axios.post('/api/reports/regenerate', data),
    {
      onSuccess: () => {
        message.success('报告重新生成并发送成功');
        setIsRegenerateModalVisible(false);
        queryClient.invalidateQueries('reports');
      },
      onError: () => {
        message.error('报告重新生成失败');
      }
    }
  );

  const reportColumns = [
    {
      title: '报告日期',
      dataIndex: 'report_date',
      key: 'report_date',
      width: '15%',
      render: (date) => (
        <Space direction="vertical" size={0}>
          <Text strong>{dayjs(date).format('YYYY-MM-DD')}</Text>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {dayjs(date).format('dddd')}
          </Text>
        </Space>
      ),
      sorter: (a, b) => dayjs(a.report_date).unix() - dayjs(b.report_date).unix()
    },
    {
      title: '投资组合',
      dataIndex: 'portfolio_name',
      key: 'portfolio_name',
      width: '20%',
      render: (name, record) => (
        <Space>
          <Avatar size="small" style={{ backgroundColor: '#1890ff' }}>
            {name ? name.charAt(0) : 'G'}
          </Avatar>
          <Space direction="vertical" size={0}>
            <Text strong>{name || '综合日报'}</Text>
            {record.is_public && (
              <Tag size="small" color="green">公开</Tag>
            )}
          </Space>
        </Space>
      )
    },
    {
      title: '报告主题',
      dataIndex: 'subject',
      key: 'subject',
      width: '25%',
      ellipsis: true,
      render: (subject) => (
        <Tooltip title={subject}>
          <Text>{subject}</Text>
        </Tooltip>
      )
    },
    {
      title: '发送数量',
      dataIndex: 'recipient_count',
      key: 'recipient_count',
      width: '10%',
      render: (count) => (
        <Statistic 
          value={count} 
          suffix="份"
          valueStyle={{ fontSize: '14px' }}
        />
      ),
      sorter: (a, b) => a.recipient_count - b.recipient_count
    },
    {
      title: '发送状态',
      dataIndex: 'status',
      key: 'status',
      width: '10%',
      render: (status) => (
        <Tag color={status === 'sent' ? 'green' : status === 'failed' ? 'red' : 'orange'}>
          {status === 'sent' ? '已发送' : status === 'failed' ? '发送失败' : '待发送'}
        </Tag>
      )
    },
    {
      title: '发送时间',
      dataIndex: 'sent_at',
      key: 'sent_at',
      width: '15%',
      render: (time) => dayjs(time).format('MM-DD HH:mm')
    },
    {
      title: '操作',
      key: 'actions',
      width: '15%',
      render: (_, record) => (
        <Space>
          <Button 
            size="small" 
            icon={<EyeOutlined />}
            onClick={() => handleViewReport(record)}
          >
            查看
          </Button>
          <Button 
            size="small" 
            icon={<SendOutlined />}
            onClick={() => handleRegenerateReport(record)}
          >
            重发
          </Button>
        </Space>
      )
    }
  ];

  const handleViewReport = (report) => {
    setSelectedReport(report);
    setIsReportDetailVisible(true);
  };

  const handleRegenerateReport = (report) => {
    setSelectedReport(report);
    setIsRegenerateModalVisible(true);
  };

  const handleRegenerateConfirm = () => {
    if (!selectedReport || !selectedReport.portfolio_id) {
      message.error('无法重新生成该报告');
      return;
    }

    // 这里需要获取原始收件人列表，暂时使用示例数据
    const regenerateData = {
      portfolio_id: selectedReport.portfolio_id,
      date: selectedReport.report_date,
      emails: [selectedReport.recipient] // 实际应该获取所有原始收件人
    };

    regenerateReportMutation.mutate(regenerateData);
  };

  const renderStatsCards = () => {
    if (!reportStats) return null;

    const todayStats = reportStats.daily_stats.find(
      stat => stat.date === dayjs().format('YYYY-MM-DD')
    ) || { total_emails: 0, successful_emails: 0, failed_emails: 0 };

    return (
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="今日发送"
              value={todayStats.total_emails}
              suffix="份"
              prefix={<MailOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="成功发送"
              value={todayStats.successful_emails}
              suffix="份"
              valueStyle={{ color: '#3f8600' }}
              prefix={<SendOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="发送失败"
              value={todayStats.failed_emails}
              suffix="份"
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="总投资组合"
              value={reportStats.portfolio_stats.length}
              suffix="个"
              prefix={<BarChartOutlined />}
            />
          </Card>
        </Col>
      </Row>
    );
  };

  const renderPortfolioStats = () => {
    if (!reportStats?.portfolio_stats) return null;

    return (
      <Card title="投资组合报告统计" style={{ marginBottom: 24 }}>
        <List
          dataSource={reportStats.portfolio_stats}
          renderItem={(item) => (
            <List.Item>
              <List.Item.Meta
                avatar={
                  <Avatar style={{ backgroundColor: '#1890ff' }}>
                    {item.portfolio_name.charAt(0)}
                  </Avatar>
                }
                title={item.portfolio_name}
                description={
                  <Space>
                    <Text type="secondary">已发送 {item.report_count} 次</Text>
                    {item.last_report_date && (
                      <Text type="secondary">
                        最近: {dayjs(item.last_report_date).format('MM-DD HH:mm')}
                      </Text>
                    )}
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      </Card>
    );
  };

  return (
    <div style={{ padding: 24 }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={3}>
            <FileTextOutlined /> 报告中心
          </Title>
          <Paragraph type="secondary">
            查看和管理所有投资组合报告的发送记录
          </Paragraph>
        </Col>
        <Col>
          <Space>
            <Button 
              icon={<ReloadOutlined />}
              onClick={() => queryClient.invalidateQueries('reports')}
            >
              刷新
            </Button>
          </Space>
        </Col>
      </Row>

      <Tabs defaultActiveKey="reports">
        <TabPane tab="报告列表" key="reports">
          {renderStatsCards()}
          
          <Card>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={6}>
                <Select
                  style={{ width: '100%' }}
                  placeholder="选择投资组合"
                  value={selectedPortfolio}
                  onChange={setSelectedPortfolio}
                >
                  <Option value="all">全部投资组合</Option>
                  {portfolios.map(portfolio => (
                    <Option key={portfolio.id} value={portfolio.id}>
                      {portfolio.name}
                    </Option>
                  ))}
                </Select>
              </Col>
              <Col span={6}>
                <DatePicker
                  style={{ width: '100%' }}
                  placeholder="选择日期"
                  value={selectedDate}
                  onChange={setSelectedDate}
                  allowClear
                />
              </Col>
            </Row>

            <Table
              columns={reportColumns}
              dataSource={reportsData?.reports || []}
              loading={reportsLoading}
              rowKey="id"
              pagination={{
                current: currentPage,
                pageSize: 20,
                total: reportsData?.pagination?.total || 0,
                onChange: setCurrentPage,
                showSizeChanger: false,
                showQuickJumper: true,
                showTotal: (total, range) => 
                  `第 ${range[0]}-${range[1]} 条，共 ${total} 条记录`
              }}
            />
          </Card>
        </TabPane>

        <TabPane tab="统计分析" key="stats">
          {renderPortfolioStats()}
        </TabPane>
      </Tabs>

      {/* 报告详情模态框 */}
      <Modal
        title="报告详情"
        visible={isReportDetailVisible}
        onCancel={() => setIsReportDetailVisible(false)}
        footer={null}
        width={800}
      >
        {selectedReport && (
          <div>
            <Row gutter={16}>
              <Col span={12}>
                <Text strong>报告日期:</Text>
                <br />
                <Text>{dayjs(selectedReport.report_date).format('YYYY年MM月DD日')}</Text>
              </Col>
              <Col span={12}>
                <Text strong>投资组合:</Text>
                <br />
                <Text>{selectedReport.portfolio_name || '综合日报'}</Text>
              </Col>
            </Row>
            <br />
            <Row gutter={16}>
              <Col span={12}>
                <Text strong>收件人:</Text>
                <br />
                <Text>{selectedReport.recipient}</Text>
              </Col>
              <Col span={12}>
                <Text strong>发送时间:</Text>
                <br />
                <Text>{dayjs(selectedReport.sent_at).format('YYYY-MM-DD HH:mm:ss')}</Text>
              </Col>
            </Row>
            <br />
            <Text strong>邮件主题:</Text>
            <br />
            <Text>{selectedReport.subject}</Text>
          </div>
        )}
      </Modal>

      {/* 重新生成报告模态框 */}
      <Modal
        title="重新生成报告"
        visible={isRegenerateModalVisible}
        onOk={handleRegenerateConfirm}
        onCancel={() => setIsRegenerateModalVisible(false)}
        confirmLoading={regenerateReportMutation.isLoading}
      >
        <p>确定要重新生成并发送该报告吗？</p>
        {selectedReport && (
          <div>
            <Text strong>报告日期:</Text> {dayjs(selectedReport.report_date).format('YYYY年MM月DD日')}
            <br />
            <Text strong>投资组合:</Text> {selectedReport.portfolio_name || '综合日报'}
            <br />
            <Text strong>原收件人:</Text> {selectedReport.recipient}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ReportCenter;
