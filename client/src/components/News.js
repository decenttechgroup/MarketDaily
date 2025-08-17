import React, { useState } from 'react';
import { 
  Card, 
  Table, 
  Input, 
  Select, 
  Button, 
  Space, 
  Typography,
  Tag,
  Modal,
  Row,
  Col,
  DatePicker,
  Slider,
  message
} from 'antd';
import {
  ReloadOutlined,
  FilterOutlined,
  RiseOutlined,
  FallOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import axios from 'axios';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;
const { Search } = Input;

const News = () => {
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState({
    categories: [],
    sources: [],
    dateRange: null,
    sentimentRange: [-1, 1]
  });
  const queryClient = useQueryClient();

  // 获取新闻列表
  const { data: newsData, isLoading } = useQuery(
    ['news', currentPage, selectedCategory, searchText],
    () => axios.get('/api/news', {
      params: {
        page: currentPage,
        limit: 20,
        category: selectedCategory !== 'all' ? selectedCategory : undefined,
        search: searchText || undefined
      }
    }).then(res => res.data),
    { 
      keepPreviousData: true,
      refetchInterval: 300000 // 每5分钟刷新
    }
  );

  // 获取新闻分类统计
  const { data: categories = [] } = useQuery(
    'news-categories',
    () => axios.get('/api/news/stats/categories').then(res => res.data)
  );

  // 获取新闻来源统计
  const { data: sources = [] } = useQuery(
    'news-sources',
    () => axios.get('/api/news/stats/sources').then(res => res.data)
  );

  // 手动更新新闻
  const updateNewsMutation = useMutation(
    () => axios.post('/api/news/update'),
    {
      onSuccess: () => {
        message.success('新闻更新已开始，请稍后刷新查看');
        queryClient.invalidateQueries('news');
      },
      onError: () => {
        message.error('更新失败，请稍后重试');
      }
    }
  );

  // 高级搜索
  const advancedSearchMutation = useMutation(
    (filters) => axios.post('/api/news/search', filters),
    {
      onSuccess: (response) => {
        // 这里可以设置搜索结果到状态中
        message.success(`找到 ${response.data.length} 条相关新闻`);
      },
      onError: () => {
        message.error('搜索失败，请重试');
      }
    }
  );

  const getSentimentIcon = (sentiment) => {
    if (sentiment > 0.1) return <RiseOutlined style={{ color: '#52c41a' }} />;
    if (sentiment < -0.1) return <FallOutlined style={{ color: '#ff4d4f' }} />;
    return <FileTextOutlined style={{ color: '#faad14' }} />;
  };

  const getSentimentText = (sentiment) => {
    if (sentiment > 0.1) return '积极';
    if (sentiment < -0.1) return '消极';
    return '中性';
  };

  const getSentimentColor = (sentiment) => {
    if (sentiment > 0.1) return 'success';
    if (sentiment < -0.1) return 'error';
    return 'warning';
  };

  const handleSearch = (value) => {
    setSearchText(value);
    setCurrentPage(1);
  };

  const handleCategoryChange = (value) => {
    setSelectedCategory(value);
    setCurrentPage(1);
  };

  const handleUpdateNews = () => {
    updateNewsMutation.mutate();
  };

  const handleAdvancedSearch = () => {
    const filters = {
      query: searchText || '',
      categories: advancedFilters.categories,
      sources: advancedFilters.sources,
      dateFrom: advancedFilters.dateRange?.[0]?.toISOString(),
      dateTo: advancedFilters.dateRange?.[1]?.toISOString(),
      sentimentRange: advancedFilters.sentimentRange,
      limit: 50
    };

    if (!filters.query.trim()) {
      message.warning('请输入搜索关键词');
      return;
    }

    advancedSearchMutation.mutate(filters);
  };

  const columns = [
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      width: '40%',
      render: (title, record) => (
        <div>
          <a
            href={record.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: '14px', fontWeight: 500 }}
          >
            {title}
          </a>
          {record.summary && (
            <div style={{ 
              marginTop: '8px', 
              color: '#666', 
              fontSize: '12px',
              lineHeight: 1.4 
            }}>
              {record.summary.length > 150 
                ? record.summary.substring(0, 150) + '...'
                : record.summary
              }
            </div>
          )}
        </div>
      )
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: '10%',
      render: (category) => (
        <Tag color="blue">{category || '未分类'}</Tag>
      )
    },
    {
      title: '相关股票',
      dataIndex: 'symbols',
      key: 'symbols',
      width: '15%',
      render: (symbols) => {
        const parsedSymbols = JSON.parse(symbols || '[]');
        if (parsedSymbols.length === 0) return <Text type="secondary">无</Text>;
        
        return (
          <div>
            {parsedSymbols.slice(0, 3).map(symbol => (
              <Tag key={symbol} color="green" style={{ margin: '2px' }}>
                {symbol}
              </Tag>
            ))}
            {parsedSymbols.length > 3 && (
              <Text type="secondary">+{parsedSymbols.length - 3}</Text>
            )}
          </div>
        );
      }
    },
    {
      title: '情感',
      dataIndex: 'sentiment',
      key: 'sentiment',
      width: '10%',
      render: (sentiment) => (
        sentiment !== null ? (
          <Tag color={getSentimentColor(sentiment)} icon={getSentimentIcon(sentiment)}>
            {getSentimentText(sentiment)}
          </Tag>
        ) : <Text type="secondary">未分析</Text>
      )
    },
    {
      title: '来源',
      dataIndex: 'source',
      key: 'source',
      width: '12%',
      render: (source) => <Text type="secondary">{source}</Text>
    },
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: '13%',
      render: (date) => (
        <Text type="secondary">
          {dayjs(date).format('MM-DD HH:mm')}
        </Text>
      )
    }
  ];

  return (
    <div>
      <div className="page-header">
        <Title level={2} className="page-title">新闻资讯</Title>
        <Text className="page-description">
          实时财经新闻聚合，智能分析市场情绪
        </Text>
      </div>

      <Card style={{ marginBottom: '24px' }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={12} md={8}>
            <Search
              placeholder="搜索新闻标题或摘要"
              allowClear
              onSearch={handleSearch}
              style={{ width: '100%' }}
            />
          </Col>
          
          <Col xs={24} sm={12} md={6}>
            <Select
              value={selectedCategory}
              onChange={handleCategoryChange}
              style={{ width: '100%' }}
              placeholder="选择分类"
            >
              <Option value="all">全部分类</Option>
              {categories.map(cat => (
                <Option key={cat.category} value={cat.category}>
                  {cat.category} ({cat.count})
                </Option>
              ))}
            </Select>
          </Col>
          
          <Col xs={24} sm={24} md={10}>
            <Space>
              <Button
                icon={<FilterOutlined />}
                onClick={() => setIsFilterModalVisible(true)}
              >
                高级筛选
              </Button>
              
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                onClick={handleUpdateNews}
                loading={updateNewsMutation.isLoading}
              >
                更新新闻
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card>
        <Table
          columns={columns}
          dataSource={newsData?.news || []}
          rowKey="id"
          loading={isLoading}
          pagination={{
            current: currentPage,
            total: newsData?.pagination?.total || 0,
            pageSize: 20,
            showSizeChanger: false,
            showQuickJumper: true,
            showTotal: (total, range) => 
              `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
            onChange: (page) => setCurrentPage(page)
          }}
          scroll={{ x: 1000 }}
        />
      </Card>

      {/* 高级筛选弹窗 */}
      <Modal
        title="高级筛选"
        open={isFilterModalVisible}
        onOk={handleAdvancedSearch}
        onCancel={() => setIsFilterModalVisible(false)}
        confirmLoading={advancedSearchMutation.isLoading}
        width={600}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <div>
            <Text strong>搜索关键词</Text>
            <Input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="输入搜索关键词"
              style={{ marginTop: '8px' }}
            />
          </div>

          <div>
            <Text strong>分类筛选</Text>
            <Select
              mode="multiple"
              value={advancedFilters.categories}
              onChange={(values) => setAdvancedFilters(prev => ({ ...prev, categories: values }))}
              placeholder="选择分类"
              style={{ width: '100%', marginTop: '8px' }}
            >
              {categories.map(cat => (
                <Option key={cat.category} value={cat.category}>
                  {cat.category} ({cat.count})
                </Option>
              ))}
            </Select>
          </div>

          <div>
            <Text strong>来源筛选</Text>
            <Select
              mode="multiple"
              value={advancedFilters.sources}
              onChange={(values) => setAdvancedFilters(prev => ({ ...prev, sources: values }))}
              placeholder="选择来源"
              style={{ width: '100%', marginTop: '8px' }}
            >
              {sources.map(source => (
                <Option key={source.source} value={source.source}>
                  {source.source} ({source.count})
                </Option>
              ))}
            </Select>
          </div>

          <div>
            <Text strong>时间范围</Text>
            <RangePicker
              value={advancedFilters.dateRange}
              onChange={(dates) => setAdvancedFilters(prev => ({ ...prev, dateRange: dates }))}
              style={{ width: '100%', marginTop: '8px' }}
            />
          </div>

          <div>
            <Text strong>情感范围</Text>
            <div style={{ marginTop: '16px', marginBottom: '8px' }}>
              <Slider
                range
                min={-1}
                max={1}
                step={0.1}
                value={advancedFilters.sentimentRange}
                onChange={(values) => setAdvancedFilters(prev => ({ ...prev, sentimentRange: values }))}
                marks={{
                  '-1': '消极',
                  '0': '中性',
                  '1': '积极'
                }}
              />
            </div>
          </div>
        </Space>
      </Modal>
    </div>
  );
};

export default News;
