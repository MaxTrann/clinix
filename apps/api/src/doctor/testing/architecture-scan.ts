import 'reflect-metadata';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Type } from '@nestjs/common';

// Công cụ cho test kiến trúc của doctor (HD-01, HD-08, HD-10): quét mã nguồn và duyệt cây import của Nest.

/** Mọi file mã nguồn (không phải test, không nằm trong thư mục testing/) dưới `dir`. */
export function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory())
      return entry.name === 'testing' ? [] : listSourceFiles(full);
    const isTest = /\.(spec|int-spec|e2e-spec)\.ts$/.test(entry.name);
    return entry.name.endsWith('.ts') && !isTest ? [full] : [];
  });
}

/** Bỏ comment khối và comment dòng để câu chữ trong comment (ví dụ "không dùng NOW()") không bị coi là mã. */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

export const FORBIDDEN_SQL: readonly { name: string; pattern: RegExp }[] = [
  { name: 'UPDATE lich_hen', pattern: /UPDATE\s+`?lich_hen`?(?![\w])/i },
  { name: 'UPDATE khung_gio', pattern: /UPDATE\s+`?khung_gio`?(?![\w])/i },
  { name: 'NOW()', pattern: /\bNOW\s*\(/i },
  { name: 'CURDATE()', pattern: /\bCURDATE\s*\(/i },
];

/** Tên các mẫu cấm xuất hiện trong `source` (đã bỏ comment). */
export function findForbiddenSql(source: string): string[] {
  const code = stripComments(source);
  return FORBIDDEN_SQL.filter(({ pattern }) => pattern.test(code)).map(
    ({ name }) => name,
  );
}

export function readSource(file: string): string {
  return readFileSync(file, 'utf8');
}

interface DynamicLike {
  module: Type;
  imports?: unknown[];
}
type ImportItem =
  Type | DynamicLike | { forwardRef: () => Type } | Promise<DynamicLike>; // vd. ConfigModule.forRoot()

async function resolveImport(
  rawItem: ImportItem,
): Promise<{ module: Type; imports: unknown[] }> {
  const item = await rawItem;
  if (typeof item === 'function')
    return { module: item, imports: moduleImports(item) };
  if ('forwardRef' in item) {
    const module = item.forwardRef();
    return { module, imports: moduleImports(module) };
  }
  return {
    module: item.module,
    imports: [...moduleImports(item.module), ...(item.imports ?? [])],
  };
}

function moduleImports(module: Type): unknown[] {
  return (
    (Reflect.getMetadata('imports', module) as unknown[] | undefined) ?? []
  );
}

export interface ModuleTree {
  /** Số lần mỗi module được tham chiếu trong cây (mỗi `forRoot()` là một lần). */
  references: Map<Type, number>;
  /** Chu trình đầu tiên tìm thấy (danh sách module), hoặc null. */
  cycle: Type[] | null;
}

/** Duyệt cây `imports` của Nest từ module gốc, đếm tham chiếu và dò chu trình. */
export async function walkModuleTree(root: Type): Promise<ModuleTree> {
  const references = new Map<Type, number>();
  const stack: Type[] = [];
  let cycle: Type[] | null = null;
  const visit = async (module: Type, imports: unknown[]) => {
    if (stack.includes(module)) {
      cycle ??= [...stack.slice(stack.indexOf(module)), module];
      return;
    }
    stack.push(module);
    for (const item of imports) {
      const child = await resolveImport(item as ImportItem);
      const seen = references.has(child.module);
      references.set(child.module, (references.get(child.module) ?? 0) + 1);
      if (!seen || stack.includes(child.module))
        await visit(child.module, child.imports);
    }
    stack.pop();
  };
  await visit(root, moduleImports(root));
  return { references, cycle };
}
