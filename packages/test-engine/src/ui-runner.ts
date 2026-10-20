import path from 'node:path';
import fs from 'node:fs';
import { chromium, Browser, BrowserContext, Page, Locator } from 'playwright';
import { ProjectConfig, UITestCase, UIStep, TargetLocator, TestCaseResult, TestStepResult } from '@auto-test/test-case-schema';
import { interpolateVariables } from '@auto-test/project-config';

export interface UIRunnerOptions {
  headless?: boolean;
  slowMo?: number;
  artifactsDir: string;
  runtimeVariables?: Record<string, string>;
  onStepUpdate?: (step: TestStepResult) => void;
}

export class DynamicUIRunner {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private isHeadless = true;

  async setup(config: ProjectConfig, options: UIRunnerOptions): Promise<void> {
    const headless = options.headless === true;
    this.isHeadless = headless;
    const slowMo = options.slowMo !== undefined ? options.slowMo : (headless ? 0 : 600);

    this.browser = await chromium.launch({
      headless,
      slowMo,
      args: headless 
        ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        : ['--start-maximized', '--no-sandbox']
    });

    const defaultViewport = config.viewports?.[0] || { width: 1440, height: 900 };
    this.context = await this.browser.newContext({
      viewport: headless ? { width: defaultViewport.width, height: defaultViewport.height } : null,
      baseURL: config.baseUrl,
      recordVideo: {
        dir: path.join(options.artifactsDir, 'videos'),
        size: { width: defaultViewport.width, height: defaultViewport.height }
      }
    });

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(config.timeouts?.action || 10000);
    this.page.setDefaultNavigationTimeout(config.timeouts?.navigation || 30000);
  }

  async runTestCase(
    testCase: UITestCase,
    config: ProjectConfig,
    options: UIRunnerOptions
  ): Promise<TestCaseResult> {
    const startTime = Date.now();
    const stepResults: TestStepResult[] = [];
    const variables = { ...config.variables, ...(options.runtimeVariables || {}) };

    if (!this.page || !this.context) {
      await this.setup(config, options);
    }
    const page = this.page!;

    // Custom viewport if specified on test case
    if (testCase.viewport && typeof testCase.viewport === 'object') {
      await page.setViewportSize(testCase.viewport);
    }

    let testStatus: 'PASS' | 'FAIL' | 'ERROR' = 'PASS';
    let errorMessage: string | undefined;
    let stackTrace: string | undefined;
    let failureScreenshotPath: string | undefined;

    const screenshotsDir = path.join(options.artifactsDir, 'screenshots');
    fs.mkdirSync(screenshotsDir, { recursive: true });

    // Step 0: Navigate to startUrl
    const initialUrl = interpolateVariables(testCase.startUrl, variables);
    try {
      const fullUrl = initialUrl.startsWith('http') 
        ? initialUrl 
        : `${config.baseUrl.replace(/\/$/, '')}/${initialUrl.replace(/^\//, '')}`;
      await page.goto(fullUrl);
    } catch (err: any) {
      testStatus = 'FAIL';
      errorMessage = `Failed to navigate to startUrl "${initialUrl}": ${err.message}`;
      stackTrace = err.stack;
    }

    // Execute steps sequentially if startUrl succeeded
    if (testStatus === 'PASS') {
      for (let i = 0; i < testCase.steps.length; i++) {
        const step = testCase.steps[i];
        const stepStartTime = Date.now();
        const stepName = step.description || `${step.action} ${this.formatTarget(step)}`;
        let stepStatus: 'PASS' | 'FAIL' = 'PASS';
        let stepError: string | undefined;
        let stepDetails: string | undefined;

        try {
          await this.executeStep(page, step, variables, screenshotsDir, testCase.id, i);
        } catch (err: any) {
          stepStatus = 'FAIL';
          testStatus = 'FAIL';
          stepError = err.message;
          stepDetails = err.stack;
          errorMessage = `Step ${i + 1} (${step.action}) failed: ${err.message}`;
          stackTrace = err.stack;

          // Capture failure screenshot
          const screenshotFileName = `${testCase.id}_step_${i + 1}_failed.png`;
          const fullScreenshotPath = path.join(screenshotsDir, screenshotFileName);
          try {
            await page.screenshot({ path: fullScreenshotPath, fullPage: true });
            failureScreenshotPath = path.relative(options.artifactsDir, fullScreenshotPath).replace(/\\/g, '/');
          } catch (scErr) {
            // Ignore screenshot secondary failure
          }
        }

        const stepResult: TestStepResult = {
          index: i + 1,
          name: stepName,
          action: step.action,
          status: stepStatus,
          durationMs: Date.now() - stepStartTime,
          error: stepError,
          errorDetails: stepDetails,
          evidence: failureScreenshotPath ? { screenshotPath: failureScreenshotPath } : undefined
        };

        stepResults.push(stepResult);
        if (options.onStepUpdate) {
          options.onStepUpdate(stepResult);
        }

        if (stepStatus === 'FAIL') {
          // Break on first failed step
          break;
        }
      }
    }

    // Get recorded video if any
    let videoPath: string | undefined;
    try {
      const video = page.video();
      if (video) {
        const fullVideo = await video.path();
        if (fullVideo && fs.existsSync(fullVideo)) {
          videoPath = path.relative(options.artifactsDir, fullVideo).replace(/\\/g, '/');
        }
      }
    } catch {
      // Video retrieval best-effort
    }

    return {
      id: testCase.id,
      name: testCase.name,
      type: 'ui',
      status: testStatus,
      durationMs: Date.now() - startTime,
      steps: stepResults,
      error: errorMessage,
      stackTrace: stackTrace,
      evidence: {
        screenshotPath: failureScreenshotPath,
        videoPath
      }
    };
  }

  private async executeStep(
    page: Page,
    step: UIStep,
    variables: Record<string, string>,
    screenshotsDir: string,
    testId: string,
    stepIndex: number
  ): Promise<void> {
    switch (step.action) {
      case 'goto': {
        const url = interpolateVariables(step.url, variables);
        await page.goto(url);
        break;
      }
      case 'click': {
        const locator = this.resolveLocator(page, step.target);
        await locator.first().waitFor({ state: 'visible' });
        if (!this.isHeadless) {
          try { await locator.first().highlight(); } catch {}
        }
        await locator.first().click();
        break;
      }
      case 'fill': {
        const locator = this.resolveLocator(page, step.target);
        const interpolatedValue = interpolateVariables(step.value, variables);
        await locator.first().waitFor({ state: 'visible' });
        if (!this.isHeadless) {
          try { await locator.first().highlight(); } catch {}
        }
        await locator.first().fill(interpolatedValue);
        break;
      }
      case 'selectOption': {
        const locator = this.resolveLocator(page, step.target);
        const val = interpolateVariables(step.value, variables);
        await locator.waitFor({ state: 'visible' });
        await locator.selectOption(val);
        break;
      }
      case 'check': {
        const locator = this.resolveLocator(page, step.target);
        await locator.waitFor({ state: 'visible' });
        await locator.check();
        break;
      }
      case 'uncheck': {
        const locator = this.resolveLocator(page, step.target);
        await locator.waitFor({ state: 'visible' });
        await locator.uncheck();
        break;
      }
      case 'press': {
        const locator = this.resolveLocator(page, step.target);
        await locator.press(step.key);
        break;
      }
      case 'hover': {
        const locator = this.resolveLocator(page, step.target);
        await locator.hover();
        break;
      }
      case 'waitForVisible': {
        const locator = this.resolveLocator(page, step.target);
        await locator.waitFor({ state: 'visible', timeout: step.timeout });
        break;
      }
      case 'waitForTimeout': {
        await page.waitForTimeout(step.duration);
        break;
      }
      case 'assertVisible': {
        const locator = this.resolveLocator(page, step.target);
        try {
          await locator.first().waitFor({ state: 'visible', timeout: step.timeout || 8000 });
        } catch {
          throw new Error(`Expected element [${this.formatTarget(step)}] to be visible, but it was not`);
        }
        break;
      }
      case 'assertNotVisible': {
        const locator = this.resolveLocator(page, step.target);
        try {
          await locator.first().waitFor({ state: 'hidden', timeout: step.timeout || 5000 });
        } catch {
          throw new Error(`Expected element [${this.formatTarget(step)}] to NOT be visible, but it was visible`);
        }
        break;
      }
      case 'assertText': {
        const locator = this.resolveLocator(page, step.target);
        await locator.first().waitFor({ state: 'visible', timeout: 8000 });
        const expected = interpolateVariables(step.expected, variables);
        const actualText = (await locator.first().innerText()).trim();
        if (step.contains !== false) {
          if (!actualText.includes(expected)) {
            throw new Error(`Text assertion failed: Expected "${actualText}" to contain "${expected}"`);
          }
        } else {
          if (actualText !== expected) {
            throw new Error(`Text assertion failed: Expected exact match "${expected}", but got "${actualText}"`);
          }
        }
        break;
      }
      case 'assertUrl': {
        const expected = interpolateVariables(step.expected, variables);
        const currentUrl = page.url();
        if (step.regex) {
          const rx = new RegExp(expected);
          if (!rx.test(currentUrl)) {
            throw new Error(`URL assertion failed: Current URL "${currentUrl}" does not match pattern "${expected}"`);
          }
        } else {
          // Supports wildcard e.g. "**/dashboard" or contains
          const normalizedExpected = expected.replace(/^\*\*\//, '');
          if (!currentUrl.includes(normalizedExpected)) {
            throw new Error(`URL assertion failed: Current URL "${currentUrl}" does not include "${normalizedExpected}"`);
          }
        }
        break;
      }
      case 'assertTitle': {
        const expected = interpolateVariables(step.expected, variables);
        const title = await page.title();
        if (!title.includes(expected)) {
          throw new Error(`Title assertion failed: Expected title to contain "${expected}", got "${title}"`);
        }
        break;
      }
      case 'assertValue': {
        const locator = this.resolveLocator(page, step.target);
        const expected = interpolateVariables(step.expected, variables);
        const val = await locator.inputValue();
        if (val !== expected) {
          throw new Error(`Input value assertion failed: Expected "${expected}", got "${val}"`);
        }
        break;
      }
      case 'assertEnabled': {
        const locator = this.resolveLocator(page, step.target);
        const isEnabled = await locator.isEnabled();
        if (!isEnabled) {
          throw new Error(`Expected element [${this.formatTarget(step)}] to be enabled, but it was disabled`);
        }
        break;
      }
      case 'screenshot': {
        const name = step.name || `${testId}_step_${stepIndex + 1}`;
        const shotPath = path.join(screenshotsDir, `${name}.png`);
        await page.screenshot({ path: shotPath, fullPage: step.fullPage });
        break;
      }
      default:
        throw new Error(`Unsupported UI action: ${(step as any).action}`);
    }
  }

  private resolveLocator(page: Page, target: TargetLocator): Locator {
    if (target.testId) {
      return page.getByTestId(target.testId);
    }
    if (target.role) {
      return page.getByRole(target.role, { name: target.name });
    }
    if (target.label) {
      return page.getByLabel(target.label);
    }
    if (target.placeholder) {
      return page.getByPlaceholder(target.placeholder);
    }
    if (target.text) {
      return page.getByText(target.text);
    }
    if (target.selector) {
      return page.locator(target.selector);
    }
    throw new Error(`No valid locator criteria specified in target`);
  }

  private formatTarget(step: any): string {
    if (!step.target) return '';
    const t = step.target;
    if (t.role) return `role="${t.role}" name="${t.name || ''}"`;
    if (t.label) return `label="${t.label}"`;
    if (t.placeholder) return `placeholder="${t.placeholder}"`;
    if (t.testId) return `testId="${t.testId}"`;
    if (t.text) return `text="${t.text}"`;
    if (t.selector) return `selector="${t.selector}"`;
    return 'unknown target';
  }

  async teardown(): Promise<void> {
    try {
      if (this.context) await this.context.close();
      if (this.browser) await this.browser.close();
    } catch {
      // Ignore errors during teardown
    } finally {
      this.page = null;
      this.context = null;
      this.browser = null;
    }
  }
}
