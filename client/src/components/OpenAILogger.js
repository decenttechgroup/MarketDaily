import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Tag, Typography, Alert, Statistic, Row, Col, Tabs } from 'antd';
import { ReloadOutlined, BarChartOutlined, BugOutlined, RobotOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

const OpenAILogger = () => {
  const [logs, setLogs] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/openai/logs?limit=100');
      setLogs(response.data.data.logs || []);
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalysis = async () => {
    try {
      const response = await axios.get('/api/openai/analysis');
      setAnalysis(response.data.data);
    } catch (error) {
      console.error('Failed to fetch analysis:', error);
    }
  };

  useEffect(() => {
    fetchLogs();
    fetchAnalysis();
  }, []);

  useEffect(() => {
    let interval;
    if (autoRefresh) {
      interval = setInterval(() => {
        fetchLogs();
        fetchAnalysis();
      }, 5000); // Refresh every 5 seconds
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  const logColumns = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      render: (timestamp) => new Date(timestamp).toLocaleString(),
      sorter: (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
    },
    {
      title: '操作',
      dataIndex: 'operation',
      key: 'operation',
      width: 250,
      render: (operation) => <Text code>{operation}</Text>,
    },
    {
      title: '模型',
      dataIndex: ['metadata', 'model'],
      key: 'model',
      width: 150,
      render: (model) => model ? <Tag color="blue">{model}</Tag> : '-',
    },
    {
      title: '状态',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type) => (
        <Tag color={type === 'openai_call' ? 'green' : 'red'}>
          {type === 'openai_call' ? '成功' : '错误'}
        </Tag>
      ),
    },
    {
      title: 'Token使用',
      dataIndex: ['metadata', 'usage', 'total_tokens'],
      key: 'tokens',
      width: 100,
      render: (tokens) => tokens || '-',
    },
    {
      title: '响应时间',
      dataIndex: ['metadata', 'duration_ms'],
      key: 'duration',
      width: 100,
      render: (duration) => duration ? `${duration}ms` : '-',
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (_, record) => (
        <Button
          size="small"
          onClick={() => showLogDetails(record)}
        >
          详情
        </Button>
      ),
    },
  ];

  const showLogDetails = (record) => {
    // 在新窗口中显示详细信息
    const detailWindow = window.open('', '_blank', 'width=800,height=600');
    detailWindow.document.write(`
      <html>
        <head>
          <title>OpenAI日志详情</title>
          <style>
            body { font-family: monospace; padding: 20px; }
            .section { margin-bottom: 20px; border: 1px solid #ccc; padding: 10px; }
            .title { font-weight: bold; margin-bottom: 10px; }
            pre { background: #f5f5f5; padding: 10px; overflow: auto; }
          </style>
        </head>
        <body>
          <h2>OpenAI日志详情 - ${record.operation}</h2>
          <div class="section">
            <div class="title">时间: ${new Date(record.timestamp).toLocaleString()}</div>
            <div class="title">状态: ${record.type === 'openai_call' ? '成功' : '错误'}</div>
          </div>
          <div class="section">
            <div class="title">输入:</div>
            <pre>${JSON.stringify(record.input, null, 2)}</pre>
          </div>
          <div class="section">
            <div class="title">输出:</div>
            <pre>${JSON.stringify(record.output, null, 2)}</pre>
          </div>
          <div class="section">
            <div class="title">元数据:</div>
            <pre>${JSON.stringify(record.metadata, null, 2)}</pre>
          </div>
        </body>
      </html>
    `);
  };

  return (
    <div style={{ padding: '20px' }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: '20px' }}>
        <Col>
          <Title level={2}>
            <RobotOutlined /> OpenAI API 日志监控
          </Title>
        </Col>
        <Col>
          <Space>
            <Button
              type={autoRefresh ? 'primary' : 'default'}
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              {autoRefresh ? '停止自动刷新' : '自动刷新'}
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                fetchLogs();
                fetchAnalysis();
              }}
              loading={loading}
            >
              刷新
            </Button>
          </Space>
        </Col>
      </Row>

      <Tabs defaultActiveKey="1" type="card">
        <TabPane tab={<span><BugOutlined />实时日志</span>} key="1">
          <Alert
            message="OpenAI API调用日志"
            description="这里显示所有OpenAI API的输入和输出，包括参数、响应和错误信息。日志会自动保存到服务器的logs/openai.log文件中。"
            type="info"
            showIcon
            style={{ marginBottom: '20px' }}
          />

          <Card>
            <Table
              columns={logColumns}
              dataSource={logs}
              rowKey={(record) => `${record.timestamp}-${record.operation}`}
              pagination={{
                pageSize: 20,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total) => `共 ${total} 条记录`,
              }}
              scroll={{ x: 1000 }}
              loading={loading}
            />
          </Card>
        </TabPane>

        <TabPane tab={<span><BarChartOutlined />使用统计</span>} key="2">
          {analysis && (
            <Row gutter={[16, 16]}>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="总调用次数"
                    value={analysis.totalCalls}
                    prefix={<RobotOutlined />}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="成功调用"
                    value={analysis.successfulCalls}
                    valueStyle={{ color: '#3f8600' }}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="错误调用"
                    value={analysis.errorCalls}
                    valueStyle={{ color: '#cf1322' }}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="平均响应时间"
                    value={analysis.averageResponseTime}
                    suffix="ms"
                  />
                </Card>
              </Col>
              <Col span={8}>
                <Card>
                  <Statistic
                    title="总Token消耗"
                    value={analysis.totalTokens}
                    formatter={(value) => value.toLocaleString()}
                  />
                </Card>
              </Col>
              <Col span={8}>
                <Card>
                  <Statistic
                    title="预估成本"
                    value={analysis.costEstimate}
                    precision={4}
                    prefix="$"
                  />
                </Card>
              </Col>
              <Col span={8}>
                <Card title="操作分布">
                  {Object.entries(analysis.operationCounts).map(([operation, count]) => (
                    <div key={operation}>
                      <Text>{operation}: {count}</Text>
                    </div>
                  ))}
                </Card>
              </Col>
              <Col span={24}>
                <Card title="模型使用情况">
                  <Row gutter={16}>
                    {Object.entries(analysis.modelUsage).map(([model, count]) => (
                      <Col span={6} key={model}>
                        <Tag color="blue" style={{ marginBottom: '8px' }}>
                          {model}: {count}次
                        </Tag>
                      </Col>
                    ))}
                  </Row>
                </Card>
              </Col>
            </Row>
          )}
        </TabPane>
      </Tabs>
    </div>
  );
};

export default OpenAILogger;
