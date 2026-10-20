import { z } from 'zod';

export const TestStepResultSchema = z.object({
  index: z.number().int().nonnegative(),
  name: z.string(),
  action: z.string().optional(),
  status: z.enum(['PASS', 'FAIL', 'SKIPPED']),
  durationMs: z.number().nonnegative(),
  error: z.string().optional(),
  errorDetails: z.string().optional(),
  evidence: z.object({
    screenshotPath: z.string().optional(),
    diffPath: z.string().optional(),
    baselinePath: z.string().optional(),
    actualPath: z.string().optional()
  }).optional()
});

export type TestStepResult = z.infer<typeof TestStepResultSchema>;

export const TestCaseResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['ui', 'api', 'visual']),
  status: z.enum(['PASS', 'FAIL', 'SKIPPED', 'ERROR']),
  durationMs: z.number().nonnegative(),
  steps: z.array(TestStepResultSchema).default([]),
  error: z.string().optional(),
  stackTrace: z.string().optional(),
  evidence: z.object({
    screenshotPath: z.string().optional(),
    tracePath: z.string().optional(),
    videoPath: z.string().optional(),
    diffPath: z.string().optional(),
    baselinePath: z.string().optional(),
    actualPath: z.string().optional()
  }).optional()
});

export type TestCaseResult = z.infer<typeof TestCaseResultSchema>;

export const TestRunSummarySchema = z.object({
  runId: z.string(),
  projectId: z.string(),
  projectName: z.string(),
  environment: z.string(),
  baseUrl: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  durationMs: z.number().nonnegative(),
  status: z.enum(['PASS', 'FAIL', 'ERROR', 'CANCELLED']),
  counts: z.object({
    total: z.number().int().nonnegative(),
    pass: z.number().int().nonnegative(),
    fail: z.number().int().nonnegative(),
    skip: z.number().int().nonnegative()
  }),
  results: z.array(TestCaseResultSchema),
  metadata: z.object({
    browser: z.string().optional(),
    os: z.string().optional(),
    cliCommand: z.string().optional(),
    playwrightHtmlReportPath: z.string().optional(),
    htmlReportPath: z.string().optional(),
    junitXmlPath: z.string().optional(),
    markdownReportPath: z.string().optional()
  }).optional()
});

export type TestRunSummary = z.infer<typeof TestRunSummarySchema>;
