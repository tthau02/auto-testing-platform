import fs from 'node:fs';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { UIStep, UIStepActionSchema } from '@auto-test/test-case-schema';

export interface WorkbookTestCase {
  id: string;
  name: string;
  description: string;
  type: 'ui';
  priority: 'medium';
  tags: string[];
  startUrl: string;
  steps: UIStep[];
  automationReady: boolean;
  automationError?: string;
  manualSteps: string[];
  expectedResults: string[];
}

type WorkbookRow = Map<number, string>;

function zipEntries(file: Buffer): Map<string, Buffer> {
  let end = -1;
  for (let i = file.length - 22; i >= Math.max(0, file.length - 65557); i--) {
    if (file.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error('Invalid XLSX: ZIP directory was not found.');
  const entryCount = file.readUInt16LE(end + 10);
  let offset = file.readUInt32LE(end + 16);
  const entries = new Map<string, Buffer>();
  for (let i = 0; i < entryCount; i++) {
    if (file.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid XLSX: malformed ZIP directory.');
    const method = file.readUInt16LE(offset + 10);
    const compressedSize = file.readUInt32LE(offset + 20);
    const nameLength = file.readUInt16LE(offset + 28);
    const extraLength = file.readUInt16LE(offset + 30);
    const commentLength = file.readUInt16LE(offset + 32);
    const localOffset = file.readUInt32LE(offset + 42);
    const name = file.toString('utf8', offset + 46, offset + 46 + nameLength).replace(/\\/g, '/');
    const localNameLength = file.readUInt16LE(localOffset + 26);
    const localExtraLength = file.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = file.subarray(dataStart, dataStart + compressedSize);
    if (method === 0) entries.set(name, Buffer.from(compressed));
    else if (method === 8) entries.set(name, inflateRawSync(compressed));
    else throw new Error(`Unsupported XLSX compression method ${method}.`);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function decodeXml(value: string): string {
  return value.replace(/&#x([\da-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function xmlText(value: string): string {
  return [...value.matchAll(/<(?:[\w.-]+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?t>/g)]
    .map(match => decodeXml(match[1].replace(/<[^>]+>/g, ''))).join('');
}

function columnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/)?.[0] || '';
  let result = 0;
  for (const letter of letters) result = result * 26 + letter.charCodeAt(0) - 64;
  return result - 1;
}

function parseSheet(xml: string, sharedStrings: string[]): Map<number, WorkbookRow> {
  const rows = new Map<number, WorkbookRow>();
  for (const rowMatch of xml.matchAll(/<(?:[\w.-]+:)?row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?row>/g)) {
    const rowNumber = Number(rowMatch[1]);
    const cells: WorkbookRow = new Map();
    for (const cellMatch of rowMatch[2].matchAll(/<(?:[\w.-]+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?c>)/g)) {
      const ref = cellMatch[1].match(/\br="([A-Z]+\d+)"/)?.[1];
      if (!ref) continue;
      const type = cellMatch[1].match(/\bt="([^"]+)"/)?.[1];
      const body = cellMatch[2] || '';
      const raw = body.match(/<(?:[\w.-]+:)?v>([\s\S]*?)<\/(?:[\w.-]+:)?v>/)?.[1] ?? '';
      let value = '';
      if (type === 's') value = sharedStrings[Number(raw)] || '';
      else if (type === 'inlineStr') value = xmlText(body);
      else value = decodeXml(raw);
      if (value) cells.set(columnIndex(ref), value);
    }
    rows.set(rowNumber, cells);
  }
  return rows;
}

function getCell(row: WorkbookRow | undefined, column: number): string {
  return row?.get(column)?.trim() || '';
}

function targetFor(locatorType: string, locatorValue: string, accessibleName: string): Record<string, string> | undefined {
  const keys: Record<string, string> = {
    role: 'role', label: 'label', placeholder: 'placeholder', testid: 'testId',
    text: 'text', selector: 'selector'
  };
  const key = keys[locatorType.toLowerCase()];
  if (!key || !locatorValue) return undefined;
  return key === 'role'
    ? { [key]: locatorValue, ...(accessibleName ? { name: accessibleName } : {}) }
    : { [key]: locatorValue };
}

function loadAutomation(rows: Map<number, WorkbookRow>): Map<string, { startUrl: string; steps: Array<{ order: number; value: UIStep }>; errors: string[] }> {
  const automation = new Map<string, { startUrl: string; steps: Array<{ order: number; value: UIStep }>; errors: string[] }>();
  for (const [line, row] of rows) {
    if (line < 5) continue;
    const id = getCell(row, 0);
    if (!id) continue;
    const current = automation.get(id) || { startUrl: '', steps: [], errors: [] };
    current.startUrl ||= getCell(row, 1);
    const order = Number(getCell(row, 2));
    const action = getCell(row, 3);
    if (!action && !getCell(row, 4) && !getCell(row, 5) && !getCell(row, 6) && !getCell(row, 7) && !getCell(row, 8)) {
      automation.set(id, current);
      continue;
    }
    const locator = targetFor(getCell(row, 4), getCell(row, 5), getCell(row, 8));
    const value = getCell(row, 6);
    const description = getCell(row, 7) || `Bước ${order || current.steps.length + 1}: ${action}`;
    let step: Record<string, unknown> | undefined;
    switch (action) {
      case 'goto': step = { action, url: value, description }; break;
      case 'click': case 'check': case 'uncheck': case 'hover': case 'assertEnabled':
        step = locator ? { action, target: locator, description } : undefined; break;
      case 'fill': case 'selectOption':
        step = locator ? { action, target: locator, value, description } : undefined; break;
      case 'press':
        step = locator ? { action, target: locator, key: value, description } : undefined; break;
      case 'waitForVisible': case 'assertVisible': case 'assertNotVisible':
        step = locator ? { action, target: locator, description } : undefined; break;
      case 'waitForTimeout':
        step = Number(value) > 0 ? { action, duration: Number(value), description } : undefined; break;
      case 'assertText':
        step = locator ? { action, target: locator, expected: value, description } : undefined; break;
      case 'assertUrl': case 'assertTitle':
        step = value ? { action, expected: value, description } : undefined; break;
      case 'assertValue':
        step = locator ? { action, target: locator, expected: value, description } : undefined; break;
      case 'screenshot': step = { action, name: value || undefined, description }; break;
      case '': break;
      default: current.errors.push(`Automation!row ${line}: Action "${action}" chưa được hỗ trợ.`);
    }
    if (action && !step) current.errors.push(`Automation!row ${line}: thiếu giá trị hoặc locator cho action "${action}".`);
    if (step) {
      const parsed = UIStepActionSchema.safeParse(step);
      if (parsed.success) current.steps.push({ order: Number.isFinite(order) && order > 0 ? order : current.steps.length + 1, value: parsed.data });
      else current.errors.push(`Automation!row ${line}: ${parsed.error.errors.map(issue => issue.message).join(', ')}`);
    }
    automation.set(id, current);
  }
  return automation;
}

export function loadWorkbookTestCases(projectDir: string, workbookPath: string, workspaceRoot: string): WorkbookTestCase[] {
  const resolved = path.resolve(projectDir, workbookPath);
  const relativePath = path.relative(path.resolve(workspaceRoot), resolved);
  if (relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    throw new Error(`Security Violation: Test workbook path "${workbookPath}" escapes the workspace root.`);
  }
  const safePath = path.resolve(workspaceRoot, relativePath);
  if (!fs.existsSync(safePath)) throw new Error(`Test workbook not found: ${safePath}`);
  const file = fs.readFileSync(safePath);
  if (file.length > 20 * 1024 * 1024) throw new Error('Test workbook exceeds the 20 MB size limit.');
  const entries = zipEntries(file);
  const workbookXml = entries.get('xl/workbook.xml')?.toString('utf8');
  const relsXml = entries.get('xl/_rels/workbook.xml.rels')?.toString('utf8');
  if (!workbookXml || !relsXml) throw new Error('Invalid XLSX: workbook metadata is missing.');
  const sharedXml = entries.get('xl/sharedStrings.xml')?.toString('utf8') || '';
  const sharedStrings = [...sharedXml.matchAll(/<(?:[\w.-]+:)?si\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?si>/g)].map(match => xmlText(match[1]));
  const relTargets = new Map<string, string>();
  for (const rel of relsXml.matchAll(/<(?:[\w.-]+:)?Relationship\b([^>]+?)\/>/g)) {
    const id = rel[1].match(/\bId="([^"]+)"/)?.[1];
    const target = rel[1].match(/\bTarget="([^"]+)"/)?.[1];
    if (id && target) relTargets.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target}`.replace('xl/xl/', 'xl/'));
  }
  const sheets = new Map<string, Map<number, WorkbookRow>>();
  for (const sheet of workbookXml.matchAll(/<(?:[\w.-]+:)?sheet\b([^>]+?)\/>/g)) {
    const attrs = sheet[1];
    const name = attrs.match(/\bname="([^"]+)"/)?.[1];
    const relId = attrs.match(/\br:id="([^"]+)"/)?.[1];
    const target = relId ? relTargets.get(relId) : undefined;
    if (name && target) {
      const xml = entries.get(target)?.toString('utf8');
      if (xml) sheets.set(decodeXml(name), parseSheet(xml, sharedStrings));
    }
  }
  const source = sheets.get('Sheet1') || sheets.values().next().value;
  if (!source) throw new Error('Test workbook does not contain a readable worksheet.');
  const automation = loadAutomation(sheets.get('Automation') || new Map());
  const cases = new Map<string, { name: string; manualSteps: string[]; expectedResults: string[] }>();
  let currentId = '';
  for (const [line, row] of source) {
    if (line < 3) continue;
    const id = getCell(row, 0);
    if (/^QL_TS\s+CC_\d+$/i.test(id)) {
      currentId = id;
      cases.set(id, { name: getCell(row, 1) || id, manualSteps: [], expectedResults: [] });
    }
    if (!currentId) continue;
    const record = cases.get(currentId)!;
    const manualStep = getCell(row, 2);
    const expected = getCell(row, 3);
    if (manualStep) record.manualSteps.push(manualStep);
    if (expected) record.expectedResults.push(expected);
  }
  return [...cases].map(([id, record]) => {
    const automationData = automation.get(id) || { startUrl: '', steps: [], errors: [] };
    const errors = [...automationData.errors];
    if (!automationData.startUrl) errors.push('Cần điền URL bắt đầu.');
    if (!automationData.steps.length) errors.push('Cần khai báo ít nhất một bước tự động hóa.');
    const steps = automationData.steps.sort((a, b) => a.order - b.order).map(item => item.value);
    return {
      id, name: record.name, description: record.expectedResults.join('\n'), type: 'ui' as const,
      priority: 'medium' as const, tags: ['excel', 'browser'], startUrl: automationData.startUrl || '/',
      steps, automationReady: errors.length === 0,
      automationError: errors.length ? errors.join(' ') : undefined,
      manualSteps: record.manualSteps, expectedResults: record.expectedResults
    };
  });
}
