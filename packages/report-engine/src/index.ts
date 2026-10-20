import fs from 'node:fs';
import path from 'node:path';
import { TestRunSummary } from '@auto-test/test-case-schema';
import { generateMarkdownReport } from './markdown.js';
import { generateJUnitXml } from './junit.js';

export * from './markdown.js';
export * from './junit.js';

export interface ReportFilePaths {
  runDir: string;
  resultsJsonPath: string;
  reportMdPath: string;
  junitXmlPath: string;
  relativeResultsJson: string;
  relativeReportMd: string;
  relativeJunitXml: string;
}

/**
 * Persists all report files (results.json, report.md, junit.xml) safely to the specified run directory
 */
export function saveReportFiles(summary: TestRunSummary, runDir: string): ReportFilePaths {
  fs.mkdirSync(runDir, { recursive: true });

  const resultsJsonPath = path.join(runDir, 'results.json');
  const reportMdPath = path.join(runDir, 'report.md');
  const junitXmlPath = path.join(runDir, 'junit.xml');

  // Relative paths for portability
  summary.metadata = {
    ...summary.metadata,
    markdownReportPath: './report.md',
    junitXmlPath: './junit.xml'
  };

  // 1. Write structured results.json
  fs.writeFileSync(resultsJsonPath, JSON.stringify(summary, null, 2), 'utf-8');

  // 2. Write human-readable report.md
  const markdownContent = generateMarkdownReport(summary);
  fs.writeFileSync(reportMdPath, markdownContent, 'utf-8');

  // 3. Write standard JUnit XML
  const junitContent = generateJUnitXml(summary);
  fs.writeFileSync(junitXmlPath, junitContent, 'utf-8');

  return {
    runDir,
    resultsJsonPath,
    reportMdPath,
    junitXmlPath,
    relativeResultsJson: 'results.json',
    relativeReportMd: 'report.md',
    relativeJunitXml: 'junit.xml'
  };
}

/**
 * Loads a past report's results.json safely
 */
export function loadReportSummary(runDir: string): TestRunSummary {
  const jsonPath = path.join(runDir, 'results.json');
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Report results not found at: ${jsonPath}`);
  }
  const content = fs.readFileSync(jsonPath, 'utf-8');
  return JSON.parse(content) as TestRunSummary;
}
