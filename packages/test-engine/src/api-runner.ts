import { request, APIRequestContext, chromium, Browser, BrowserContext, Page } from 'playwright';
import { ProjectConfig, APITestCase, APIStep, ApiAssertion, TestCaseResult, TestStepResult } from '@auto-test/test-case-schema';
import { interpolateVariables, maskSensitiveData } from '@auto-test/project-config';
import { configurePlaywrightBrowserPath, launchVisibleBrowser } from './browser-runtime.js';

export interface APIRunnerOptions {
  headless?: boolean;
  slowMo?: number;
  runtimeVariables?: Record<string, string>;
  onStepUpdate?: (step: TestStepResult) => void;
}

export class DynamicAPIRunner {
  private apiContext: APIRequestContext | null = null;
  private browser: Browser | null = null;
  private browserContext: BrowserContext | null = null;
  private page: Page | null = null;
  private runtimeVariables: Record<string, string> = {};

  async setup(config: ProjectConfig, options: APIRunnerOptions = {}): Promise<void> {
    const baseUrl = config.apiBaseUrl || config.baseUrl;
    const defaultHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(config.headers || {})
    };

    // Inject Auth token if configured
    if (config.auth?.tokenEnvVar && process.env[config.auth.tokenEnvVar]) {
      const token = process.env[config.auth.tokenEnvVar];
      if (config.auth.type === 'bearer') {
        defaultHeaders['Authorization'] = `Bearer ${token}`;
      } else {
        defaultHeaders['Authorization'] = token!;
      }
    }

    if (options.headless === false) {
      configurePlaywrightBrowserPath();
      this.browser = await launchVisibleBrowser(options.slowMo ?? 600);
      this.browserContext = await this.browser.newContext({
        viewport: null,
        baseURL: config.baseUrl
      });
      this.page = await this.browserContext.newPage();
      await this.page.bringToFront();
      // Keep the target visible while API requests and assertions stream in the dashboard.
      // A target may expose only an API URL, so navigation failure must not block API checks.
      try {
        await this.page.goto(config.baseUrl, { waitUntil: 'domcontentloaded' });
      } catch (error) {
        throw new Error(`Target application is unreachable at ${config.baseUrl}: ${(error as Error).message}`);
      }
    }
    this.apiContext = await request.newContext({
      baseURL: baseUrl,
      extraHTTPHeaders: defaultHeaders
    });
  }

  async runTestCase(
    testCase: APITestCase,
    config: ProjectConfig,
    options: APIRunnerOptions = {}
  ): Promise<TestCaseResult> {
    const startTime = Date.now();
    const stepResults: TestStepResult[] = [];
    this.runtimeVariables = { ...config.variables, ...(options.runtimeVariables || {}) };

    if (!this.apiContext) {
      try {
        await this.setup(config, options);
      } catch (error) {
        return {
          id: testCase.id,
          name: testCase.name,
          type: 'api',
          status: 'ERROR',
          durationMs: Date.now() - startTime,
          steps: [],
          error: (error as Error).message,
          stackTrace: (error as Error).stack
        };
      }
    }
    const api = this.apiContext!;

    let testStatus: 'PASS' | 'FAIL' | 'ERROR' = 'PASS';
    let errorMessage: string | undefined;
    let stackTrace: string | undefined;

    for (let i = 0; i < testCase.steps.length; i++) {
      const step = testCase.steps[i];
      const stepStartTime = Date.now();
      let stepStatus: 'PASS' | 'FAIL' = 'PASS';
      let stepError: string | undefined;
      let stepDetails: string | undefined;

      try {
        await this.executeStep(api, step);
      } catch (err: any) {
        stepStatus = 'FAIL';
        testStatus = 'FAIL';
        stepError = err.message;
        stepDetails = err.stack;
        errorMessage = `Step ${i + 1} (${step.name}) failed: ${err.message}`;
        stackTrace = err.stack;
      }

      const stepResult: TestStepResult = {
        index: i + 1,
        name: step.name,
        action: `${step.method} ${step.endpoint}`,
        status: stepStatus,
        durationMs: Date.now() - stepStartTime,
        error: stepError,
        errorDetails: stepDetails
      };

      stepResults.push(stepResult);
      if (options.onStepUpdate) {
        options.onStepUpdate(stepResult);
      }

      if (stepStatus === 'FAIL') {
        break;
      }
    }

    return {
      id: testCase.id,
      name: testCase.name,
      type: 'api',
      status: testStatus,
      durationMs: Date.now() - startTime,
      steps: stepResults,
      error: errorMessage,
      stackTrace: stackTrace
    };
  }

  private async executeStep(api: APIRequestContext, step: APIStep): Promise<void> {
    const endpoint = interpolateVariables(step.endpoint, this.runtimeVariables);
    const headers: Record<string, string> = {};
    if (step.headers) {
      for (const [k, v] of Object.entries(step.headers)) {
        headers[k] = interpolateVariables(v, this.runtimeVariables);
      }
    }

    // Process parameters
    const params: Record<string, string> = {};
    if (step.params) {
      for (const [k, v] of Object.entries(step.params)) {
        params[k] = interpolateVariables(String(v), this.runtimeVariables);
      }
    }

    // Process Body
    let bodyData: any = undefined;
    if (step.body !== undefined) {
      if (typeof step.body === 'string') {
        bodyData = interpolateVariables(step.body, this.runtimeVariables);
      } else if (typeof step.body === 'object') {
        const str = JSON.stringify(step.body);
        const replaced = interpolateVariables(str, this.runtimeVariables);
        try {
          bodyData = JSON.parse(replaced);
        } catch {
          bodyData = replaced;
        }
      } else {
        bodyData = step.body;
      }
    }

    const reqStartTime = Date.now();
    let response: any;
    try {
      response = await api.fetch(endpoint, {
        method: step.method,
        headers,
        params,
        data: bodyData
      });
    } catch (fetchErr: any) {
      throw new Error(`HTTP request failed for ${step.method} ${endpoint}: ${fetchErr.message}`);
    }

    const responseDurationMs = Date.now() - reqStartTime;
    const statusCode = response.status();
    const responseHeaders = response.headers();

    let responseBodyText = '';
    let responseJson: any = null;
    try {
      responseBodyText = await response.text();
      responseJson = JSON.parse(responseBodyText);
    } catch {
      // Body is not JSON
    }

    // 1. Extract variables from response for subsequent steps
    if (step.extractVariables && responseJson) {
      for (const extraction of step.extractVariables) {
        const val = this.getValueByPath(responseJson, extraction.path);
        if (val !== undefined) {
          this.runtimeVariables[extraction.name] = String(val);
        }
      }
    }

    // 2. Run Assertions
    for (const assertion of step.assertions) {
      this.evaluateAssertion(assertion, statusCode, responseDurationMs, responseHeaders, responseBodyText, responseJson);
    }
  }

  private evaluateAssertion(
    assertion: ApiAssertion,
    statusCode: number,
    durationMs: number,
    headers: Record<string, string>,
    bodyText: string,
    bodyJson: any
  ): void {
    switch (assertion.type) {
      case 'status': {
        const expected = assertion.expected;
        const matches = Array.isArray(expected) ? expected.includes(statusCode) : statusCode === expected;
        if (!matches) {
          throw new Error(`Expected HTTP status ${JSON.stringify(expected)}, got ${statusCode}. Body: ${bodyText.slice(0, 300)}`);
        }
        break;
      }
      case 'responseTime': {
        if (durationMs > assertion.maxMs) {
          throw new Error(`Response time ${durationMs}ms exceeded threshold of ${assertion.maxMs}ms`);
        }
        break;
      }
      case 'header': {
        const actualVal = headers[assertion.name.toLowerCase()];
        if (!actualVal) {
          throw new Error(`Expected header "${assertion.name}" not found in response`);
        }
        if (assertion.contains) {
          if (!actualVal.includes(assertion.expected)) {
            throw new Error(`Header "${assertion.name}" value "${actualVal}" does not contain "${assertion.expected}"`);
          }
        } else {
          if (actualVal !== assertion.expected) {
            throw new Error(`Header "${assertion.name}" value "${actualVal}" does not equal "${assertion.expected}"`);
          }
        }
        break;
      }
      case 'bodyContains': {
        if (!bodyText.includes(assertion.text)) {
          throw new Error(`Response body does not contain expected text "${assertion.text}"`);
        }
        break;
      }
      case 'fieldEquals': {
        if (!bodyJson) {
          throw new Error(`Cannot assert field "${assertion.path}": Response body is not valid JSON`);
        }
        const actualVal = this.getValueByPath(bodyJson, assertion.path);
        if (JSON.stringify(actualVal) !== JSON.stringify(assertion.expected)) {
          throw new Error(`Field "${assertion.path}" mismatch: Expected ${JSON.stringify(assertion.expected)}, got ${JSON.stringify(actualVal)}`);
        }
        break;
      }
      case 'fieldContains': {
        if (!bodyJson) {
          throw new Error(`Cannot assert field "${assertion.path}": Response body is not valid JSON`);
        }
        const actualVal = this.getValueByPath(bodyJson, assertion.path);
        if (typeof actualVal !== 'string' || !actualVal.includes(assertion.expected)) {
          throw new Error(`Field "${assertion.path}" value "${actualVal}" does not contain "${assertion.expected}"`);
        }
        break;
      }
      case 'fieldExists': {
        if (!bodyJson) {
          throw new Error(`Cannot assert field "${assertion.path}": Response body is not valid JSON`);
        }
        const actualVal = this.getValueByPath(bodyJson, assertion.path);
        if (actualVal === undefined || actualVal === null) {
          throw new Error(`Expected field "${assertion.path}" to exist, but got ${actualVal}`);
        }
        break;
      }
      case 'fieldType': {
        if (!bodyJson) {
          throw new Error(`Cannot assert field "${assertion.path}": Response body is not valid JSON`);
        }
        const actualVal = this.getValueByPath(bodyJson, assertion.path);
        let actualType: string = typeof actualVal;
        if (Array.isArray(actualVal)) actualType = 'array';
        if (actualType !== assertion.expected) {
          throw new Error(`Field "${assertion.path}" expected type "${assertion.expected}", but got "${actualType}"`);
        }
        break;
      }
    }
  }

  private getValueByPath(obj: any, pathStr: string): any {
    if (!obj) return undefined;
    if (!pathStr || pathStr === '$' || pathStr === '.') return obj;
    const parts = pathStr.split('.');
    let curr = obj;
    for (const part of parts) {
      if (curr === null || curr === undefined) return undefined;
      curr = curr[part];
    }
    return curr;
  }

  async teardown(): Promise<void> {
    if (this.apiContext) {
      await this.apiContext.dispose();
      this.apiContext = null;
    }
    if (this.browserContext) {
      await this.browserContext.close();
      this.browserContext = null;
      this.page = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
