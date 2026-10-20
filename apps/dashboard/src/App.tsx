import React, { useState, useEffect } from 'react';
import { ConfigProvider, Layout, Menu, theme, Typography, Tag, Badge } from 'antd';
import { 
  DashboardOutlined, 
  ProjectOutlined, 
  FileTextOutlined, 
  PlayCircleOutlined, 
  HistoryOutlined,
  ThunderboltOutlined
} from '@ant-design/icons';
import { Overview } from './pages/Overview';
import { ProjectsPage } from './pages/ProjectsPage';
import { TestCasesPage } from './pages/TestCasesPage';
import { RunTestsPage } from './pages/RunTestsPage';
import { ReportsPage } from './pages/ReportsPage';
import { ReportDetailPage } from './pages/ReportDetailPage';
import { api } from './services/api';

const { Header, Content, Sider } = Layout;
const { Text } = Typography;

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [navParams, setNavParams] = useState<any>({});
  const [serviceStatus, setServiceStatus] = useState<boolean>(false);

  useEffect(() => {
    checkServiceHealth();
    const interval = setInterval(checkServiceHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  const checkServiceHealth = async () => {
    try {
      await api.getHealth();
      setServiceStatus(true);
    } catch {
      setServiceStatus(false);
    }
  };

  const handleNavigate = (tab: string, extra?: any) => {
    setActiveTab(tab);
    if (extra) {
      setNavParams(extra);
    }
  };

  const menuItems = [
    { key: 'overview', icon: <DashboardOutlined />, label: 'Overview' },
    { key: 'projects', icon: <ProjectOutlined />, label: 'Projects' },
    { key: 'test-cases', icon: <FileTextOutlined />, label: 'Test Cases' },
    { key: 'run', icon: <PlayCircleOutlined />, label: 'Run Tests' },
    { key: 'reports', icon: <HistoryOutlined />, label: 'Reports' }
  ];

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#0284c7',
          colorBgBase: '#0b0f19',
          colorBgContainer: '#1e293b',
          colorBorder: '#334155',
          colorTextBase: '#f8fafc',
          borderRadius: 8,
          fontFamily: 'Inter, -apple-system, sans-serif'
        }
      }}
    >
      <Layout style={{ minHeight: '100vh' }}>
        <Header>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <ThunderboltOutlined style={{ fontSize: 24, color: '#38bdf8' }} />
            <div>
              <Text strong style={{ fontSize: 18, color: '#f8fafc', letterSpacing: '-0.3px' }}>
                AutoTesting<span style={{ color: '#38bdf8' }}>Studio</span>
              </Text>
              <Tag color="geekblue" style={{ marginLeft: 8, fontSize: 11 }}>v1.0.0</Tag>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Badge 
              status={serviceStatus ? 'success' : 'error'} 
              text={<span style={{ color: serviceStatus ? '#10b981' : '#ef4444', fontSize: 12 }}>
                {serviceStatus ? 'Local Service Connected (127.0.0.1:4000)' : 'Service Offline'}
              </span>} 
            />
          </div>
        </Header>

        <Layout>
          <Sider width={220} breakpoint="lg" collapsedWidth="60">
            <Menu
              mode="inline"
              selectedKeys={[activeTab.startsWith('report-detail') ? 'reports' : activeTab]}
              onClick={({ key }) => handleNavigate(key)}
              items={menuItems}
              style={{ paddingTop: 16, fontSize: 14 }}
            />
          </Sider>

          <Content style={{ padding: '24px 32px', background: '#0b0f19', minHeight: 'calc(100vh - 64px)' }}>
            {activeTab === 'overview' && <Overview onNavigate={handleNavigate} />}
            {activeTab === 'projects' && <ProjectsPage onNavigate={handleNavigate} />}
            {activeTab === 'test-cases' && (
              <TestCasesPage 
                initialProjectId={navParams.projectId} 
                onNavigate={handleNavigate} 
              />
            )}
            {activeTab === 'run' && (
              <RunTestsPage 
                initialProjectId={navParams.projectId} 
                initialTestCaseIds={navParams.testCaseIds}
                onNavigate={handleNavigate} 
              />
            )}
            {activeTab === 'reports' && <ReportsPage onNavigate={handleNavigate} />}
            {activeTab === 'report-detail' && (
              <ReportDetailPage 
                projectId={navParams.projectId} 
                runId={navParams.runId} 
                onBack={() => handleNavigate('reports')} 
              />
            )}
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
};
