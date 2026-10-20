import { TestRunSummary } from '@auto-test/test-case-schema';

export function generateJUnitXml(summary: TestRunSummary): string {
  const { runId, projectName, durationMs, counts, results } = summary;
  const totalSeconds = (durationMs / 1000).toFixed(3);

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<testsuites name="${escapeXml(projectName)}" tests="${counts.total}" failures="${counts.fail}" errors="0" skipped="${counts.skip}" time="${totalSeconds}">\n`;
  xml += `  <testsuite name="${escapeXml(projectName)}" id="${runId}" tests="${counts.total}" failures="${counts.fail}" errors="0" skipped="${counts.skip}" time="${totalSeconds}">\n`;

  for (const tc of results) {
    const timeSec = (tc.durationMs / 1000).toFixed(3);
    xml += `    <testcase classname="${escapeXml(tc.type.toUpperCase())}.${escapeXml(tc.id)}" name="${escapeXml(tc.name)}" time="${timeSec}">\n`;
    if (tc.status === 'FAIL' || tc.status === 'ERROR') {
      const errMsg = tc.error || 'Test failed';
      const stack = tc.stackTrace || tc.error || '';
      xml += `      <failure message="${escapeXml(errMsg)}" type="AssertionError">${escapeXml(stack)}</failure>\n`;
    } else if (tc.status === 'SKIPPED') {
      xml += `      <skipped/>\n`;
    }
    xml += `    </testcase>\n`;
  }

  xml += `  </testsuite>\n`;
  xml += `</testsuites>\n`;
  return xml;
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}
