import { z } from 'zod';

export const ViewportSchema = z.object({
  name: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive()
});

export type ViewportConfig = z.infer<typeof ViewportSchema>;

export const TimeoutsSchema = z.object({
  test: z.number().int().positive().default(30000),
  action: z.number().int().positive().default(10000),
  navigation: z.number().int().positive().default(30000)
}).default({
  test: 30000,
  action: 10000,
  navigation: 30000
});

export type TimeoutsConfig = z.infer<typeof TimeoutsSchema>;

export const FeaturesSchema = z.object({
  uiTesting: z.boolean().default(true),
  apiTesting: z.boolean().default(true),
  visualTesting: z.boolean().default(true)
}).default({
  uiTesting: true,
  apiTesting: true,
  visualTesting: true
});

export type FeaturesConfig = z.infer<typeof FeaturesSchema>;

export const EnvironmentOverrideSchema = z.object({
  baseUrl: z.string().url(),
  apiBaseUrl: z.string().url().optional(),
  variables: z.record(z.string()).optional()
});

export type EnvironmentOverride = z.infer<typeof EnvironmentOverrideSchema>;

export const ProjectConfigSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/, 'Project ID must only contain letters, numbers, underscores and dashes'),
  name: z.string().min(1, 'Project name is required'),
  description: z.string().optional(),
  baseUrl: z.string().url('baseUrl must be a valid URL (e.g. http://localhost:3000)'),
  apiBaseUrl: z.string().url('apiBaseUrl must be a valid URL').optional(),
  environment: z.string().default('local'),
  environments: z.record(EnvironmentOverrideSchema).optional(),
  testDirectories: z.array(z.string()).min(1, 'At least one test directory must be specified').default([
    'test-cases/ui',
    'test-cases/api',
    'test-cases/visual'
  ]),
  features: FeaturesSchema,
  viewports: z.array(ViewportSchema).default([
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 }
  ]),
  timeouts: TimeoutsSchema,
  headers: z.record(z.string()).optional(),
  auth: z.object({
    type: z.enum(['bearer', 'basic', 'custom', 'none']).default('none'),
    tokenEnvVar: z.string().optional(),
    storageStatePath: z.string().optional()
  }).optional(),
  variables: z.record(z.string()).default({}),
  security: z.object({
    allowlistHosts: z.array(z.string()).default(['localhost', '127.0.0.1']),
    preventDestructiveActions: z.boolean().default(true)
  }).default({
    allowlistHosts: ['localhost', '127.0.0.1'],
    preventDestructiveActions: true
  })
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
