import path from 'node:path';
import fs from 'node:fs';
import { chromium, Browser, BrowserContext, Page, Locator } from 'playwright';
import { ProjectConfig, UITestCase, UIStep, TargetLocator, TestCaseResult, TestStepResult } from '@auto-test/test-case-schema';
import { interpolateVariables, validateTargetUrl } from '@auto-test/project-config';
import { configurePlaywrightBrowserPath, launchVisibleBrowser } from './browser-runtime.js';

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
  private authenticatedIdentity: string | null = null;
  private pendingLoginIdentity: string | null = null;

  async setup(config: ProjectConfig, options: UIRunnerOptions): Promise<void> {
    configurePlaywrightBrowserPath();
    const headless = options.headless === true;
    this.isHeadless = headless;
    const slowMo = options.slowMo !== undefined ? options.slowMo : (headless ? 0 : 600);

    this.browser = headless
      ? await chromium.launch({ headless: true, slowMo, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] })
      : await launchVisibleBrowser(slowMo);

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
    if (!headless) await this.page.bringToFront();
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

    // Reuse a session for consecutive cases that use the same account.
    let firstStepIndex = 0;
    const loginBlock = this.findLoginBlock(testCase.steps, variables);
    const canReuseSession = Boolean(
      loginBlock &&
      this.authenticatedIdentity === loginBlock.identity &&
      await this.hasStoredAuthToken(page)
    );
    if (canReuseSession && loginBlock) {
      firstStepIndex = loginBlock.endIndex + 1;
    } else if (this.authenticatedIdentity) {
      await this.clearAuthenticatedSession(page);
    }

    // Step 0: Navigate to startUrl unless the matching account is already authenticated.
    const initialUrl = interpolateVariables(testCase.startUrl, variables);
    const fullUrl = initialUrl.startsWith('http')
      ? initialUrl
      : `${config.baseUrl.replace(/\/$/, '')}/${initialUrl.replace(/^\//, '')}`;
    if (!canReuseSession) {
      try {
        await page.goto(validateTargetUrl(config, fullUrl));
      } catch (err: any) {
        testStatus = 'FAIL';
        errorMessage = `Target application navigation failed. Target baseURL: ${config.baseUrl}; start URL: ${fullUrl}. ${err.message}`;
        stackTrace = err.stack;
      }
    }

    // Execute steps sequentially if startUrl succeeded
    if (testStatus === 'PASS') {
      for (let i = firstStepIndex; i < testCase.steps.length; i++) {
        const step = testCase.steps[i];
        const stepStartTime = Date.now();
        const stepName = step.description || `${step.action} ${this.formatTarget(step)}`;
        let stepStatus: 'PASS' | 'FAIL' = 'PASS';
        let stepError: string | undefined;
        let stepDetails: string | undefined;

        try {
          await this.executeStep(page, step, config, variables, screenshotsDir, testCase.id, i);
          if (step.action === 'fill' && this.isLoginIdentityLocator(step.target)) {
            this.pendingLoginIdentity = interpolateVariables(step.value, variables);
          }
          if (step.action === 'click' && this.isLoginButton(step.target) && this.pendingLoginIdentity) {
            if (await this.waitForStoredAuthToken(page)) this.authenticatedIdentity = this.pendingLoginIdentity;
            this.pendingLoginIdentity = null;
          }
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
    config: ProjectConfig,
    variables: Record<string, string>,
    screenshotsDir: string,
    testId: string,
    stepIndex: number
  ): Promise<void> {
    switch (step.action) {
      case 'goto': {
        const url = interpolateVariables(step.url, variables);
        if (new URL(url, config.baseUrl).pathname.replace(/\/$/, '') === '/login') {
          await this.clearAuthenticatedSession(page);
        }
        await page.goto(validateTargetUrl(config, url));
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
      this.authenticatedIdentity = null;
      this.pendingLoginIdentity = null;
    }
  }

  private findLoginBlock(steps: UIStep[], variables: Record<string, string>): { identity: string; endIndex: number } | undefined {
    const identityIndex = steps.findIndex((step, index) =>
      index < 4 && step.action === 'fill' && this.isLoginIdentityLocator(step.target)
    );
    if (identityIndex < 0) return undefined;
    const identityStep = steps[identityIndex];
    if (identityStep.action !== 'fill') return undefined;
    const endIndex = steps.findIndex((step, index) =>
      index > identityIndex && index <= identityIndex + 5 &&
      step.action === 'click' && this.isLoginButton(step.target)
    );
    if (endIndex < 0) return undefined;
    return { identity: interpolateVariables(identityStep.value, variables), endIndex };
  }

  private isLoginIdentityLocator(target: TargetLocator): boolean {
    const locatorText = `${target.placeholder || ''} ${target.label || ''} ${target.name || ''}`.toLowerCase();
    return locatorText.includes('đăng nhập') || locatorText.includes('email') || locatorText.includes('tài khoản');
  }

  private isLoginButton(target: TargetLocator): boolean {
    return target.role === 'button' && (target.name || '').toLowerCase().includes('đăng nhập');
  }

  private async hasStoredAuthToken(page: Page): Promise<boolean> {
    try {
      return await page.evaluate(() => Boolean(localStorage.getItem('auth_token')));
    } catch {
      return false;
    }
  }

  private async waitForStoredAuthToken(page: Page): Promise<boolean> {
    try {
      await page.waitForFunction(() => Boolean(localStorage.getItem('auth_token')), null, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  private async clearAuthenticatedSession(page: Page): Promise<void> {
    await this.context?.clearCookies();
    try {
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
    } catch {
      // The current page may not have reached the target origin yet.
    }
    this.authenticatedIdentity = null;
    this.pendingLoginIdentity = null;
  }
}
