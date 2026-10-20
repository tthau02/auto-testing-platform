import { z } from 'zod';

export const TargetLocatorSchema = z.object({
  role: z.enum([
    'button',
    'link',
    'textbox',
    'checkbox',
    'radio',
    'combobox',
    'heading',
    'alert',
    'dialog',
    'tab',
    'menuitem',
    'option'
  ]).optional(),
  name: z.string().optional(),
  label: z.string().optional(),
  placeholder: z.string().optional(),
  testId: z.string().optional(),
  text: z.string().optional(),
  selector: z.string().optional()
}).refine(
  data => Boolean(data.role || data.label || data.placeholder || data.testId || data.text || data.selector),
  { message: 'Target locator must specify at least one of role, label, placeholder, testId, text, or selector' }
);

export type TargetLocator = z.infer<typeof TargetLocatorSchema>;

export const UIStepActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('goto'),
    url: z.string().min(1, 'Target URL is required'),
    description: z.string().optional()
  }),
  z.object({
    action: z.literal('click'),
    target: TargetLocatorSchema,
    description: z.string().optional()
  }),
  z.object({
    action: z.literal('fill'),
    target: TargetLocatorSchema,
    value: z.string(),
    description: z.string().optional()
  }),
  z.object({
    action: z.literal('selectOption'),
    target: TargetLocatorSchema,
    value: z.string(),
    description: z.string().optional()
  }),
  z.object({
    action: z.literal('check'),
    target: TargetLocatorSchema,
    description: z.string().optional()
  }),
  z.object({
    action: z.literal('uncheck'),
    target: TargetLocatorSchema,
    description: z.string().optional()
  }),
  z.object({
    action: z.literal('press'),
    target: TargetLocatorSchema,
    key: z.string().min(1, 'Key is required (e.g. Enter, Tab, Escape)'),
    description: z.string().optional()
  }),
  z.object({
    action: z.literal('hover'),
    target: TargetLocatorSchema,
    description: z.string().optional()
  }),
  z.object({
    action: z.literal('waitForVisible'),
    target: TargetLocatorSchema,
    timeout: z.number().int().positive().optional(),
    description: z.string().optional()
  }),
  z.object({
    action: z.literal('waitForTimeout'),
    duration: z.number().int().positive(),
    description: z.string().optional()
  }),
  z.object({
    action: z.literal('assertVisible'),
    target: TargetLocatorSchema,
    timeout: z.number().int().positive().optional(),
    description: z.string().optional()
  }),
  z.object({
    action: z.literal('assertNotVisible'),
    target: TargetLocatorSchema,
    timeout: z.number().int().positive().optional(),
    description: z.string().optional()
  }),
  z.object({
    action: z.literal('assertText'),
    target: TargetLocatorSchema,
    expected: z.string(),
    contains: z.boolean().default(true),
    description: z.string().optional()
  }),
  z.object({
    action: z.literal('assertUrl'),
    expected: z.string().min(1),
    regex: z.boolean().default(false),
    description: z.string().optional()
  }),
  z.object({
    action: z.literal('assertTitle'),
    expected: z.string(),
    description: z.string().optional()
  }),
  z.object({
    action: z.literal('assertValue'),
    target: TargetLocatorSchema,
    expected: z.string(),
    description: z.string().optional()
  }),
  z.object({
    action: z.literal('assertEnabled'),
    target: TargetLocatorSchema,
    description: z.string().optional()
  }),
  z.object({
    action: z.literal('screenshot'),
    name: z.string().optional(),
    fullPage: z.boolean().default(false),
    description: z.string().optional()
  })
]);

export type UIStep = z.infer<typeof UIStepActionSchema>;

export const UITestCaseSchema = z.object({
  id: z.string().min(1, 'Test case ID is required'),
  name: z.string().min(1, 'Test case name is required'),
  description: z.string().optional(),
  type: z.literal('ui'),
  module: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  tags: z.array(z.string()).default([]),
  timeout: z.number().int().positive().optional(),
  startUrl: z.string().min(1, 'startUrl is required'),
  viewport: z.union([
    z.string(),
    z.object({
      width: z.number().int().positive(),
      height: z.number().int().positive()
    })
  ]).optional(),
  preconditions: z.array(z.string()).optional(),
  steps: z.array(UIStepActionSchema).min(1, 'Test case must contain at least one step')
});

export type UITestCase = z.infer<typeof UITestCaseSchema>;
