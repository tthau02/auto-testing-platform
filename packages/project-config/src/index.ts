import fs from 'node:fs';
import path from 'node:path';
import { ProjectConfig, ProjectConfigSchema } from '@auto-test/test-case-schema';

export interface ResolvedProject {
  config: ProjectConfig;
  projectDir: string;
  reportsDir: string;
  testCaseFiles: string[];
}

/**
 * Validates and safely resolves path within an allowed directory root to prevent Path Traversal
 */
export function safeResolvePath(baseDir: string, relativeOrSubPath: string): string {
  const resolved = path.resolve(baseDir, relativeOrSubPath);
  const normalizedBase = path.resolve(baseDir);
  const relative = path.relative(normalizedBase, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Security Violation: Path "${relativeOrSubPath}" escapes base directory "${baseDir}"`);
  }
  return resolved;
}

/**
 * Loads and validates a project configuration from a directory
 */
export function loadProjectConfig(projectDir: string, environmentOverride?: string): ProjectConfig {
  const configPath = path.join(projectDir, 'project.config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`Project configuration file not found at: ${configPath}`);
  }

  let rawContent: unknown;
  try {
    const fileContent = fs.readFileSync(configPath, 'utf-8');
    rawContent = JSON.parse(fileContent);
  } catch (err: any) {
    throw new Error(`Failed to parse ${configPath} as JSON: ${err.message}`);
  }

  const parseResult = ProjectConfigSchema.safeParse(rawContent);
  if (!parseResult.success) {
    const errorMessages = parseResult.error.errors
      .map(e => `[${e.path.join('.') || 'root'}]: ${e.message}`)
      .join('\n');
    throw new Error(`Invalid project configuration in ${configPath}:\n${errorMessages}`);
  }

  let config = parseResult.data;

  // Apply environment override if provided
  const targetEnv = environmentOverride || config.environment;
  if (targetEnv && !config.environments?.[targetEnv] && targetEnv !== config.environment) {
    throw new Error(`Environment "${targetEnv}" is not configured for project "${config.id}". Configured environments: ${Object.keys(config.environments || {}).join(', ') || config.environment}`);
  }
  if (targetEnv && config.environments?.[targetEnv]) {
    const envConfig = config.environments[targetEnv];
    config = {
      ...config,
      environment: targetEnv,
      baseUrl: envConfig.baseUrl || config.baseUrl,
      apiBaseUrl: envConfig.apiBaseUrl || config.apiBaseUrl,
      variables: {
        ...config.variables,
        ...(envConfig.variables || {})
      }
    };
  }

  if (!config.baseUrl) {
    throw new Error(`Target application baseUrl is not configured for project "${config.id}" (environment "${targetEnv}").`);
  }

  // Validate Host Allowlist
  validateHostSecurity(config);

  return config;
}

/**
 * Validates that baseUrl and apiBaseUrl belong to allowlisted hosts
 */
export function validateHostSecurity(config: ProjectConfig): void {
  const allowlist = config.security?.allowlistHosts || ['localhost', '127.0.0.1'];
  if (!allowlist || allowlist.length === 0) return;

  const urlsToCheck = [config.baseUrl, config.apiBaseUrl].filter(Boolean) as string[];
  for (const urlStr of urlsToCheck) {
    try {
      const parsed = new URL(urlStr);
      const isAllowed = allowlist.some(allowed => {
        if (allowed === '*') return true;
        const rule = allowed.toLowerCase();
        const hostname = parsed.hostname.toLowerCase();
        if (hostname === rule) return true;
        if (rule.startsWith('*.')) {
          const suffix = rule.slice(2);
          return hostname === suffix || hostname.endsWith(`.${suffix}`);
        }
        return false;
      });
      if (!isAllowed) {
        throw new Error(
          `Security Violation: Host "${parsed.hostname}" is not in allowlist: [${allowlist.join(', ')}]`
        );
      }
    } catch (err: any) {
      if (err.message.startsWith('Security Violation')) throw err;
      throw new Error(`Invalid URL configured: ${urlStr}`);
    }
  }
}

/**
 * Finds all test case JSON files in the project's configured test directories
 */
export function discoverTestCases(projectDir: string, config: ProjectConfig): string[] {
  const testFiles: string[] = [];
  const testDirs = config.testDirectories || ['test-cases'];

  for (const testDir of testDirs) {
    const fullDirPath = safeResolvePath(projectDir, testDir);
    if (fs.existsSync(fullDirPath) && fs.statSync(fullDirPath).isDirectory()) {
      findJsonFilesRecursively(fullDirPath, testFiles);
    }
  }

  return testFiles;
}

function findJsonFilesRecursively(dir: string, fileList: string[]): void {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      findJsonFilesRecursively(fullPath, fileList);
    } else if (stat.isFile() && item.endsWith('.json') && !item.endsWith('.config.json')) {
      fileList.push(fullPath);
    }
  }
}

/**
 * Interpolates {{VAR_NAME}} expressions using project variables and process.env
 */
export function interpolateVariables(template: string, variables: Record<string, string> = {}): string {
  return template.replace(/\{\{([A-Z0-9_-]+)\}\}/g, (match, varName) => {
    if (varName in variables) {
      return variables[varName];
    }
    if (process.env[varName] !== undefined) {
      return process.env[varName]!;
    }
    return match; // Keep unresolved variable for debugging or test validation
  });
}

/**
 * Sanitizes sensitive key names and strings (e.g. passwords, tokens, auth headers)
 */
export function maskSensitiveData(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(maskSensitiveData);

  const sensitiveKeys = ['password', 'token', 'authorization', 'secret', 'cookie', 'api_key', 'apikey'];
  const masked: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    const isSensitive = sensitiveKeys.some(s => key.toLowerCase().includes(s));
    if (isSensitive && typeof value === 'string') {
      masked[key] = value.length > 8 ? `${value.slice(0, 3)}***${value.slice(-3)}` : '******';
    } else if (typeof value === 'object' && value !== null) {
      masked[key] = maskSensitiveData(value);
    } else {
      masked[key] = value;
    }
  }

  return masked;
}
