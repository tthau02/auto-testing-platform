import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import path from 'node:path';
import { ProjectConfigSchema } from '@auto-test/test-case-schema';
import { safeResolvePath, validateHostSecurity } from './index.js';

const makeConfig = (baseUrl: string, allowlistHosts: string[]) => ProjectConfigSchema.parse({
  id: 'security-test',
  name: 'Security test',
  baseUrl,
  security: { allowlistHosts }
});

describe('project path and host security', () => {
  it('resolves paths within the configured root', () => {
    const base = path.resolve('projects', 'allowed');
    assert.equal(safeResolvePath(base, 'reports/run-1'), path.join(base, 'reports', 'run-1'));
  });

  it('rejects parent traversal and sibling paths sharing a root prefix', () => {
    const base = path.resolve('projects', 'allowed');
    assert.throws(() => safeResolvePath(base, '../allowed-escape/secrets.json'), /escapes base directory/);
  });

  it('matches wildcard allowlist entries on hostname boundaries', () => {
    assert.doesNotThrow(() => validateHostSecurity(makeConfig('https://qa.example.test', ['*.example.test'])));
    assert.throws(
      () => validateHostSecurity(makeConfig('https://example.test.attacker.invalid', ['*.example.test'])),
      /not in allowlist/
    );
  });
});
