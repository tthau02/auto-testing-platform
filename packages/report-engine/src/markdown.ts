import { TestRunSummary, TestCaseResult } from '@auto-test/test-case-schema';

export function generateMarkdownReport(summary: TestRunSummary): string {
  const { runId, projectId, projectName, environment, baseUrl, startTime, endTime, durationMs, counts, results, metadata } = summary;

  const passRate = counts.total > 0 ? ((counts.pass / counts.total) * 100).toFixed(1) : '0';
  const statusBadge = summary.status === 'PASS' 
    ? '✅ **PASS**' 
    : summary.status === 'FAIL' 
      ? '❌ **FAIL**' 
      : '⚠️ **ERROR**';

  const durationSec = (durationMs / 1000).toFixed(2);

  let md = `# 🧪 Test Execution Report: ${projectName}\n\n`;
  md += `| Attribute | Value |\n`;
  md += `| :--- | :--- |\n`;
  md += `| **Run ID** | \`${runId}\` |\n`;
  md += `| **Project** | ${projectName} (\`${projectId}\`) |\n`;
  md += `| **Environment** | \`${environment}\` (${baseUrl}) |\n`;
  md += `| **Status** | ${statusBadge} |\n`;
  md += `| **Total Tests** | ${counts.total} |\n`;
  md += `| **Passed** | 🟢 ${counts.pass} |\n`;
  md += `| **Failed** | 🔴 ${counts.fail} |\n`;
  md += `| **Skipped** | ⚪ ${counts.skip} |\n`;
  md += `| **Pass Rate** | **${passRate}%** |\n`;
  md += `| **Start Time** | ${startTime} |\n`;
  md += `| **End Time** | ${endTime} |\n`;
  md += `| **Duration** | ${durationSec}s |\n`;
  if (metadata?.cliCommand) {
    md += `| **Reproduction CLI** | \`${metadata.cliCommand}\` |\n`;
  }
  md += `\n---\n\n`;

  // Summary Table
  md += `## 📋 Test Cases Summary\n\n`;
  md += `| # | Status | Type | Test Case ID | Test Name | Duration | Evidence |\n`;
  md += `| :-: | :---: | :---: | :--- | :--- | :-: | :--- |\n`;

  results.forEach((tc, index) => {
    const statusIcon = tc.status === 'PASS' ? '✅ PASS' : tc.status === 'FAIL' ? '❌ FAIL' : '⚪ SKIP';
    const dur = `${(tc.durationMs / 1000).toFixed(2)}s`;
    const evidenceLinks: string[] = [];
    if (tc.evidence?.screenshotPath) evidenceLinks.push(`[📸 Screenshot](${tc.evidence.screenshotPath})`);
    if (tc.evidence?.diffPath) evidenceLinks.push(`[🔍 Diff](${tc.evidence.diffPath})`);
    if (tc.evidence?.tracePath) evidenceLinks.push(`[📈 Trace](${tc.evidence.tracePath})`);
    if (tc.evidence?.videoPath) evidenceLinks.push(`[🎥 Video](${tc.evidence.videoPath})`);
    const evidenceStr = evidenceLinks.length > 0 ? evidenceLinks.join(' \\| ') : '-';

    md += `| ${index + 1} | ${statusIcon} | \`${tc.type.toUpperCase()}\` | \`${tc.id}\` | ${escapePipes(tc.name)} | ${dur} | ${evidenceStr} |\n`;
  });

  // Failed Tests Details
  const failedTests = results.filter(r => r.status === 'FAIL' || r.status === 'ERROR');
  if (failedTests.length > 0) {
    md += `\n---\n\n## ❌ Failed Tests Breakdown\n\n`;

    for (const test of failedTests) {
      md += `### 🔴 [${test.type.toUpperCase()}] ${test.name} (\`${test.id}\`)\n\n`;
      if (test.error) {
        md += `**Error Message:**\n\`\`\`text\n${test.error}\n\`\`\`\n\n`;
      }

      if (test.steps.length > 0) {
        md += `#### Step Execution:\n\n`;
        md += `| Step | Action | Status | Duration | Detail / Error |\n`;
        md += `| :--- | :--- | :---: | :-: | :--- |\n`;
        for (const s of test.steps) {
          const sIcon = s.status === 'PASS' ? '✅' : s.status === 'FAIL' ? '❌' : '⚪';
          const sDur = `${(s.durationMs / 1000).toFixed(2)}s`;
          const sErr = s.error ? `\`${escapePipes(s.error)}\`` : '-';
          md += `| ${escapePipes(s.name)} | \`${s.action || 'step'}\` | ${sIcon} | ${sDur} | ${sErr} |\n`;
        }
        md += `\n`;
      }

      if (test.evidence) {
        md += `#### Evidence:\n`;
        if (test.evidence.screenshotPath) {
          md += `- Screenshot: ![Failure Screenshot](${test.evidence.screenshotPath})\n`;
        }
        if (test.evidence.diffPath) {
          md += `- Visual Diff: ![Visual Diff](${test.evidence.diffPath})\n`;
        }
        if (test.evidence.tracePath) {
          md += `- Trace: [\`${test.evidence.tracePath}\`](${test.evidence.tracePath}) *(Use \`npx playwright show-trace ${test.evidence.tracePath}\` to inspect)*\n`;
        }
        md += `\n`;
      }

      if (metadata?.cliCommand) {
        md += `**To reproduce this specific test:**\n`;
        md += `\`\`\`bash\n${metadata.cliCommand} --test=${test.id}\n\`\`\`\n\n`;
      }
    }
  }

  // Footer & Links
  md += `---\n\n`;
  md += `## 📎 Artifacts & Reports\n\n`;
  if (metadata?.playwrightHtmlReportPath) {
    md += `- [🌐 Open Playwright HTML Report](${metadata.playwrightHtmlReportPath})\n`;
  }
  if (metadata?.junitXmlPath) {
    md += `- [📄 JUnit XML Report](${metadata.junitXmlPath})\n`;
  }
  md += `- [💾 Raw JSON Results](./results.json)\n\n`;
  md += `*Report generated automatically by Dynamic Auto Testing Platform.*`;

  return md;
}

function escapePipes(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
