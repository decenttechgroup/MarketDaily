import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout, Spin } from 'antd';
import { useAuth } from './contexts/AuthContext';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Portfolio from './components/Portfolio';
import PortfolioManager from './components/PortfolioManager';
import EnhancedPortfolioManager from './components/EnhancedPortfolioManager';
import PortfolioSubscription from './components/PortfolioSubscription';
import SubscriptionManager from './components/SubscriptionManager';
import News from './components/News';
import Email from './components/Email';
import Settings from './components/Settings';
import MainLayout from './components/Layout/MainLayout';

const App = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Layout style={{ minHeight: '100vh', justifyContent: 'center', alignItems: 'center' }}>
        <Spin size="large" tip="加载中..." />
      </Layout>
    );
  }

  // 公开路由（不需要登录）
  if (window.location.pathname === '/subscribe') {
    return <PortfolioSubscription />;
  }

  if (!user) {
    return <Login />;
  }

  return (
    <MainLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/portfolio-manager" element={<EnhancedPortfolioManager />} />
        <Route path="/news" element={<News />} />
        <Route path="/email" element={<Email />} />
        <Route path="/subscriptions" element={<SubscriptionManager />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </MainLayout>
  );
};

export default App;
