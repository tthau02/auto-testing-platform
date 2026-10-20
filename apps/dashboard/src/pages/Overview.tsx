import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Table, Tag, Button, Spin, Alert, Typography } from 'antd';
import { 
  CheckCircleOutlined, 
  CloseCircleOutlined, 
  ThunderboltOutlined, 
  ProjectOutlined,
  PlayCircleOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  CartesianGrid 
} from 'recharts';
import { api, ProjectInfo } from '../services/api';

const { Title, Text } = Typography;

interface OverviewProps {
  onNavigate: (tab: string, extra?: any) => void;
}

export const Overview: React.FC<OverviewProps> = ({ onNavigate }) => {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [allReports, setAllReports] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const projs = await api.getProjects();
      setProjects(projs);

      // Collect past reports from all projects
      const reportPromises = projs.map(p => api.getReports(p.id).catch(() => []));
      const reportsNested = await Promise.all(reportPromises);
      const flattened = reportsNested.flat().sort((a, b) => (b.startTime || '').localeCompare(a.startTime || ''));
      setAllReports(flattened);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const totalRuns = allReports.length;
  const passedRuns = allReports.filter(r => r.status === 'PASS').length;
  const failedRuns = allReports.filter(r => r.status === 'FAIL' || r.status === 'ERROR').length;
  const passRate = totalRuns > 0 ? ((passedRuns / totalRuns) * 100).toFixed(1) : '100';

  const chartData = allReports.slice(0, 10).reverse().map((r, index) => ({
    name: r.runId ? r.runId.substring(11, 16) : `Run ${index + 1}`,
    passed: r.counts?.pass || 0,
    failed: r.counts?.fail || 0,
    total: r.counts?.total || 0
  }));

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Spin size="large" tip="Loading QA Studio Metrics..." />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {error && <Alert type="error" message={error} banner closable />}

      {/* Top Welcome & KPI row */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.15) 0%, rgba(99, 102, 241, 0.15) 100%)',
        border: '1px solid rgba(56, 189, 248, 0.2)',
        borderRadius: 16,
        padding: '24px 32px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <Title level={2} style={{ margin: 0, color: '#f8fafc' }}>
            ⚡ Dynamic Auto Testing Studio
          </Title>
          <Text style={{ color: '#94a3b8', fontSize: 15 }}>
            Cross-Project Playwright & API Test Engine with Automated Evidence Tracking
          </Text>
        </div>
        <Button 
          type="primary" 
          size="large" 
          icon={<PlayCircleOutlined />} 
          style={{ background: '#0284c7', borderColor: '#38bdf8', height: 46, padding: '0 28px', fontSize: 16, fontWeight: 600 }}
          onClick={() => onNavigate('run')}
        >
          Execute Test Run
        </Button>
      </div>

      {/* Metric Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="glass-panel" style={{ borderRadius: 12 }}>
            <Statistic 
              title={<span style={{ color: '#94a3b8' }}>Total Projects</span>}
              value={projects.length}
              prefix={<ProjectOutlined style={{ color: '#38bdf8' }} />}
              valueStyle={{ color: '#f8fafc', fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="glass-panel" style={{ borderRadius: 12 }}>
            <Statistic 
              title={<span style={{ color: '#94a3b8' }}>Overall Pass Rate</span>}
              value={passRate}
              suffix="%"
              prefix={<CheckCircleOutlined style={{ color: '#10b981' }} />}
              valueStyle={{ color: '#10b981', fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="glass-panel" style={{ borderRadius: 12 }}>
            <Statistic 
              title={<span style={{ color: '#94a3b8' }}>Passed Test Runs</span>}
              value={passedRuns}
              prefix={<CheckCircleOutlined style={{ color: '#38bdf8' }} />}
              valueStyle={{ color: '#f8fafc', fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="glass-panel" style={{ borderRadius: 12 }}>
            <Statistic 
              title={<span style={{ color: '#94a3b8' }}>Failed Runs</span>}
              value={failedRuns}
              prefix={<CloseCircleOutlined style={{ color: '#ef4444' }} />}
              valueStyle={{ color: failedRuns > 0 ? '#ef4444' : '#94a3b8', fontWeight: 700 }}
            />
          </Card>
        </Col>
      </Row>

      {/* Execution Trend Chart */}
      {chartData.length > 0 && (
        <Card 
          title={<span style={{ color: '#f8fafc' }}>📈 Recent Test Execution Trends</span>} 
          bordered={false} 
          className="glass-panel"
        >
          <div style={{ height: 260, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPassed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorFailed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }} />
                <Area type="monotone" dataKey="passed" stroke="#10b981" fillOpacity={1} fill="url(#colorPassed)" name="Passed" />
                <Area type="monotone" dataKey="failed" stroke="#ef4444" fillOpacity={1} fill="url(#colorFailed)" name="Failed" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Projects Overview Grid */}
      <Card 
        title={<span style={{ color: '#f8fafc' }}>📂 Registered Projects</span>}
        extra={<Button type="link" onClick={() => onNavigate('projects')}>Manage Projects &rarr;</Button>}
        bordered={false}
        className="glass-panel"
      >
        <Row gutter={[16, 16]}>
          {projects.map(proj => (
            <Col xs={24} md={12} key={proj.id}>
              <div style={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 12,
                padding: 20,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <Text strong style={{ fontSize: 17, color: '#38bdf8' }}>{proj.name}</Text>
                    <Tag color="blue">{proj.id}</Tag>
                    <Tag color="cyan">{proj.environment}</Tag>
                  </div>
                  <Text style={{ color: '#94a3b8', fontSize: 13, display: 'block', marginBottom: 8 }}>
                    {proj.description || `Base URL: ${proj.baseUrl}`}
                  </Text>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <span style={{ fontSize: 12, color: '#cbd5e1' }}>🧪 {proj.testCount} Test Cases</span>
                    <span style={{ fontSize: 12, color: '#cbd5e1' }}>📊 {proj.reportsCount} Past Runs</span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Button 
                    type="primary" 
                    icon={<PlayCircleOutlined />} 
                    onClick={() => onNavigate('run', { projectId: proj.id })}
                  >
                    Run Tests
                  </Button>
                  <Button 
                    icon={<FileTextOutlined />} 
                    onClick={() => onNavigate('test-cases', { projectId: proj.id })}
                  >
                    Test Cases
                  </Button>
                </div>
              </div>
            </Col>
          ))}
        </Row>
      </Card>
    </div>
  );
};
