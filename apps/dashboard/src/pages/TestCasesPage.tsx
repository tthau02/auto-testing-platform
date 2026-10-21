import React, { useEffect, useState } from 'react';
import { 
  Table, 
  Select, 
  Input, 
  Button, 
  Tag, 
  Space, 
  Drawer, 
  Modal, 
  Typography, 
  message, 
  Card,
  Popconfirm
} from 'antd';
import { 
  SearchOutlined, 
  PlusOutlined, 
  PlayCircleOutlined, 
  EyeOutlined, 
  DeleteOutlined,
  ApiOutlined,
  CloudUploadOutlined
} from '@ant-design/icons';
import { api, ProjectInfo, TestCaseItem } from '../services/api';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface TestCasesPageProps {
  initialProjectId?: string;
  onNavigate: (tab: string, extra?: any) => void;
}

export const TestCasesPage: React.FC<TestCasesPageProps> = ({ initialProjectId, onNavigate }) => {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [testCases, setTestCases] = useState<TestCaseItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  // Drawer for viewing details
  const [activeTestCase, setActiveTestCase] = useState<TestCaseItem | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);

  // Modal for creating/importing
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');

  // Modal for Swagger
  const [swaggerModalVisible, setSwaggerModalVisible] = useState(false);
  const [swaggerUrl, setSwaggerUrl] = useState('http://localhost:3000/api/docs/swagger.json');
  const workbookSource = Boolean(projects.find(project => project.id === selectedProjectId)?.config?.testWorkbook);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const data = await api.getProjects();
      setProjects(data);
      if (data.length > 0) {
        const defaultId = initialProjectId || data[0].id;
        setSelectedProjectId(defaultId);
        loadTestCases(defaultId);
      }
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const loadTestCases = async (projId: string) => {
    try {
      setLoading(true);
      const data = await api.getTestCases(projId);
      setTestCases(data);
      setSelectedRowKeys([]);
    } catch (err: any) {
      message.error(`Failed to load test cases: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleProjectChange = (val: string) => {
    setSelectedProjectId(val);
    loadTestCases(val);
  };

  const handleDeleteTestCase = async (testId: string) => {
    try {
      await api.deleteTestCase(selectedProjectId, testId);
      message.success(`Test case ${testId} deleted`);
      loadTestCases(selectedProjectId);
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const handleImportJson = async () => {
    try {
      const parsed = JSON.parse(importJsonText);
      await api.createTestCase(selectedProjectId, parsed);
      message.success('Test case saved successfully!');
      setImportModalVisible(false);
      setImportJsonText('');
      loadTestCases(selectedProjectId);
    } catch (err: any) {
      message.error(`Validation / Save error: ${err.message}`);
    }
  };

  const handleImportSwagger = async () => {
    try {
      const res = await api.importSwagger(swaggerUrl);
      message.info(`Discovered ${res.count} endpoints. Importing test cases...`);
      for (const tc of res.testCases) {
        await api.createTestCase(selectedProjectId, tc).catch(() => {});
      }
      message.success(`Imported ${res.count} API test cases successfully!`);
      setSwaggerModalVisible(false);
      loadTestCases(selectedProjectId);
    } catch (err: any) {
      message.error(`Swagger import failed: ${err.message}`);
    }
  };

  const filteredTests = testCases.filter(tc => {
    const matchesSearch = tc.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          tc.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = workbookSource || typeFilter === 'all' || tc.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      render: (id: string) => <code style={{ color: '#38bdf8', fontWeight: 600 }}>{id}</code>
    },
    {
      title: workbookSource ? 'Automation' : 'Type',
      dataIndex: 'type',
      key: 'type',
      render: (_type: string, record: TestCaseItem) => workbookSource
        ? <Tag color={record.automationReady ? 'green' : 'orange'}>{record.automationReady ? 'READY' : 'NEEDS STEPS'}</Tag>
        : <Tag color={_type === 'ui' ? 'blue' : _type === 'api' ? 'green' : 'purple'} style={{ fontWeight: 600 }}>{_type.toUpperCase()}</Tag>
    },
    {
      title: 'Name & Description',
      key: 'name',
      render: (_: any, record: TestCaseItem) => (
        <div>
          <Text strong style={{ color: '#f8fafc' }}>{record.name}</Text>
          {record.description && (
            <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>{record.description}</Text>
          )}
        </div>
      )
    },
    {
      title: 'Module',
      dataIndex: 'module',
      key: 'module',
      render: (mod?: string) => mod ? <Tag>{mod}</Tag> : '-'
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      key: 'priority',
      render: (p: string) => {
        const color = p === 'critical' ? 'red' : p === 'high' ? 'orange' : 'default';
        return <Tag color={color}>{p.toUpperCase()}</Tag>;
      }
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: TestCaseItem) => (
        <Space>
          <Button 
            size="small" 
            icon={<EyeOutlined />} 
            onClick={() => {
              setActiveTestCase(record);
              setDrawerVisible(true);
            }}
          >
            Details
          </Button>
          <Button 
            type="primary" 
            size="small" 
            icon={<PlayCircleOutlined />} 
            disabled={record.automationReady === false}
            title={record.automationReady === false ? record.automationError : undefined}
            onClick={() => onNavigate('run', { projectId: selectedProjectId, testCaseIds: [record.id] })}
          >
            Run
          </Button>
          {!workbookSource && <Popconfirm
            title="Delete test case?" 
            onConfirm={() => handleDeleteTestCase(record.id)}
            okText="Yes, delete"
            cancelText="Cancel"
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>}
        </Space>
      )
    }
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
    getCheckboxProps: (record: TestCaseItem) => ({ disabled: record.automationReady === false })
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={3} style={{ margin: 0, color: '#f8fafc' }}>Test Cases Repository</Title>
          <Text style={{ color: '#94a3b8' }}>{workbookSource ? 'Đọc trực tiếp từ Excel; bổ sung URL, action và locator trong sheet Automation để bật chạy.' : 'Test case repository'}</Text>
        </div>
        <Space>
          {!workbookSource && <Button
            icon={<ApiOutlined />} 
            onClick={() => setSwaggerModalVisible(true)}
          >
            Import from OpenAPI/Swagger
          </Button>}
          {!workbookSource && <Button
            type="primary" 
            icon={<PlusOutlined />} 
            style={{ background: '#0284c7' }}
            onClick={() => {
              setImportJsonText(JSON.stringify({
                id: `UI_TEST_${Date.now().toString().slice(-4)}`,
                name: "Sample Custom Test",
                type: "ui",
                priority: "medium",
                startUrl: "/login",
                steps: [
                  { action: "fill", target: { placeholder: "Enter your username" }, value: "admin" },
                  { action: "click", target: { role: "button", name: "Login" } },
                  { action: "assertUrl", expected: "**/dashboard" }
                ]
              }, null, 2));
              setImportModalVisible(true);
            }}
          >
            Create / Import JSON
          </Button>}
        </Space>
      </div>

      {/* Filter Bar */}
      <Card bordered={false} className="glass-panel" bodyStyle={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <Text style={{ color: '#94a3b8', marginRight: 8 }}>Project:</Text>
            <Select 
              value={selectedProjectId} 
              onChange={handleProjectChange} 
              style={{ width: 220 }}
              options={projects.map(p => ({ label: `${p.name} (${p.id})`, value: p.id }))}
            />
          </div>

          <Input 
            placeholder="Search by ID or Name..." 
            prefix={<SearchOutlined />} 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: 260 }}
          />

          {!workbookSource && <div>
            <Text style={{ color: '#94a3b8', marginRight: 8 }}>Type:</Text>
            <Select 
              value={typeFilter} 
              onChange={setTypeFilter} 
              style={{ width: 130 }}
              options={[
                { label: 'All Types', value: 'all' },
                { label: 'UI', value: 'ui' },
                { label: 'API', value: 'api' },
                { label: 'Visual', value: 'visual' }
              ]}
            />
          </div>}

          {selectedRowKeys.length > 0 && (
            <Button 
              type="primary" 
              icon={<PlayCircleOutlined />}
              style={{ background: '#10b981', borderColor: '#10b981', marginLeft: 'auto' }}
              onClick={() => onNavigate('run', { 
                projectId: selectedProjectId, 
                testCaseIds: selectedRowKeys as string[] 
              })}
            >
              Run Selected ({selectedRowKeys.length})
            </Button>
          )}
        </div>
      </Card>

      {/* Test Cases Table */}
      <Card bordered={false} className="glass-panel">
        <Table 
          rowSelection={rowSelection}
          columns={columns} 
          dataSource={filteredTests} 
          rowKey="id" 
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* Test Case Details Drawer */}
      <Drawer
        title={<span style={{ color: '#38bdf8' }}>{activeTestCase?.name} ({activeTestCase?.id})</span>}
        placement="right"
        width={600}
        onClose={() => setDrawerVisible(false)}
        open={drawerVisible}
      >
        {activeTestCase && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <Text strong style={{ color: '#94a3b8' }}>{workbookSource ? 'Automation: ' : 'Type: '}</Text>
              <Tag color={activeTestCase.automationReady === false ? 'orange' : 'blue'}>{activeTestCase.automationReady === false ? 'NEEDS STEPS' : workbookSource ? 'BROWSER' : activeTestCase.type.toUpperCase()}</Tag>
              <Text strong style={{ color: '#94a3b8', marginLeft: 16 }}>Priority: </Text>
              <Tag>{activeTestCase.priority}</Tag>
            </div>

            {activeTestCase.description && (
              <div>
                <Text strong style={{ color: '#94a3b8' }}>Description:</Text>
                <p style={{ color: '#cbd5e1', marginTop: 4 }}>{activeTestCase.description}</p>
              </div>
            )}

            {activeTestCase.manualSteps?.length ? (
              <div>
                <Text strong style={{ color: '#94a3b8' }}>Các bước trong Excel:</Text>
                <ol style={{ color: '#cbd5e1', paddingLeft: 22 }}>
                  {activeTestCase.manualSteps.map((step, index) => <li key={index}>{step}</li>)}
                </ol>
              </div>
            ) : null}

            {activeTestCase.startUrl && (
              <div>
                <Text strong style={{ color: '#94a3b8' }}>Start URL:</Text>
                <code style={{ display: 'block', background: '#0f172a', padding: 8, borderRadius: 6, marginTop: 4 }}>
                  {activeTestCase.startUrl}
                </code>
              </div>
            )}

            <div>
              <Text strong style={{ color: '#94a3b8' }}>Automation Steps ({activeTestCase.steps?.length || 0}):</Text>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activeTestCase.steps?.map((step: any, idx: number) => (
                  <div 
                    key={idx}
                    style={{
                      background: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      padding: '10px 14px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Text strong style={{ color: '#38bdf8' }}>Step {idx + 1}: {step.action || step.name}</Text>
                      {step.method && <Tag color="cyan">{step.method}</Tag>}
                    </div>
                    {step.target && (
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                        Target: <code>{JSON.stringify(step.target)}</code>
                      </div>
                    )}
                    {step.value && (
                      <div style={{ fontSize: 12, color: '#a7f3d0', marginTop: 2 }}>
                        Value: <code>{step.value}</code>
                      </div>
                    )}
                    {step.expected && (
                      <div style={{ fontSize: 12, color: '#fef08a', marginTop: 2 }}>
                        Expected: <code>{step.expected}</code>
                      </div>
                    )}
                  {step.endpoint && (
                      <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 2 }}>
                        Endpoint: <code>{step.endpoint}</code>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <Button 
              type="primary" 
              icon={<PlayCircleOutlined />}
              style={{ marginTop: 16, background: '#0284c7' }}
              disabled={activeTestCase.automationReady === false}
              title={activeTestCase.automationError}
              onClick={() => {
                setDrawerVisible(false);
                onNavigate('run', { projectId: selectedProjectId, testCaseIds: [activeTestCase.id] });
              }}
            >
              Execute This Test Case
            </Button>
          </div>
        )}
      </Drawer>

      {/* Create / Import Test Case Modal */}
      <Modal
        title="Import / Create Test Case JSON"
        open={importModalVisible}
        onCancel={() => setImportModalVisible(false)}
        onOk={handleImportJson}
        okText="Validate & Save"
        width={680}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          Paste test case conforming to UITestCase, APITestCase or VisualTestCase schema:
        </Text>
        <TextArea 
          rows={16}
          value={importJsonText}
          onChange={(e) => setImportJsonText(e.target.value)}
          style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}
        />
      </Modal>

      {/* Swagger Import Modal */}
      <Modal
        title="Import API Test Cases from OpenAPI / Swagger"
        open={swaggerModalVisible}
        onCancel={() => setSwaggerModalVisible(false)}
        onOk={handleImportSwagger}
        okText="Discover & Generate Tests"
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          Provide the URL to the OpenAPI 3.0 or Swagger specification JSON:
        </Text>
        <Input 
          value={swaggerUrl} 
          onChange={(e) => setSwaggerUrl(e.target.value)}
          placeholder="http://localhost:3000/api/docs/swagger.json"
        />
      </Modal>
    </div>
  );
};
