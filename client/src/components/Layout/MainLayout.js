import React from 'react';
import { Layout, Menu, Dropdown, Avatar, Button } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  DashboardOutlined,
  PieChartOutlined,
  FileTextOutlined,
  MailOutlined,
  SettingOutlined,
  UserOutlined,
  LogoutOutlined,
  RobotOutlined
} from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';

const { Header, Sider, Content } = Layout;

const MainLayout = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const menuItems = [
    {
      key: '/',
      icon: <DashboardOutlined />,
      label: '仪表板'
    },
    {
      key: '/portfolio-manager',
      icon: <PieChartOutlined />,
      label: '投资组合管理'
    },
    {
      key: '/subscriptions',
      icon: <MailOutlined />,
      label: '订阅管理'
    },
    {
      key: '/news',
      icon: <FileTextOutlined />,
      label: '报告中心'
    },
    {
      key: '/openai-logs',
      icon: <RobotOutlined />,
      label: 'AI日志监控'
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: '系统设置'
    }
  ];

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '个人资料'
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: logout
    }
  ];

  const handleMenuClick = ({ key }) => {
    navigate(key);
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="dark" width={200}>
        <div className="logo" style={{ 
          color: 'white', 
          padding: '16px', 
          fontSize: '18px', 
          fontWeight: 'bold',
          textAlign: 'center',
          borderBottom: '1px solid #404040'
        }}>
          📊 市场日报
        </div>
        
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
          style={{ marginTop: '16px' }}
        />
      </Sider>

      <Layout>
        <Header style={{ 
          background: '#fff', 
          padding: '0 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 1px 4px rgba(0,21,41,.08)'
        }}>
          <div />
          
          <Dropdown
            menu={{ items: userMenuItems }}
            placement="bottomRight"
            trigger={['click']}
          >
            <Button type="text" style={{ height: 'auto', padding: '4px 8px' }}>
              <Avatar size="small" icon={<UserOutlined />} style={{ marginRight: '8px' }} />
              <span style={{ color: '#262626' }}>
                {user?.email}
                {user?.role === 'admin' && (
                  <span style={{ 
                    marginLeft: '8px', 
                    fontSize: '12px', 
                    color: '#1890ff',
                    background: '#e6f7ff',
                    padding: '2px 6px',
                    borderRadius: '4px'
                  }}>
                    管理员
                  </span>
                )}
              </span>
            </Button>
          </Dropdown>
        </Header>

        <Content style={{ margin: '24px', background: '#f5f5f5' }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
