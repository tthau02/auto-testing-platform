import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fork } from 'node:child_process';
import { 
  ProjectConfigSchema, 
  parseTestCase, 
  AnyTestCase, 
  TestRunSummary 
} from '@auto-test/test-case-schema';
import { 
  loadProjectConfig, 
  safeResolvePath, 
  discoverTestCases 
} from '@auto-test/project-config';
import { loadReportSummary } from '@auto-test/report-engine';
import { processManager } from './process-manager.js';

const app = express();
const PORT = process.env.PORT || 4000;
const HOST = '127.0.0.1'; // Strictly bind to local loopback

const WORKSPACE_ROOT = path.resolve(__dirname, '../../../');
const PROJECTS_ROOT = path.join(WORKSPACE_ROOT, 'projects');

fs.mkdirSync(PROJECTS_ROOT, { recursive: true });

app.use(cors());
app.use(express.json());

// --- Health / Status ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Dynamic Auto Testing Local Service', timestamp: new Date().toISOString() });
});

// --- Projects API ---

app.get('/api/projects', (req, res) => {
  try {
    const entries = fs.readdirSync(PROJECTS_ROOT, { withFileTypes: true });
    const projects = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const projDir = path.join(PROJECTS_ROOT, entry.name);
        const configPath = path.join(projDir, 'project.config.json');
        if (fs.existsSync(configPath)) {
          try {
            const config = loadProjectConfig(projDir);
            const testFiles = discoverTestCases(projDir, config);
            const reportsDir = path.join(projDir, 'reports');
            const reportsCount = fs.existsSync(reportsDir) 
              ? fs.readdirSync(reportsDir).filter(f => fs.statSync(path.join(reportsDir, f)).isDirectory()).length 
              : 0;

            projects.push({
              id: config.id,
              name: config.name,
              description: config.description,
              baseUrl: config.baseUrl,
              apiBaseUrl: config.apiBaseUrl,
              environment: config.environment,
              testCount: testFiles.length,
              reportsCount,
              config
            });
          } catch (e: any) {
            projects.push({
              id: entry.name,
              name: entry.name,
              error: e.message
            });
          }
        }
      }
    }

    res.json(projects);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/projects', (req, res) => {
  try {
    const parseResult = ProjectConfigSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ 
        error: 'Validation failed', 
        details: parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
      });
      return;
    }

    const config = parseResult.data;
    const projectDir = safeResolvePath(PROJECTS_ROOT, config.id);

    if (fs.existsSync(projectDir)) {
      res.status(409).json({ error: `Project "${config.id}" already exists.` });
      return;
    }

    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'test-cases', 'ui'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'test-cases', 'api'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'test-cases', 'visual'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'reports'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'baselines'), { recursive: true });

    const configPath = path.join(projectDir, 'project.config.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    res.status(201).json({ message: 'Project created successfully', project: config });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/projects/:id', (req, res) => {
  try {
    const projectDir = safeResolvePath(PROJECTS_ROOT, req.params.id);
    if (!fs.existsSync(projectDir)) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    const config = loadProjectConfig(projectDir);
    res.json(config);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/projects/:id', (req, res) => {
  try {
    const projectDir = safeResolvePath(PROJECTS_ROOT, req.params.id);
    if (!fs.existsSync(projectDir)) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const parseResult = ProjectConfigSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ 
        error: 'Validation failed', 
        details: parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
      });
      return;
    }

    const configPath = path.join(projectDir, 'project.config.json');
    fs.writeFileSync(configPath, JSON.stringify(parseResult.data, null, 2), 'utf-8');
    res.json({ message: 'Project config updated successfully', config: parseResult.data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/projects/:id/validate', (req, res) => {
  try {
    const parseResult = ProjectConfigSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.json({ 
        valid: false, 
        errors: parseResult.error.errors.map(e => `${e.path.join('.') || 'root'}: ${e.message}`) 
      });
    } else {
      res.json({ valid: true });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Test Cases API ---

app.get('/api/projects/:id/test-cases', (req, res) => {
  try {
    const projectDir = safeResolvePath(PROJECTS_ROOT, req.params.id);
    const config = loadProjectConfig(projectDir);
    const testFiles = discoverTestCases(projectDir, config);
    const testCases: AnyTestCase[] = [];

    for (const file of testFiles) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const parsed = JSON.parse(content);
        const testRes = parseTestCase(parsed);
        if (testRes.success) {
          testCases.push(testRes.data);
        }
      } catch {
        // Skip unparseable
      }
    }

    res.json(testCases);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/projects/:id/test-cases', (req, res) => {
  try {
    const projectDir = safeResolvePath(PROJECTS_ROOT, req.params.id);
    const parsed = parseTestCase(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid test case format', details: parsed.error });
      return;
    }

    const tc = parsed.data;
    const targetFolder = path.join(projectDir, 'test-cases', tc.type);
    fs.mkdirSync(targetFolder, { recursive: true });

    const targetFile = safeResolvePath(targetFolder, `${tc.id}.json`);
    fs.writeFileSync(targetFile, JSON.stringify(tc, null, 2), 'utf-8');

    res.status(201).json({ message: 'Test case created successfully', testCase: tc });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/projects/:id/test-cases/:testId', (req, res) => {
  try {
    const projectDir = safeResolvePath(PROJECTS_ROOT, req.params.id);
    const config = loadProjectConfig(projectDir);
    const testFiles = discoverTestCases(projectDir, config);
    let deleted = false;

    for (const file of testFiles) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const parsed = JSON.parse(content);
        if (parsed.id === req.params.testId) {
          fs.unlinkSync(file);
          deleted = true;
          break;
        }
      } catch {}
    }

    if (deleted) {
      res.json({ message: `Test case ${req.params.testId} deleted successfully` });
    } else {
      res.status(404).json({ error: `Test case ${req.params.testId} not found` });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Execution & Runs API ---

app.post('/api/runs', (req, res) => {
  try {
    const { projectId, environment, testCaseIds, typeFilter } = req.body;
    const headless = req.body.headless === true; // Default to false (Headed mode) so user can watch browser actions!
    const slowMo = req.body.slowMo !== undefined ? Number(req.body.slowMo) : (headless ? 0 : 600);
    if (!projectId) {
      res.status(400).json({ error: 'projectId is required' });
      return;
    }

    const projectDir = safeResolvePath(PROJECTS_ROOT, projectId);
    if (!fs.existsSync(projectDir)) {
      res.status(404).json({ error: `Project ${projectId} not found` });
      return;
    }

    const runId = `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}_${Math.random().toString(36).slice(2, 6)}`;
    const activeRun = processManager.createRun(runId, projectId);

    // Fork isolated worker process via tsx
    const workerScript = path.resolve(__dirname, 'runner-worker.ts');
    const child = fork(workerScript, [], {
      execArgv: ['--import', 'tsx'],
      cwd: WORKSPACE_ROOT
    });

    activeRun.process = child;
    activeRun.status = 'RUNNING';

    child.on('message', (msg: any) => {
      if (msg.type === 'EVENT') {
        processManager.emitEvent(runId, msg.payload);
      } else if (msg.type === 'DONE') {
        activeRun.status = msg.summary.status === 'PASS' ? 'COMPLETED' : 'ERROR';
        activeRun.summary = msg.summary;
      } else if (msg.type === 'ERROR') {
        activeRun.status = 'ERROR';
        activeRun.error = msg.error;
      }
    });

    child.on('exit', (code) => {
      if (activeRun.status === 'RUNNING') {
        activeRun.status = code === 0 ? 'COMPLETED' : 'ERROR';
      }
    });

    // Send configuration to worker
    child.send({
      projectDir,
      environment,
      testCaseIds,
      typeFilter,
      headless,
      slowMo
    });

    res.status(202).json({
      message: 'Test execution initiated',
      runId,
      status: 'RUNNING'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/runs/:runId', (req, res) => {
  const run = processManager.getRun(req.params.runId);
  if (!run) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }
  res.json({
    runId: run.runId,
    projectId: run.projectId,
    status: run.status,
    eventsCount: run.events.length,
    summary: run.summary,
    error: run.error
  });
});

app.post('/api/runs/:runId/stop', (req, res) => {
  const stopped = processManager.stopRun(req.params.runId);
  if (stopped) {
    res.json({ message: 'Run stopped successfully' });
  } else {
    res.status(400).json({ error: 'Could not stop run or run already finished' });
  }
});

// Server-Sent Events (SSE) for live streaming progress
app.get('/api/runs/:runId/events', (req, res) => {
  const run = processManager.getRun(req.params.runId);
  if (!run) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send existing events
  for (const event of run.events) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  if (run.status === 'COMPLETED' || run.status === 'ERROR' || run.status === 'CANCELLED') {
    res.end();
    return;
  }

  const listener = (event: any) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    if (event.type === 'RUN_COMPLETED') {
      run.emitter.off('event', listener);
      res.end();
    }
  };

  run.emitter.on('event', listener);

  req.on('close', () => {
    run.emitter.off('event', listener);
  });
});

// --- Reports API ---

app.get('/api/projects/:id/reports', (req, res) => {
  try {
    const projectDir = safeResolvePath(PROJECTS_ROOT, req.params.id);
    const reportsDir = path.join(projectDir, 'reports');
    if (!fs.existsSync(reportsDir)) {
      res.json([]);
      return;
    }

    const runs = fs.readdirSync(reportsDir)
      .filter(f => fs.statSync(path.join(reportsDir, f)).isDirectory())
      .map(runId => {
        const jsonPath = path.join(reportsDir, runId, 'results.json');
        if (fs.existsSync(jsonPath)) {
          try {
            const summary = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
            return summary;
          } catch {
            return { runId, error: 'Corrupt results.json' };
          }
        }
        return { runId, status: 'UNKNOWN' };
      })
      .sort((a, b) => (b.startTime || '').localeCompare(a.startTime || ''));

    res.json(runs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/projects/:id/reports/:runId', (req, res) => {
  try {
    const projectDir = safeResolvePath(PROJECTS_ROOT, req.params.id);
    const runDir = safeResolvePath(path.join(projectDir, 'reports'), req.params.runId);
    const summary = loadReportSummary(runDir);

    const reportMdPath = path.join(runDir, 'report.md');
    const mdContent = fs.existsSync(reportMdPath) ? fs.readFileSync(reportMdPath, 'utf-8') : null;

    res.json({
      summary,
      markdown: mdContent
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Safe Static Artifact Serving (Screenshots, diffs, traces)
app.get('/api/reports/:projectId/:runId/artifacts/*', (req, res) => {
  try {
    const projectDir = safeResolvePath(PROJECTS_ROOT, req.params.projectId);
    const runDir = safeResolvePath(path.join(projectDir, 'reports'), req.params.runId);
    const paramsAny = req.params as any;
    const relativeArtifact = paramsAny[0] || paramsAny['0'] || paramsAny['*'] || '';
    const artifactPath = safeResolvePath(runDir, relativeArtifact);

    if (!fs.existsSync(artifactPath)) {
      res.status(404).send('Artifact not found');
      return;
    }

    res.sendFile(artifactPath);
  } catch (err: any) {
    res.status(403).send(`Access Denied: ${err.message}`);
  }
});

// Swagger/OpenAPI Importer helper
app.post('/api/docs/swagger-import', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      res.status(400).json({ error: 'Swagger URL is required' });
      return;
    }

    const response = await fetch(url);
    if (!response.ok) {
      res.status(400).json({ error: `Failed to fetch OpenAPI doc: HTTP ${response.status}` });
      return;
    }

    const openapi = await response.json();
    const suggestedTestCases = [];

    if (openapi.paths) {
      for (const [endpoint, methods] of Object.entries<any>(openapi.paths)) {
        for (const [method, details] of Object.entries<any>(methods)) {
          if (['get', 'post', 'put', 'delete', 'patch'].includes(method.toLowerCase())) {
            suggestedTestCases.push({
              id: `API_${method.toUpperCase()}_${endpoint.replace(/[^a-zA-Z0-9]/g, '_')}`,
              name: `${method.toUpperCase()} ${endpoint} - ${details.summary || 'Smoke Test'}`,
              type: 'api',
              priority: 'medium',
              tags: ['swagger-generated', method.toLowerCase()],
              steps: [
                {
                  name: `Verify ${method.toUpperCase()} ${endpoint}`,
                  method: method.toUpperCase(),
                  endpoint,
                  assertions: [
                    { type: 'status', expected: [200, 201, 204] },
                    { type: 'responseTime', maxMs: 3000 }
                  ]
                }
              ]
            });
          }
        }
      }
    }

    res.json({ count: suggestedTestCases.length, testCases: suggestedTestCases });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(Number(PORT), HOST, () => {
  console.log(`[Local Service] Running strictly at http://${HOST}:${PORT}`);
});
