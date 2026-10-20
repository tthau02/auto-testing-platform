import React, { useEffect, useState, useRef } from 'react';
import { 
  Card, 
  Select, 
  Button, 
  Switch, 
  Progress, 
  Tag, 
  Typography, 
  Space, 
  Alert, 
  message, 
  List,
  Checkbox
} from 'antd';
import { 
  PlayCircleOutlined, 
  StopOutlined, 
  CheckCircleOutlined, 
  CloseCircleOutlined, 
  LoadingOutlined,
  EyeOutlined
} from '@ant-design/icons';
import { api, ProjectInfo, TestCaseItem } from '../services/api';

const { Title, Text } = Typography;

interface RunTestsPageProps {
  initialProjectId?: string;
  initialTestCaseIds?: string[];
  onNavigate: (tab: string, extra?: any) => void;
}

export const RunTestsPage: React.FC<RunTestsPageProps> = ({ 
  initialProjectId, 
  initialTestCaseIds,
  onNavigate 
}) => {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedEnv, setSelectedEnv] = useState<string>('local');
  const [testCases, setTestCases] = useState<TestCaseItem[]>([]);
  const [selectedTestIds, setSelectedTestIds] = useState<string[]>([]);
  const [headless, setHeadless] = useState<boolean>(false); // Default to FALSE: Opens browser window so user can watch!
  const [slowMo, setSlowMo] = useState<number>(600); // 600ms default delay between steps for comfortable human observation
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const selectedProject = projects.find(project => project.id === selectedProjectId);
  const environmentNames = [...new Set([
    selectedProject?.environment || 'local',
    ...Object.keys(selectedProject?.config?.environments || {})
  ])];
  const environmentOptions = environmentNames.map(environment => {
    const override = selectedProject?.config?.environments?.[environment];
    const url = override?.baseUrl || selectedProject?.baseUrl;
    return { value: environment, label: `${environment} (${url || 'configured URL'})` };
  });

  // Execution state
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [liveEvents, setLiveEvents] = useState<any[]>([]);
  const [runSummary, setRunSummary] = useState<any | null>(null);
  const [currentStepLog, setCurrentStepLog] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    loadProjects();
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const loadProjects = async () => {
    try {
      const data = await api.getProjects();
      setProjects(data);
      if (data.length > 0) {
        const targetId = initialProjectId || data[0].id;
        setSelectedProjectId(targetId);
        setSelectedEnv(data.find(project => project.id === targetId)?.environment || 'local');
        loadTestCases(targetId);
      }
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const loadTestCases = async (projId: string) => {
    try {
      const data = await api.getTestCases(projId);
      setTestCases(data);
      if (initialTestCaseIds && initialTestCaseIds.length > 0) {
        setSelectedTestIds(initialTestCaseIds);
      } else {
        setSelectedTestIds(data.map(t => t.id));
      }
    } catch (err: any) {
      message.error(`Failed to load test cases: ${err.message}`);
    }
  };

  const handleProjectSelect = (id: string) => {
    setSelectedProjectId(id);
    setSelectedEnv(projects.find(project => project.id === id)?.environment || 'local');
    loadTestCases(id);
  };

  const startTestRun = async () => {
    if (!selectedProjectId) {
      message.warning('Please select a project');
      return;
    }
    if (selectedTestIds.length === 0) {
      message.warning('Select at least one test case');
      return;
    }

    try {
      setIsRunning(true);
      setLiveEvents([]);
      setRunSummary(null);
      setProgressPercent(0);
      setCurrentStepLog('Initiating execution process...');

      const response = await api.triggerRun({
        projectId: selectedProjectId,
        environment: selectedEnv,
        environmentId: selectedEnv,
        dashboardUrl: window.location.origin,
        testCaseIds: selectedTestIds,
        typeFilter: typeFilter as any,
        headless,
        slowMo: headless ? 0 : slowMo
      });

      const runId = response.runId;
      setCurrentRunId(runId);

      // Connect to SSE stream
      connectEventStream(runId);
    } catch (err: any) {
      setIsRunning(false);
      setCurrentStepLog(`Execution failed: ${err.message}`);
      message.error(`Execution failed: ${err.message}`);
    }
  };

  const connectEventStream = (runId: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const sse = new EventSource(`/api/runs/${runId}/events`);
    eventSourceRef.current = sse;

    let completedTests = 0;
    let totalTests = selectedTestIds.length || testCases.length || 1;

    sse.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        setLiveEvents(prev => [...prev, event]);

        if (event.type === 'RUN_STARTED') {
          totalTests = event.payload.totalTests || totalTests;
          setCurrentStepLog(`Dashboard ${event.payload.dashboardUrl || window.location.origin} → ${event.payload.project} / ${event.payload.environment} → target ${event.payload.targetBaseUrl} (${event.payload.browserMode}, slowMo ${event.payload.slowMo}ms); ${totalTests} tests`);
        } else if (event.type === 'TEST_STARTED') {
          setCurrentStepLog(`Running [${event.payload.testType.toUpperCase()}]: ${event.payload.name}`);
        } else if (event.type === 'STEP_PROGRESS') {
          const s = event.payload.step;
          setCurrentStepLog(`Step ${s.index}: ${s.name} - ${s.status}`);
        } else if (event.type === 'TEST_COMPLETED') {
          completedTests++;
          const pct = Math.round((completedTests / totalTests) * 100);
          setProgressPercent(Math.min(pct, 100));
        } else if (event.type === 'RUN_COMPLETED') {
          setIsRunning(false);
          setProgressPercent(100);
          setRunSummary(event.payload.summary);
          setCurrentStepLog('Execution finished!');
          sse.close();
        }
      } catch (parseErr) {
        console.error('SSE JSON error', parseErr);
      }
    };

    sse.onerror = () => {
      sse.close();
    };
  };

  const handleStopRun = async () => {
    if (!currentRunId) return;
    try {
      await api.stopRun(currentRunId);
      message.info('Stop requested. The current test will finish before the run is cancelled.');
    } catch (err: any) {
      message.error(err.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <Title level={3} style={{ margin: 0, color: '#f8fafc' }}>Execute Test Suite</Title>
        <Text style={{ color: '#94a3b8' }}>
          Isolated background process execution with live event streaming and zero UI freezing
        </Text>
      </div>

      <div className="run-tests-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) minmax(0, 1fr)', gap: 20 }}>
        {/* Run Configuration Panel */}
        <Card title={<span style={{ color: '#f8fafc' }}>⚙️ Execution Parameters</span>} bordered={false} className="glass-panel">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <Text strong style={{ color: '#94a3b8', display: 'block', marginBottom: 6 }}>Target Project:</Text>
              <Select 
                value={selectedProjectId} 
                onChange={handleProjectSelect}
                disabled={isRunning}
                style={{ width: '100%' }}
                options={projects.map(p => ({ label: `${p.name} (${p.id})`, value: p.id }))}
              />
            </div>

            <div>
              <Text strong style={{ color: '#94a3b8', display: 'block', marginBottom: 6 }}>Environment:</Text>
              <Select 
                value={selectedEnv} 
                onChange={setSelectedEnv}
                disabled={isRunning}
                style={{ width: '100%' }}
                options={environmentOptions}
              />
            </div>

            <div>
              <Text strong style={{ color: '#94a3b8', display: 'block', marginBottom: 6 }}>Test Type Filter:</Text>
              <Select 
                value={typeFilter} 
                onChange={setTypeFilter}
                disabled={isRunning}
                style={{ width: '100%' }}
                options={[
                  { label: 'All Types (UI, API, Visual)', value: 'all' },
                  { label: 'UI Tests Only', value: 'ui' },
                  { label: 'API Tests Only', value: 'api' },
                  { label: 'Visual Regression Only', value: 'visual' }
                ]}
              />
            </div>

            <Alert
              type="warning"
              showIcon
              message="Visual baselines are never changed automatically. Use the CLI --update-baselines option after reviewing screenshots to accept new baselines."
            />

            {/* Live Observation & Browser Window Mode */}
            <div style={{
              background: '#0f172a',
              border: '1px solid #38bdf8',
              borderRadius: 10,
              padding: '12px 14px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <Text strong style={{ color: '#38bdf8', display: 'block', fontSize: 13 }}>
                    🖥️ Mở trình duyệt trực tiếp (Headed)
                  </Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    Bấm Launch Execution để mở cửa sổ Chromium riêng khi chạy UI, API hoặc Visual.
                  </Text>
                </div>
                <Switch 
                  checked={!headless} 
                  onChange={(openBrowser) => setHeadless(!openBrowser)} 
                  disabled={isRunning} 
                />
              </div>

              {!headless && (
                <div style={{ marginTop: 10, borderTop: '1px solid #1e293b', paddingTop: 8 }}>
                  <Text style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                    ⏱️ Tốc độ thao tác (Slow Motion):
                  </Text>
                  <Select 
                    value={slowMo} 
                    onChange={setSlowMo} 
                    disabled={isRunning}
                    style={{ width: '100%' }}
                    options={[
                      { label: '0.6s (Chuẩn - Rất dễ quan sát thao tác)', value: 600 },
                      { label: '1.0s (Chậm rãi - Xem cực kỳ chi tiết)', value: 1000 },
                      { label: '0.3s (Nhanh vừa phải)', value: 300 },
                      { label: 'Tối đa (Máy tính chạy tức thì)', value: 0 }
                    ]}
                  />
                </div>
              )}
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text strong style={{ color: '#94a3b8' }}>Select Test Cases ({selectedTestIds.length}/{testCases.length}):</Text>
                <Button 
                  type="link" 
                  size="small" 
                  onClick={() => setSelectedTestIds(selectedTestIds.length === testCases.length ? [] : testCases.map(t => t.id))}
                  disabled={isRunning}
                >
                  {selectedTestIds.length === testCases.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>

              <div style={{
                maxHeight: 180,
                overflowY: 'auto',
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 8,
                padding: 10
              }}>
                <Checkbox.Group 
                  value={selectedTestIds} 
                  onChange={(vals) => setSelectedTestIds(vals as string[])}
                  disabled={isRunning}
                  style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                >
                  {testCases.map(tc => (
                    <Checkbox key={tc.id} value={tc.id}>
                      <span style={{ fontSize: 13, color: '#f8fafc' }}>
                        <Tag color={tc.type === 'ui' ? 'blue' : 'green'} style={{ fontSize: 10, marginRight: 4 }}>
                          {tc.type.toUpperCase()}
                        </Tag>
                        {tc.name}
                      </span>
                    </Checkbox>
                  ))}
                </Checkbox.Group>
              </div>
            </div>

            {/* Launch / Stop Button */}
            {!isRunning ? (
              <Button 
                type="primary" 
                size="large" 
                icon={<PlayCircleOutlined />}
                style={{ background: '#0284c7', height: 46, fontWeight: 700, fontSize: 16 }}
                onClick={startTestRun}
                disabled={!selectedProjectId || selectedTestIds.length === 0}
              >
                Launch Execution ({selectedTestIds.length} tests)
              </Button>
            ) : (
              <Button 
                danger 
                size="large" 
                icon={<StopOutlined />}
                style={{ height: 46, fontWeight: 700, fontSize: 16 }}
                onClick={handleStopRun}
              >
                Stop Execution
              </Button>
            )}
          </div>
        </Card>

        {/* Live Progress & Output Panel */}
        <Card 
          title={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#f8fafc' }}>
                {isRunning && <span className="pulse-badge" style={{ marginRight: 8 }} />}
                Live Execution Monitor
              </span>
              {currentRunId && <Tag color="cyan">Run: {currentRunId}</Tag>}
            </div>
          } 
          bordered={false} 
          className="glass-panel"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Progress Bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ color: '#94a3b8' }}>Execution Progress</Text>
                <Text strong style={{ color: '#38bdf8' }}>{progressPercent}%</Text>
              </div>
              <Progress 
                percent={progressPercent} 
                status={isRunning ? 'active' : runSummary?.status === 'FAIL' ? 'exception' : 'success'} 
                showInfo={false}
                strokeColor={{
                  '0%': '#0284c7',
                  '100%': '#10b981'
                }}
              />
            </div>

            {/* Current Step Status */}
            <div style={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: 8,
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12
            }}>
              {isRunning ? (
                <LoadingOutlined style={{ fontSize: 20, color: '#38bdf8' }} spin />
              ) : runSummary ? (
                runSummary.status === 'PASS' 
                  ? <CheckCircleOutlined style={{ fontSize: 20, color: '#10b981' }} />
                  : <CloseCircleOutlined style={{ fontSize: 20, color: '#ef4444' }} />
              ) : (
                <PlayCircleOutlined style={{ fontSize: 20, color: '#94a3b8' }} />
              )}
              <div style={{ overflow: 'hidden' }}>
                <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>CURRENT ACTIVITY</Text>
                <Text strong style={{ color: '#f8fafc', fontSize: 14 }}>
                  {currentStepLog || 'Ready for test launch'}
                </Text>
              </div>
            </div>

            {/* Completion Result Card */}
            {runSummary && (
              <div style={{
                background: runSummary.status === 'PASS' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                border: `1px solid ${runSummary.status === 'PASS' ? '#10b981' : '#ef4444'}`,
                borderRadius: 8,
                padding: '16px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <Title level={4} style={{ margin: 0, color: runSummary.status === 'PASS' ? '#10b981' : '#ef4444' }}>
                    {runSummary.status === 'PASS' ? '🎉 All Tests Passed!' : '⚠️ Some Tests Failed'}
                  </Title>
                  <Text style={{ color: '#cbd5e1', fontSize: 13 }}>
                    {runSummary.counts.pass} Passed, {runSummary.counts.fail} Failed in {(runSummary.durationMs / 1000).toFixed(2)}s
                  </Text>
                </div>
                <Button 
                  type="primary" 
                  icon={<EyeOutlined />}
                  style={{ background: '#0284c7' }}
                  onClick={() => onNavigate('report-detail', { 
                    projectId: selectedProjectId, 
                    runId: runSummary.runId 
                  })}
                >
                  View Full Report & Evidence
                </Button>
              </div>
            )}

            {/* Live Events Stream List */}
            <div style={{
              background: '#0b0f19',
              border: '1px solid #1e293b',
              borderRadius: 8,
              padding: 12,
              maxHeight: 280,
              overflowY: 'auto'
            }}>
              <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
                EVENT LOG STREAM ({liveEvents.length} events)
              </Text>
              {liveEvents.length === 0 ? (
                <Text style={{ color: '#64748b', fontSize: 12 }}>No logs yet. Launch a run to see live execution events.</Text>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {liveEvents.map((evt, i) => (
                    <div key={i} style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace' }}>
                      {evt.type === 'TEST_STARTED' && (
                        <span style={{ color: '#38bdf8' }}>▶ [{evt.payload.testType.toUpperCase()}] {evt.payload.name} ({evt.payload.testId})</span>
                      )}
                      {evt.type === 'RUN_STARTED' && (
                        <span style={{ color: '#a5b4fc' }}>ℹ Dashboard: {evt.payload.dashboardUrl || window.location.origin} · Project: {evt.payload.project} · Environment: {evt.payload.environment} · Target: {evt.payload.targetBaseUrl} · Browser: {evt.payload.browserMode}</span>
                      )}
                      {evt.type === 'STEP_PROGRESS' && (
                        <span style={{ color: evt.payload.step.status === 'PASS' ? '#10b981' : '#ef4444', paddingLeft: 12 }}>
                          {evt.payload.step.status === 'PASS' ? '✔' : '✖'} Step {evt.payload.step.index}: {evt.payload.step.name} ({evt.payload.step.durationMs}ms)
                        </span>
                      )}
                      {evt.type === 'TEST_COMPLETED' && (
                        <div>
                          <span style={{ color: evt.payload.result.status === 'PASS' ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                            {evt.payload.result.status === 'PASS' ? '✅ PASS' : `❌ ${evt.payload.result.status}`}: {evt.payload.result.name}
                          </span>
                          {evt.payload.result.error && (
                            <div style={{ color: '#fca5a5', paddingLeft: 20, whiteSpace: 'pre-wrap' }}>
                              {evt.payload.result.error}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
