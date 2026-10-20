import { z } from 'zod';
import { ViewportSchema } from './project.js';
import { UIStepActionSchema } from './ui.js';

export const VisualTestCaseSchema = z.object({
  id: z.string().min(1, 'Test case ID is required'),
  name: z.string().min(1, 'Test case name is required'),
  description: z.string().optional(),
  type: z.literal('visual'),
  module: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  tags: z.array(z.string()).default([]),
  timeout: z.number().int().positive().optional(),
  url: z.string().min(1, 'Target URL is required'),
  snapshotName: z.string().min(1, 'Snapshot identifier is required'),
  viewports: z.array(ViewportSchema).optional(),
  threshold: z.number().min(0).max(1).default(0.1),
  fullPage: z.boolean().default(true),
  mask: z.array(z.string()).optional(),
  steps: z.array(UIStepActionSchema).optional()
});

export type VisualTestCase = z.infer<typeof VisualTestCaseSchema>;
