import { z } from 'zod';
import { UITestCaseSchema, UITestCase } from './ui.js';
import { APITestCaseSchema, APITestCase } from './api.js';
import { VisualTestCaseSchema, VisualTestCase } from './visual.js';

export * from './project.js';
export * from './ui.js';
export * from './api.js';
export * from './visual.js';
export * from './result.js';

export const AnyTestCaseSchema = z.discriminatedUnion('type', [
  UITestCaseSchema,
  APITestCaseSchema,
  VisualTestCaseSchema
]);

export type AnyTestCase = z.infer<typeof AnyTestCaseSchema>;

export function parseTestCase(data: unknown): { success: true; data: AnyTestCase } | { success: false; error: string } {
  const result = AnyTestCaseSchema.safeParse(data);
  if (!result.success) {
    const formatted = result.error.errors
      .map(e => `${e.path.join('.') || 'root'}: ${e.message}`)
      .join('; ');
    return { success: false, error: formatted };
  }
  return { success: true, data: result.data };
}
