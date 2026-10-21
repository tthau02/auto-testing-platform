export interface ProjectInfo {
  id: string;
  name: string;
  description?: string;
  baseUrl: string;
  apiBaseUrl?: string;
  environment: string;
  testCount: number;
  reportsCount: number;
  config: any;
  error?: string;
}

export interface TestCaseItem {
  id: string;
  name: string;
  description?: string;
  type: 'ui' | 'api' | 'visual';
  module?: string;
  priority: string;
  tags?: string[];
  steps?: any[];
  startUrl?: string;
  url?: string;
  automationReady?: boolean;
  automationError?: string;
  manualSteps?: string[];
  expectedResults?: string[];
}

export interface RunOptions {
  projectId: string;
  environment?: string;
  environmentId?: string;
  dashboardUrl?: string;
  testCaseIds?: string[];
  typeFilter?: 'ui' | 'api' | 'visual' | 'all';
  headless?: boolean;
  slowMo?: number;
  updateBaselines?: boolean;
}

const API_BASE = '/api';

export const api = {
  async getHealth() {
    const res = await fetch(`${API_BASE}/health`);
    return res.json();
  },

  async getProjects(): Promise<ProjectInfo[]> {
    const res = await fetch(`${API_BASE}/projects`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async getProject(id: string): Promise<any> {
    const res = await fetch(`${API_BASE}/projects/${id}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async createProject(config: any): Promise<any> {
    const res = await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.details ? err.details.join('\n') : err.error || 'Failed to create project');
    }
    return res.json();
  },

  async updateProject(id: string, config: any): Promise<any> {
    const res = await fetch(`${API_BASE}/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.details ? err.details.join('\n') : err.error || 'Failed to update project');
    }
    return res.json();
  },

  async validateProject(id: string, config: any): Promise<{ valid: boolean; errors?: string[] }> {
    const res = await fetch(`${API_BASE}/projects/${id}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    return res.json();
  },

  async getTestCases(projectId: string): Promise<TestCaseItem[]> {
    const res = await fetch(`${API_BASE}/projects/${projectId}/test-cases`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async createTestCase(projectId: string, testCase: any): Promise<any> {
    const res = await fetch(`${API_BASE}/projects/${projectId}/test-cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testCase)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.details || err.error || 'Failed to create test case');
    }
    return res.json();
  },

  async deleteTestCase(projectId: string, testId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/projects/${projectId}/test-cases/${testId}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async triggerRun(options: RunOptions): Promise<{ runId: string; status: string }> {
    const res = await fetch(`${API_BASE}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to trigger run');
    }
    return res.json();
  },

  async getRunStatus(runId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/runs/${runId}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async stopRun(runId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/runs/${runId}/stop`, {
      method: 'POST'
    });
    return res.json();
  },

  async getReports(projectId: string): Promise<any[]> {
    const res = await fetch(`${API_BASE}/projects/${projectId}/reports`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async getReportDetail(projectId: string, runId: string): Promise<{ summary: any; markdown: string; junit: string | null; html: string | null }> {
    const res = await fetch(`${API_BASE}/projects/${projectId}/reports/${runId}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async importSwagger(url: string): Promise<any> {
    const res = await fetch(`${API_BASE}/docs/swagger-import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to import Swagger');
    }
    return res.json();
  }
};
