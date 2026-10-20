import fs from 'node:fs';
import path from 'node:path';
import { 
  ProjectConfig, 
  AnyTestCase, 
  TestRunSummary, 
  TestCaseResult, 
  TestStepResult,
  parseTestCase 
} from '@auto-test/test-case-schema';
import { loadProjectConfig, discoverTestCases } from '@auto-test/project-config';
import { saveReportFiles } from '@auto-test/report-engine';
import { DynamicUIRunner } from './ui-runner.js';
import { DynamicAPIRunner } from './api-runner.js';
import { DynamicVisualRunner } from './visual-runner.js';

export interface ExecutionOptions {
  projectDir: string;
  environment?: string;
  testCaseIds?: string[];
  typeFilter?: 'ui' | 'api' | 'visual' | 'all';
  tagFilter?: string[];
  headless?: boolean;
  slowMo?: number;
  cliCommand?: string;
  onEvent?: (event: ExecutionEvent) => void;
}

export type ExecutionEvent =
  | { type: 'RUN_STARTED'; payload: { runId: string; totalTests: number; project: string } }
  | { type: 'TEST_STARTED'; payload: { testId: string; name: string; testType: string; current: number; total: number } }
  | { type: 'STEP_PROGRESS'; payload: { testId: string; step: TestStepResult } }
  | { type: 'TEST_COMPLETED'; payload: { result: TestCaseResult } }
  | { type: 'RUN_COMPLETED'; payload: { summary: TestRunSummary; reportsDir: string } };

export class TestEngineOrchestrator {
  private isCancelled = false;

  cancel(): void {
    this.isCancelled = true;
  }

  async run(options: ExecutionOptions): Promise<TestRunSummary> {
    this.isCancelled = false;
    const startTime = new Date();
    const projectDir = path.resolve(options.projectDir);
    const config = loadProjectConfig(projectDir, options.environment);

    // Create unique run directory with timestamp
    const timestampStr = this.formatTimestamp(startTime);
    const runId = `${timestampStr}_${Math.random().toString(36).substring(2, 7)}`;
    const reportsDir = path.join(projectDir, 'reports', runId);
    fs.mkdirSync(reportsDir, { recursive: true });

    // Discover and filter test cases
    const testFiles = discoverTestCases(projectDir, config);
    const loadedTestCases: AnyTestCase[] = [];

    for (const file of testFiles) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const parsed = JSON.parse(content);
        const testCaseRes = parseTestCase(parsed);
        if (testCaseRes.success) {
          loadedTestCases.push(testCaseRes.data);
        } else {
          console.warn(`[WARN] Skipping invalid test case in ${file}: ${testCaseRes.error}`);
        }
      } catch (err: any) {
        console.warn(`[WARN] Error reading test case file ${file}: ${err.message}`);
      }
    }

    // Filter test cases
    let testsToRun = loadedTestCases;
    if (options.testCaseIds && options.testCaseIds.length > 0) {
      testsToRun = testsToRun.filter(tc => options.testCaseIds!.includes(tc.id));
    }
    if (options.typeFilter && options.typeFilter !== 'all') {
      testsToRun = testsToRun.filter(tc => tc.type === options.typeFilter);
    }
    if (options.tagFilter && options.tagFilter.length > 0) {
      testsToRun = testsToRun.filter(tc => tc.tags?.some(tag => options.tagFilter!.includes(tag)));
    }

    // Emit RUN_STARTED
    options.onEvent?.({
      type: 'RUN_STARTED',
      payload: {
        runId,
        totalTests: testsToRun.length,
        project: config.name
      }
    });

    const testResults: TestCaseResult[] = [];
    const uiRunner = new DynamicUIRunner();
    const apiRunner = new DynamicAPIRunner();
    const visualRunner = new DynamicVisualRunner();

    try {
      for (let i = 0; i < testsToRun.length; i++) {
        if (this.isCancelled) {
          // Mark remaining tests as SKIPPED
          for (let j = i; j < testsToRun.length; j++) {
            const skippedTc = testsToRun[j];
            testResults.push({
              id: skippedTc.id,
              name: skippedTc.name,
              type: skippedTc.type,
              status: 'SKIPPED',
              durationMs: 0,
              steps: []
            });
          }
          break;
        }

        const tc = testsToRun[i];
        options.onEvent?.({
          type: 'TEST_STARTED',
          payload: {
            testId: tc.id,
            name: tc.name,
            testType: tc.type,
            current: i + 1,
            total: testsToRun.length
          }
        });

        let result: TestCaseResult;

        if (tc.type === 'ui') {
          result = await uiRunner.runTestCase(tc, config, {
            artifactsDir: reportsDir,
            headless: options.headless,
            slowMo: options.slowMo,
            onStepUpdate: (step) => {
              options.onEvent?.({
                type: 'STEP_PROGRESS',
                payload: { testId: tc.id, step }
              });
            }
          });
        } else if (tc.type === 'api') {
          result = await apiRunner.runTestCase(tc, config, {
            onStepUpdate: (step) => {
              options.onEvent?.({
                type: 'STEP_PROGRESS',
                payload: { testId: tc.id, step }
              });
            }
          });
        } else if (tc.type === 'visual') {
          result = await visualRunner.runTestCase(tc, config, {
            artifactsDir: reportsDir,
            projectDir,
            headless: options.headless,
            onStepUpdate: (step) => {
              options.onEvent?.({
                type: 'STEP_PROGRESS',
                payload: { testId: tc.id, step }
              });
            }
          });
        } else {
          result = {
            id: (tc as any).id,
            name: (tc as any).name,
            type: 'ui',
            status: 'ERROR',
            durationMs: 0,
            steps: [],
            error: `Unsupported test case type: ${(tc as any).type}`
          };
        }

        testResults.push(result);
        options.onEvent?.({
          type: 'TEST_COMPLETED',
          payload: { result }
        });
      }
    } finally {
      await uiRunner.teardown();
      await apiRunner.teardown();
      await visualRunner.teardown();
    }

    const endTime = new Date();
    const durationMs = endTime.getTime() - startTime.getTime();

    const counts = {
      total: testResults.length,
      pass: testResults.filter(r => r.status === 'PASS').length,
      fail: testResults.filter(r => r.status === 'FAIL' || r.status === 'ERROR').length,
      skip: testResults.filter(r => r.status === 'SKIPPED').length
    };

    const overallStatus = counts.fail > 0 ? 'FAIL' : counts.pass > 0 ? 'PASS' : 'ERROR';

    const summary: TestRunSummary = {
      runId,
      projectId: config.id,
      projectName: config.name,
      environment: config.environment,
      baseUrl: config.baseUrl,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      durationMs,
      status: overallStatus,
      counts,
      results: testResults,
      metadata: {
        browser: 'chromium',
        os: process.platform,
        cliCommand: options.cliCommand
      }
    };

    // Save report files (results.json, report.md, junit.xml)
    saveReportFiles(summary, reportsDir);

    options.onEvent?.({
      type: 'RUN_COMPLETED',
      payload: { summary, reportsDir }
    });

    return summary;
  }

  private formatTimestamp(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const min = pad(d.getMinutes());
    const ss = pad(d.getSeconds());
    return `${yyyy}-${mm}-${dd}_${hh}${min}${ss}`;
  }
}
