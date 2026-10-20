import { TestRunSummary } from '@auto-test/test-case-schema';

const escapeHtml = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]!));

export function generateHTMLReport(summary: TestRunSummary): string {
  const rows = summary.results.map(result => `<tr>
    <td><span class="badge ${result.status.toLowerCase()}">${escapeHtml(result.status)}</span></td>
    <td>${escapeHtml(result.type.toUpperCase())}</td><td><strong>${escapeHtml(result.name)}</strong><br><code>${escapeHtml(result.id)}</code></td>
    <td>${(result.durationMs / 1000).toFixed(2)}s</td><td>${escapeHtml(result.error || '—')}</td>
  </tr>`).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(summary.projectName)} test report</title>
  <style>body{font:15px system-ui,sans-serif;background:#0b0f19;color:#e2e8f0;margin:0;padding:32px}main{max-width:1100px;margin:auto}h1{margin-bottom:4px}.muted{color:#94a3b8}.stats{display:flex;gap:12px;flex-wrap:wrap;margin:24px 0}.stat,table{background:#1e293b;border:1px solid #334155;border-radius:8px}.stat{padding:14px 18px;min-width:110px}.stat strong{display:block;font-size:22px}table{width:100%;border-collapse:collapse;overflow:hidden}th,td{text-align:left;padding:12px;border-bottom:1px solid #334155;vertical-align:top}th{background:#111827;color:#94a3b8}.badge{font-weight:700}.pass{color:#34d399}.fail,.error{color:#f87171}.skipped{color:#94a3b8}code{color:#7dd3fc}</style></head><body><main>
  <h1>${escapeHtml(summary.projectName)} — Test Report</h1><div class="muted">${escapeHtml(summary.runId)} · ${escapeHtml(summary.environment)} · ${escapeHtml(summary.startTime)} · ${(summary.durationMs / 1000).toFixed(2)}s</div>
  <div class="stats"><div class="stat">Overall<strong class="${summary.status.toLowerCase()}">${escapeHtml(summary.status)}</strong></div><div class="stat">Total<strong>${summary.counts.total}</strong></div><div class="stat">Passed<strong class="pass">${summary.counts.pass}</strong></div><div class="stat">Failed<strong class="fail">${summary.counts.fail}</strong></div><div class="stat">Skipped<strong>${summary.counts.skip}</strong></div></div>
  <table><thead><tr><th>Status</th><th>Type</th><th>Test case</th><th>Duration</th><th>Error</th></tr></thead><tbody>${rows}</tbody></table></main></body></html>`;
}
