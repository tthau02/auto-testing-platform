import fs from 'node:fs';
import path from 'node:path';
import { chromium, type Browser } from 'playwright';

/** Use a workspace-local Playwright browser cache when one is present. */
export function configurePlaywrightBrowserPath(): void {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return;
  const workspaceCache = path.resolve(process.cwd(), '.playwright-browsers');
  if (fs.existsSync(workspaceCache)) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = workspaceCache;
  }
}

/** Open a visible, foreground browser window for headed test runs. */
export async function launchVisibleBrowser(slowMo = 0): Promise<Browser> {
  configurePlaywrightBrowserPath();
  const options = {
    headless: false,
    slowMo,
    args: ['--start-maximized', '--new-window', '--no-first-run', '--no-default-browser-check']
  };

  try {
    return await chromium.launch({ ...options, channel: 'chrome' });
  } catch (error) {
    console.warn(`[Browser] Installed Chrome could not be launched; using Playwright Chromium: ${(error as Error).message}`);
    return chromium.launch(options);
  }
}
