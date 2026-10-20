import path from 'node:path';
import fs from 'node:fs';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { ProjectConfig, VisualTestCase, TestCaseResult, TestStepResult } from '@auto-test/test-case-schema';
import { interpolateVariables } from '@auto-test/project-config';

export interface VisualRunnerOptions {
  headless?: boolean;
  artifactsDir: string;
  projectDir: string;
  onStepUpdate?: (step: TestStepResult) => void;
}

export class DynamicVisualRunner {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async setup(options: VisualRunnerOptions): Promise<void> {
    const headless = options.headless !== undefined ? options.headless : true;
    this.browser = await chromium.launch({
      headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
  }

  async runTestCase(
    testCase: VisualTestCase,
    config: ProjectConfig,
    options: VisualRunnerOptions
  ): Promise<TestCaseResult> {
    const startTime = Date.now();
    const stepResults: TestStepResult[] = [];

    if (!this.browser) {
      await this.setup(options);
    }

    const baselinesDir = path.join(options.projectDir, 'baselines');
    fs.mkdirSync(baselinesDir, { recursive: true });

    const screenshotsDir = path.join(options.artifactsDir, 'screenshots');
    const actualDir = path.join(screenshotsDir, 'actual');
    const diffDir = path.join(screenshotsDir, 'diff');
    fs.mkdirSync(actualDir, { recursive: true });
    fs.mkdirSync(diffDir, { recursive: true });

    const viewports = testCase.viewports || config.viewports || [{ name: 'desktop', width: 1280, height: 720 }];
    let overallStatus: 'PASS' | 'FAIL' | 'ERROR' = 'PASS';
    let errorMessage: string | undefined;
    let stackTrace: string | undefined;
    let primaryDiffPath: string | undefined;
    let primaryActualPath: string | undefined;
    let primaryBaselinePath: string | undefined;

    for (let v = 0; v < viewports.length; v++) {
      const vp = viewports[v];
      const stepStartTime = Date.now();
      const stepName = `Snapshot ${testCase.snapshotName} [${vp.name} ${vp.width}x${vp.height}]`;
      let stepStatus: 'PASS' | 'FAIL' = 'PASS';
      let stepError: string | undefined;

      const baselineFileName = `${testCase.snapshotName}_${vp.name}.png`;
      const baselineFullPath = path.join(baselinesDir, baselineFileName);
      const actualFullPath = path.join(actualDir, baselineFileName);
      const diffFullPath = path.join(diffDir, baselineFileName);

      const relBaseline = path.relative(options.artifactsDir, baselineFullPath).replace(/\\/g, '/');
      const relActual = path.relative(options.artifactsDir, actualFullPath).replace(/\\/g, '/');
      const relDiff = path.relative(options.artifactsDir, diffFullPath).replace(/\\/g, '/');

      let context: BrowserContext | null = null;
      try {
        context = await this.browser!.newContext({
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: 1
        });
        const page = await context.newPage();

        const targetUrl = testCase.url.startsWith('http')
          ? testCase.url
          : `${config.baseUrl.replace(/\/$/, '')}/${testCase.url.replace(/^\//, '')}`;

        await page.goto(targetUrl, { waitUntil: 'networkidle' });

        // Execute mask if provided
        if (testCase.mask && testCase.mask.length > 0) {
          for (const selector of testCase.mask) {
            await page.evaluate((sel) => {
              document.querySelectorAll(sel).forEach(el => {
                (el as HTMLElement).style.visibility = 'hidden';
              });
            }, selector);
          }
        }

        // Capture actual screenshot with animations disabled to avoid flakiness
        await page.screenshot({
          path: actualFullPath,
          fullPage: testCase.fullPage !== false,
          animations: 'disabled'
        });

        // Check if baseline exists
        if (!fs.existsSync(baselineFullPath)) {
          // Initialize baseline automatically for first run
          fs.copyFileSync(actualFullPath, baselineFullPath);
          stepStatus = 'PASS';
        } else {
          // Compare baseline and actual
          const baselineImg = PNG.sync.read(fs.readFileSync(baselineFullPath));
          const actualImg = PNG.sync.read(fs.readFileSync(actualFullPath));

          const width = baselineImg.width;
          const height = baselineImg.height;

          if (width !== actualImg.width || height !== actualImg.height) {
            stepStatus = 'FAIL';
            overallStatus = 'FAIL';
            stepError = `Image dimensions mismatch: Baseline is ${width}x${height}, but actual is ${actualImg.width}x${actualImg.height}`;
            errorMessage = stepError;
          } else {
            const diff = new PNG({ width, height });
            const numDiffPixels = pixelmatch(
              baselineImg.data,
              actualImg.data,
              diff.data,
              width,
              height,
              { threshold: testCase.threshold || 0.1 }
            );

            const totalPixels = width * height;
            const mismatchRatio = numDiffPixels / totalPixels;

            if (mismatchRatio > (testCase.threshold || 0.1)) {
              stepStatus = 'FAIL';
              overallStatus = 'FAIL';
              fs.writeFileSync(diffFullPath, PNG.sync.write(diff));
              stepError = `Visual mismatch detected: ${(mismatchRatio * 100).toFixed(2)}% pixels differ (threshold: ${((testCase.threshold || 0.1) * 100).toFixed(1)}%)`;
              errorMessage = stepError;
              primaryDiffPath = relDiff;
              primaryActualPath = relActual;
              primaryBaselinePath = relBaseline;
            }
          }
        }
      } catch (err: any) {
        stepStatus = 'FAIL';
        overallStatus = 'FAIL';
        stepError = err.message;
        errorMessage = err.message;
        stackTrace = err.stack;
      } finally {
        if (context) await context.close();
      }

      const stepResult: TestStepResult = {
        index: v + 1,
        name: stepName,
        action: 'visual-compare',
        status: stepStatus,
        durationMs: Date.now() - stepStartTime,
        error: stepError,
        evidence: {
          baselinePath: fs.existsSync(baselineFullPath) ? relBaseline : undefined,
          actualPath: relActual,
          diffPath: stepStatus === 'FAIL' && fs.existsSync(diffFullPath) ? relDiff : undefined
        }
      };

      stepResults.push(stepResult);
      if (options.onStepUpdate) {
        options.onStepUpdate(stepResult);
      }
    }

    return {
      id: testCase.id,
      name: testCase.name,
      type: 'visual',
      status: overallStatus,
      durationMs: Date.now() - startTime,
      steps: stepResults,
      error: errorMessage,
      stackTrace: stackTrace,
      evidence: {
        diffPath: primaryDiffPath,
        actualPath: primaryActualPath,
        baselinePath: primaryBaselinePath
      }
    };
  }

  async teardown(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
