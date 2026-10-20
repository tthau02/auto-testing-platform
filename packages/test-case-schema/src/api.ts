import { z } from 'zod';

export const ApiAssertionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('status'),
    expected: z.union([z.number().int(), z.array(z.number().int())]),
    description: z.string().optional()
  }),
  z.object({
    type: z.literal('responseTime'),
    maxMs: z.number().positive(),
    description: z.string().optional()
  }),
  z.object({
    type: z.literal('header'),
    name: z.string().min(1),
    expected: z.string(),
    contains: z.boolean().default(false),
    description: z.string().optional()
  }),
  z.object({
    type: z.literal('bodyContains'),
    text: z.string(),
    description: z.string().optional()
  }),
  z.object({
    type: z.literal('fieldEquals'),
    path: z.string().default(''),
    expected: z.any(),
    description: z.string().optional()
  }),
  z.object({
    type: z.literal('fieldContains'),
    path: z.string().default(''),
    expected: z.string(),
    description: z.string().optional()
  }),
  z.object({
    type: z.literal('fieldExists'),
    path: z.string().default(''),
    description: z.string().optional()
  }),
  z.object({
    type: z.literal('fieldType'),
    path: z.string().default(''),
    expected: z.enum(['string', 'number', 'boolean', 'object', 'array']),
    description: z.string().optional()
  })
]);

export type ApiAssertion = z.infer<typeof ApiAssertionSchema>;

export const VariableExtractionSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1)
});

export type VariableExtraction = z.infer<typeof VariableExtractionSchema>;

export const APIStepSchema = z.object({
  name: z.string().min(1),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']).default('GET'),
  endpoint: z.string().min(1, 'API endpoint is required (e.g. /api/users)'),
  headers: z.record(z.string()).optional(),
  params: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  body: z.any().optional(),
  extractVariables: z.array(VariableExtractionSchema).optional(),
  assertions: z.array(ApiAssertionSchema).default([])
});

export type APIStep = z.infer<typeof APIStepSchema>;

export const APITestCaseSchema = z.object({
  id: z.string().min(1, 'Test case ID is required'),
  name: z.string().min(1, 'Test case name is required'),
  description: z.string().optional(),
  type: z.literal('api'),
  module: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  tags: z.array(z.string()).default([]),
  timeout: z.number().int().positive().optional(),
  steps: z.array(APIStepSchema).min(1, 'API test case must contain at least one step')
});

export type APITestCase = z.infer<typeof APITestCaseSchema>;
