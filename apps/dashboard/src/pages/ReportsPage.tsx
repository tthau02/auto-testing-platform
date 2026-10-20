import React, { useEffect, useState } from 'react';
import { Table, Select, Tag, Button, Typography, Card, Space, message } from 'antd';
import { EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import { api, ProjectInfo } from '../services/api';

const { Title, Text } = Typography;

interface ReportsPageProps {
  onNavigate: (tab: string, extra?: any) => void;
}

export const ReportsPage: React.FC<ReportsPageProps> = ({ onNavigate }) => {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const projs = await api.getProjects();
      setProjects(projs);

      const reportPromises = projs.map(p => api.getReports(p.id).catch(() => []));
      const nested = await Promise.all(reportPromises);
      const flattened = nested.flat().sort((a, b) => (b.startTime || '').localeCompare(a.startTime || ''));
      setReports(flattened);
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredReports = reports.filter(r => {
    const matchesProj = selectedProjectId === 'all' || r.projectId === selectedProjectId;
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchesProj && matchesStatus;
  });

  const columns = [
    {
      title: 'Run ID',
      dataIndex: 'runId',
      key: 'runId',
      render: (id: string) => <code style={{ color: '#38bdf8', fontWeight: 600 }}>{id}</code>
    },
    {
      title: 'Project',
      dataIndex: 'projectName',
      key: 'projectName',
      render: (name: string, record: any) => (
        <div>
          <Text strong style={{ color: '#f8fafc' }}>{name || record.projectId}</Text>
          <Tag color="geekblue" style={{ marginLeft: 6 }}>{record.projectId}</Tag>
        </div>
      )
    },
    {
      title: 'Environment',
      dataIndex: 'environment',
      key: 'environment',
      render: (env: string) => <Tag color="cyan">{env || 'local'}</Tag>
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const color = status === 'PASS' ? 'success' : 'error';
        return <Tag color={color} style={{ fontWeight: 700 }}>{status}</Tag>;
      }
    },
    {
      title: 'Results Breakdown',
      key: 'counts',
      render: (_: any, record: any) => {
        const c = record.counts || { pass: 0, fail: 0, total: 0 };
        return (
          <Space>
            <Tag color="green">✔ {c.pass}</Tag>
            {c.fail > 0 && <Tag color="red">✖ {c.fail}</Tag>}
            <Text type="secondary" style={{ fontSize: 12 }}>({c.total} total)</Text>
          </Space>
        );
      }
    },
    {
      title: 'Duration',
      dataIndex: 'durationMs',
      key: 'duration',
      render: (ms: number) => ms ? `${(ms / 1000).toFixed(2)}s` : '-'
    },
    {
      title: 'Execution Time',
      dataIndex: 'startTime',
      key: 'startTime',
      render: (t: string) => t ? new Date(t).toLocaleString() : '-'
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: any) => (
        <Button 
          type="primary" 
          size="small" 
          icon={<EyeOutlined />}
          style={{ background: '#0284c7' }}
          onClick={() => onNavigate('report-detail', { 
            projectId: record.projectId, 
            runId: record.runId 
          })}
        >
          View Details
        </Button>
      )
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={3} style={{ margin: 0, color: '#f8fafc' }}>Test Run History</Title>
          <Text style={{ color: '#94a3b8' }}>Audit log of test execution runs, reports, and evidence</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={loadData}>Refresh</Button>
      </div>

      <Card bordered={false} className="glass-panel" bodyStyle={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div>
            <Text style={{ color: '#94a3b8', marginRight: 8 }}>Filter Project:</Text>
            <Select 
              value={selectedProjectId} 
              onChange={setSelectedProjectId}
              style={{ width: 200 }}
              options={[
                { label: 'All Projects', value: 'all' },
                ...projects.map(p => ({ label: p.name, value: p.id }))
              ]}
            />
          </div>

          <div>
            <Text style={{ color: '#94a3b8', marginRight: 8 }}>Filter Status:</Text>
            <Select 
              value={statusFilter} 
              onChange={setStatusFilter}
              style={{ width: 140 }}
              options={[
                { label: 'All Statuses', value: 'all' },
                { label: 'Passed', value: 'PASS' },
                { label: 'Failed', value: 'FAIL' }
              ]}
            />
          </div>
        </div>
      </Card>

      <Card bordered={false} className="glass-panel">
        <Table 
          columns={columns} 
          dataSource={filteredReports} 
          rowKey="runId" 
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </div>
  );
};
