import React, { useEffect, useState } from 'react';
import { 
  Card, 
  Tag, 
  Button, 
  Typography, 
  Space, 
  Table, 
  Tabs, 
  Modal, 
  message, 
  Spin,
  Alert
} from 'antd';
import { 
  ArrowLeftOutlined, 
  DownloadOutlined, 
  CheckCircleOutlined, 
  CloseCircleOutlined, 
  FileTextOutlined,
  PictureOutlined
} from '@ant-design/icons';
import { api } from '../services/api';

const { Title, Text } = Typography;

interface ReportDetailPageProps {
  projectId: string;
  runId: string;
  onBack: () => void;
}

export const ReportDetailPage: React.FC<ReportDetailPageProps> = ({ projectId, runId, onBack }) => {
  const [data, setData] = useState<{ summary: any; markdown: string; junit: string | null; html: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeMediaUrl, setActiveMediaUrl] = useState<string | null>(null);
  const [mediaTitle, setMediaTitle] = useState<string>('');

  useEffect(() => {
    loadReport();
  }, [projectId, runId]);

  const loadReport = async () => {
    try {
      setLoading(true);
      const res = await api.getReportDetail(projectId, runId);
      setData(res);
    } catch (err: any) {
      message.error(`Failed to load report: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Spin size="large" tip="Loading Execution Report..." />
      </div>
    );
  }

  if (!data || !data.summary) {
    return (
      <div>
        <Button icon={<ArrowLeftOutlined />} onClick={onBack} style={{ marginBottom: 16 }}>Back</Button>
        <Alert type="error" message="Report not found or results.json is missing" showIcon />
      </div>
    );
  }

  const { summary, markdown, junit, html } = data;
  const isPass = summary.status === 'PASS';

  const testColumns = [
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (st: string) => {
        const color = st === 'PASS' ? 'success' : 'error';
        return <Tag color={color} style={{ fontWeight: 700 }}>{st}</Tag>;
      }
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 90,
      render: (t: string) => <Tag color={t === 'ui' ? 'blue' : 'green'}>{t?.toUpperCase()}</Tag>
    },
    {
      title: 'Test Case Name',
      key: 'name',
      render: (_: any, r: any) => (
        <div>
          <Text strong style={{ color: '#f8fafc' }}>{r.name}</Text>
          <code style={{ display: 'block', color: '#94a3b8', fontSize: 12 }}>{r.id}</code>
          {r.error && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#fca5a5',
              padding: '6px 10px',
              borderRadius: 6,
              fontSize: 12,
              marginTop: 6
            }}>
              {r.error}
            </div>
          )}
        </div>
      )
    },
    {
      title: 'Duration',
      dataIndex: 'durationMs',
      key: 'duration',
      width: 110,
      render: (ms: number) => `${(ms / 1000).toFixed(2)}s`
    },
    {
      title: 'Evidence',
      key: 'evidence',
      width: 160,
      render: (_: any, r: any) => {
        const ev = r.evidence || {};
        return (
          <Space>
            {ev.screenshotPath && (
              <Button 
                size="small" 
                icon={<PictureOutlined />}
                onClick={() => {
                  setMediaTitle(`Failure Screenshot: ${r.name}`);
                  setActiveMediaUrl(`/api/reports/${projectId}/${runId}/artifacts/${ev.screenshotPath}`);
                }}
              >
                Screenshot
              </Button>
            )}
            {ev.diffPath && (
              <Button 
                size="small" 
                danger
                icon={<PictureOutlined />}
                onClick={() => {
                  setMediaTitle(`Visual Diff: ${r.name}`);
                  setActiveMediaUrl(`/api/reports/${projectId}/${runId}/artifacts/${ev.diffPath}`);
                }}
              >
                Diff
              </Button>
            )}
          </Space>
        );
      }
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={onBack}>Back to Reports</Button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Title level={3} style={{ margin: 0, color: '#f8fafc' }}>
                {summary.projectName} Report
              </Title>
              <Tag color={isPass ? 'green' : 'red'} style={{ fontSize: 14, padding: '2px 10px', fontWeight: 700 }}>
                {isPass ? '✔ PASSED' : '✖ FAILED'}
              </Tag>
            </div>
            <code style={{ color: '#38bdf8' }}>Run ID: {summary.runId}</code>
          </div>
        </Space>

        <Space>
          <Button 
            icon={<DownloadOutlined />} 
            onClick={() => downloadFile(JSON.stringify(summary, null, 2), `results-${runId}.json`, 'application/json')}
          >
            results.json
          </Button>
          <Button 
            icon={<DownloadOutlined />} 
            onClick={() => downloadFile(markdown, `report-${runId}.md`, 'text/markdown')}
          >
            report.md
          </Button>
          <Button 
            icon={<DownloadOutlined />} 
            onClick={() => junit && downloadFile(junit, `junit-${runId}.xml`, 'application/xml')}
            disabled={!junit}
          >
            junit.xml
          </Button>
          <Button icon={<FileTextOutlined />} onClick={() => html && downloadFile(html, `report-${runId}.html`, 'text/html')} disabled={!html}>
            report.html
          </Button>
        </Space>
      </div>

      {/* Summary KPI Strip */}
      <div style={{
        background: '#0f172a',
        border: '1px solid #334155',
        borderRadius: 12,
        padding: '16px 24px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 16
      }}>
        <div>
          <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>ENVIRONMENT</Text>
          <Text strong style={{ color: '#f8fafc', fontSize: 15 }}>{summary.environment}</Text>
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>TOTAL TESTS</Text>
          <Text strong style={{ color: '#f8fafc', fontSize: 15 }}>{summary.counts.total}</Text>
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>PASSED</Text>
          <Text strong style={{ color: '#10b981', fontSize: 15 }}>{summary.counts.pass}</Text>
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>FAILED</Text>
          <Text strong style={{ color: summary.counts.fail > 0 ? '#ef4444' : '#cbd5e1', fontSize: 15 }}>
            {summary.counts.fail}
          </Text>
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>EXECUTION TIME</Text>
          <Text strong style={{ color: '#f8fafc', fontSize: 15 }}>{(summary.durationMs / 1000).toFixed(2)}s</Text>
        </div>
      </div>

      {/* Main Tabs */}
      <Card bordered={false} className="glass-panel">
        <Tabs
          defaultActiveKey="tests"
          items={[
            {
              key: 'tests',
              label: 'Test Cases & Step Breakdown',
              children: (
                <Table 
                  columns={testColumns} 
                  dataSource={summary.results || []} 
                  rowKey="id"
                  pagination={false}
                  expandable={{
                    expandedRowRender: (record: any) => (
                      <div style={{ background: '#0b0f19', padding: 12, borderRadius: 8 }}>
                        <Text strong style={{ color: '#38bdf8', marginBottom: 8, display: 'block' }}>
                          Step Execution Breakdown:
                        </Text>
                        <Table 
                          size="small"
                          pagination={false}
                          dataSource={record.steps || []}
                          rowKey="index"
                          columns={[
                            { title: '#', dataIndex: 'index', width: 50 },
                            { title: 'Step Description', dataIndex: 'name' },
                            { title: 'Action', dataIndex: 'action', width: 140, render: (a: string) => <code>{a}</code> },
                            { 
                              title: 'Status', 
                              dataIndex: 'status', 
                              width: 90,
                              render: (s: string) => <Tag color={s === 'PASS' ? 'green' : 'red'}>{s}</Tag> 
                            },
                            { 
                              title: 'Duration', 
                              dataIndex: 'durationMs', 
                              width: 90,
                              render: (ms: number) => `${ms}ms` 
                            },
                            { 
                              title: 'Error Details', 
                              dataIndex: 'error',
                              render: (err: string) => err ? <span style={{ color: '#fca5a5' }}>{err}</span> : '-' 
                            }
                          ]}
                        />
                      </div>
                    )
                  }}
                />
              )
            },
            {
              key: 'markdown',
              label: 'Markdown Report View',
              children: (
                <div style={{
                  background: '#0b0f19',
                  border: '1px solid #1e293b',
                  borderRadius: 8,
                  padding: 20,
                  maxHeight: 500,
                  overflowY: 'auto'
                }}>
                  <pre style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {markdown}
                  </pre>
                </div>
              )
            },
            {
              key: 'json',
              label: 'Raw results.json',
              children: (
                <div style={{
                  background: '#0b0f19',
                  border: '1px solid #1e293b',
                  borderRadius: 8,
                  padding: 20,
                  maxHeight: 500,
                  overflowY: 'auto'
                }}>
                  <pre style={{ color: '#38bdf8', fontSize: 12 }}>
                    {JSON.stringify(summary, null, 2)}
                  </pre>
                </div>
              )
            }
          ]}
        />
      </Card>

      {/* Media Evidence Modal */}
      <Modal
        title={mediaTitle}
        open={Boolean(activeMediaUrl)}
        onCancel={() => setActiveMediaUrl(null)}
        footer={[
          <Button key="close" onClick={() => setActiveMediaUrl(null)}>Close</Button>
        ]}
        width={900}
      >
        {activeMediaUrl && (
          <div style={{ textAlign: 'center' }}>
            <img 
              src={activeMediaUrl} 
              alt="Test Evidence" 
              style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 8, border: '1px solid #334155' }} 
            />
          </div>
        )}
      </Modal>
    </div>
  );
};
