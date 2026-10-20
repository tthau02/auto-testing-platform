import React, { useEffect, useState } from 'react';
import { 
  Table, 
  Button, 
  Modal, 
  Input, 
  Form, 
  message, 
  Tag, 
  Space, 
  Typography, 
  Card,
  Alert
} from 'antd';
import { 
  PlusOutlined, 
  EditOutlined, 
  CheckCircleOutlined, 
  PlayCircleOutlined,
  FileTextOutlined
} from '@ant-design/icons';
import { api, ProjectInfo } from '../services/api';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface ProjectsPageProps {
  onNavigate: (tab: string, extra?: any) => void;
}

export const ProjectsPage: React.FC<ProjectsPageProps> = ({ onNavigate }) => {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedProject, setSelectedProject] = useState<ProjectInfo | null>(null);
  const [configJsonText, setConfigJsonText] = useState('');
  const [validationResult, setValidationResult] = useState<{ valid: boolean; errors?: string[] } | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const data = await api.getProjects();
      setProjects(data);
    } catch (err: any) {
      message.error(`Failed to load projects: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEdit = (project: ProjectInfo) => {
    setSelectedProject(project);
    setConfigJsonText(JSON.stringify(project.config, null, 2));
    setValidationResult(null);
    setEditModalVisible(true);
  };

  const handleValidateConfig = async () => {
    if (!selectedProject) return;
    try {
      const parsed = JSON.parse(configJsonText);
      const res = await api.validateProject(selectedProject.id, parsed);
      setValidationResult(res);
      if (res.valid) {
        message.success('Configuration is 100% valid according to Zod schema!');
      } else {
        message.warning('Validation errors detected in configuration');
      }
    } catch (err: any) {
      setValidationResult({ valid: false, errors: [`JSON Parse Error: ${err.message}`] });
    }
  };

  const handleSaveConfig = async () => {
    if (!selectedProject) return;
    try {
      const parsed = JSON.parse(configJsonText);
      await api.updateProject(selectedProject.id, parsed);
      message.success('Project configuration updated successfully');
      setEditModalVisible(false);
      loadProjects();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const handleCreateProject = async (values: any) => {
    try {
      const newConfig = {
        id: values.id,
        name: values.name,
        description: values.description,
        baseUrl: values.baseUrl,
        apiBaseUrl: values.apiBaseUrl || values.baseUrl,
        environment: values.environment || 'local',
        testDirectories: ['test-cases/ui', 'test-cases/api', 'test-cases/visual'],
        features: {
          uiTesting: true,
          apiTesting: true,
          visualTesting: true
        },
        viewports: [
          { name: 'desktop', width: 1440, height: 900 },
          { name: 'mobile', width: 390, height: 844 }
        ],
        timeouts: {
          test: 30000,
          action: 10000,
          navigation: 30000
        },
        variables: {},
        security: {
          allowlistHosts: ['localhost', '127.0.0.1'],
          preventDestructiveActions: true
        }
      };

      await api.createProject(newConfig);
      message.success(`Project "${values.name}" created successfully!`);
      setCreateModalVisible(false);
      form.resetFields();
      loadProjects();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const columns = [
    {
      title: 'Project Name & ID',
      key: 'name',
      render: (_: any, record: ProjectInfo) => (
        <div>
          <Text strong style={{ fontSize: 16, color: '#38bdf8' }}>{record.name}</Text>
          <div style={{ marginTop: 4 }}>
            <Tag color="geekblue">{record.id}</Tag>
            <Tag color="cyan">{record.environment}</Tag>
          </div>
          {record.description && (
            <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 4 }}>
              {record.description}
            </Text>
          )}
        </div>
      )
    },
    {
      title: 'Base URL',
      dataIndex: 'baseUrl',
      key: 'baseUrl',
      render: (url: string) => <code style={{ color: '#cbd5e1', fontSize: 13 }}>{url}</code>
    },
    {
      title: 'Test Cases',
      dataIndex: 'testCount',
      key: 'testCount',
      render: (count: number) => <Tag color="blue">{count} tests</Tag>
    },
    {
      title: 'Past Reports',
      dataIndex: 'reportsCount',
      key: 'reportsCount',
      render: (count: number) => <Tag color="purple">{count} runs</Tag>
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: ProjectInfo) => (
        <Space>
          <Button 
            type="primary" 
            size="small" 
            icon={<PlayCircleOutlined />} 
            onClick={() => onNavigate('run', { projectId: record.id })}
          >
            Run
          </Button>
          <Button 
            size="small" 
            icon={<FileTextOutlined />} 
            onClick={() => onNavigate('test-cases', { projectId: record.id })}
          >
            Cases
          </Button>
          <Button 
            size="small" 
            icon={<EditOutlined />} 
            onClick={() => handleOpenEdit(record)}
          >
            Config
          </Button>
        </Space>
      )
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={3} style={{ margin: 0, color: '#f8fafc' }}>Projects Management</Title>
          <Text style={{ color: '#94a3b8' }}>Dynamic multi-project test configuration without engine modification</Text>
        </div>
        <Button 
          type="primary" 
          icon={<PlusOutlined />} 
          style={{ background: '#0284c7' }}
          onClick={() => setCreateModalVisible(true)}
        >
          Register New Project
        </Button>
      </div>

      <Card bordered={false} className="glass-panel">
        <Table 
          columns={columns} 
          dataSource={projects} 
          rowKey="id" 
          loading={loading}
          pagination={false}
        />
      </Card>

      {/* Edit Config Modal */}
      <Modal
        title={`Edit Config: ${selectedProject?.name} (${selectedProject?.id})`}
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        width={720}
        footer={[
          <Button key="validate" icon={<CheckCircleOutlined />} onClick={handleValidateConfig}>
            Validate Config
          </Button>,
          <Button key="cancel" onClick={() => setEditModalVisible(false)}>
            Cancel
          </Button>,
          <Button key="save" type="primary" onClick={handleSaveConfig} style={{ background: '#0284c7' }}>
            Save Changes
          </Button>
        ]}
      >
        <div style={{ marginBottom: 12 }}>
          <Text style={{ color: '#94a3b8' }}>
            Directly edit <code>project.config.json</code> with live schema validation:
          </Text>
        </div>

        {validationResult && (
          <div style={{ marginBottom: 16 }}>
            {validationResult.valid ? (
              <Alert type="success" message="Schema validation passed! Configuration is valid." showIcon />
            ) : (
              <Alert 
                type="error" 
                message="Configuration Validation Errors" 
                description={validationResult.errors?.join('\n')} 
                showIcon 
              />
            )}
          </div>
        )}

        <TextArea 
          rows={16} 
          value={configJsonText} 
          onChange={(e) => setConfigJsonText(e.target.value)}
          style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13 }}
        />
      </Modal>

      {/* Create Project Modal */}
      <Modal
        title="Register New Project"
        open={createModalVisible}
        onCancel={() => setCreateModalVisible(false)}
        onOk={() => form.submit()}
        okText="Create Project"
      >
        <Form form={form} layout="vertical" onFinish={handleCreateProject}>
          <Form.Item 
            name="id" 
            label="Project ID" 
            rules={[{ required: true, message: 'Please enter project identifier' }]}
          >
            <Input placeholder="e.g. hrm-portal, billing-service" />
          </Form.Item>
          <Form.Item 
            name="name" 
            label="Project Friendly Name" 
            rules={[{ required: true, message: 'Please enter friendly name' }]}
          >
            <Input placeholder="e.g. Human Resources Management" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input placeholder="Short description of the target system" />
          </Form.Item>
          <Form.Item 
            name="baseUrl" 
            label="Base Web URL" 
            rules={[{ required: true, message: 'Please enter base URL' }]}
          >
            <Input placeholder="http://localhost:3000" />
          </Form.Item>
          <Form.Item name="apiBaseUrl" label="API Base URL (optional)">
            <Input placeholder="http://localhost:3000" />
          </Form.Item>
          <Form.Item name="environment" label="Environment" initialValue="local">
            <Input placeholder="local" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
