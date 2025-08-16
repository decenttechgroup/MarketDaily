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
  Upload
} from 'antd';
import { 
  PlusOutlined, 
  DeleteOutlined, 
  EditOutlined,
  UploadOutlined,
  DownloadOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';

const { Title, Text } = Typography;
const { Option } = Select;

const Portfolio = () => {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingStock, setEditingStock] = useState(null);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  // 获取投资组合数据
  const { data: portfolio = [], isLoading } = useQuery(
    'portfolio',
    () => axios.get('/api/portfolio').then(res => res.data)
  );

  // 获取投资组合相关新闻
  const { data: portfolioNews = [] } = useQuery(
    'portfolio-news',
    () => axios.get('/api/portfolio/news').then(res => res.data)
  );

  // 添加股票
  const addStockMutation = useMutation(
    (data) => axios.post('/api/portfolio', data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('portfolio');
        message.success('股票添加成功');
        setIsModalVisible(false);
        form.resetFields();
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '添加失败');
      }
    }
  );

  // 更新股票
  const updateStockMutation = useMutation(
    ({ id, data }) => axios.put(`/api/portfolio/${id}`, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('portfolio');
        message.success('股票更新成功');
        setIsModalVisible(false);
        setEditingStock(null);
        form.resetFields();
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '更新失败');
      }
    }
  );

  // 删除股票
  const deleteStockMutation = useMutation(
    (id) => axios.delete(`/api/portfolio/${id}`),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('portfolio');
        message.success('股票删除成功');
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '删除失败');
      }
    }
  );

  // 批量导入股票
  const batchImportMutation = useMutation(
    (stocks) => axios.post('/api/portfolio/batch', { stocks }),
    {
      onSuccess: (response) => {
        queryClient.invalidateQueries('portfolio');
        const { added, errors } = response.data;
        message.success(`成功添加 ${added.length} 只股票`);
        if (errors.length > 0) {
          message.warning(`${errors.length} 只股票添加失败`);
        }
      },
      onError: (error) => {
        message.error(error.response?.data?.error || '批量导入失败');
      }
    }
  );

  const handleAddStock = () => {
    setEditingStock(null);
    setIsModalVisible(true);
    form.resetFields();
  };

  const handleEditStock = (stock) => {
    setEditingStock(stock);
    setIsModalVisible(true);
    form.setFieldsValue(stock);
  };

  const handleDeleteStock = (id) => {
    deleteStockMutation.mutate(id);
  };

  const handleModalOk = () => {
    form.validateFields().then((values) => {
      if (editingStock) {
        updateStockMutation.mutate({ id: editingStock.id, data: values });
      } else {
        addStockMutation.mutate(values);
      }
    });
  };

  const handleModalCancel = () => {
    setIsModalVisible(false);
    setEditingStock(null);
    form.resetFields();
  };

  const handleImportCSV = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csv = e.target.result;
        const lines = csv.split('\n');
        const stocks = [];
        
        // 跳过标题行
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line) {
            const [symbol, name, sector] = line.split(',');
            if (symbol && name) {
              stocks.push({
                symbol: symbol.trim(),
                name: name.trim(),
                sector: sector?.trim() || null
              });
            }
          }
        }
        
        if (stocks.length > 0) {
          batchImportMutation.mutate(stocks);
        } else {
          message.error('CSV文件格式不正确');
        }
      } catch (error) {
        message.error('CSV文件解析失败');
      }
    };
    reader.readAsText(file);
    return false; // 阻止默认上传
  };

  const handleExportCSV = () => {
    if (portfolio.length === 0) {
      message.warning('没有数据可导出');
      return;
    }

    const csv = [
      'Symbol,Name,Sector',
      ...portfolio.map(stock => `${stock.symbol},${stock.name},${stock.sector || ''}`)
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `portfolio_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const columns = [
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
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEditStock(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这只股票吗？"
            onConfirm={() => handleDeleteStock(record.id)}
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
        <Title level={2} className="page-title">投资组合</Title>
        <Text className="page-description">
          管理您关注的股票，系统将为您推送相关新闻
        </Text>
      </div>

      <Card
        title={`投资组合 (${portfolio.length} 只股票)`}
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
              icon={<DownloadOutlined />}
              onClick={handleExportCSV}
            >
              导出CSV
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
        style={{ marginBottom: '24px' }}
      >
        <Table
          columns={columns}
          dataSource={portfolio}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* 相关新闻 */}
      {portfolioNews.length > 0 && (
        <Card title="投资组合相关新闻">
          <Table
            columns={newsColumns}
            dataSource={portfolioNews}
            rowKey="id"
            pagination={{ pageSize: 5 }}
          />
        </Card>
      )}

      {/* 添加/编辑股票弹窗 */}
      <Modal
        title={editingStock ? '编辑股票' : '添加股票'}
        visible={isModalVisible}
        onOk={handleModalOk}
        onCancel={handleModalCancel}
        confirmLoading={addStockMutation.isLoading || updateStockMutation.isLoading}
      >
        <Form
          form={form}
          layout="vertical"
        >
          <Form.Item
            name="symbol"
            label="股票代码"
            rules={[{ required: true, message: '请输入股票代码' }]}
          >
            <Input
              placeholder="如：AAPL, TSLA"
              disabled={!!editingStock}
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
    </div>
  );
};

export default Portfolio;
