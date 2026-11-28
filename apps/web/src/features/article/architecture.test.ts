// article F1, ABN-08: quét tĩnh mã của `features/article/` (PLAN article 5.16, T8, T17, R5). Nếp của `features/chatbot/architecture.test.ts`: `import.meta.glob` với `?raw`,
// bỏ chú thích trước khi quét, đối chứng ÂM và DƯƠNG (bộ quét có tác dụng thật, không báo nhầm).
// Quy tắc import (PLAN 1.2): module chỉ dùng `shared/`, `features/auth` và `features/admin` QUA `index.ts`, và thư viện đã có; không import chéo `features/` khác.
const SOURCES = import.meta.glob(['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const IMPORT_PATTERN = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
const ROOT = 'http://web.invalid/features/article/';
// Thư viện đã có trong `package.json` của web mà module được dùng (không thêm phụ thuộc)
const ALLOWED_PACKAGES = ['react', 'react-dom', 'react-router', 'lucide-react'];

// Bỏ chú thích (câu giải thích có thể nhắc đúng những từ bị cấm)
const strip = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const isTesting = (file: string) => file.startsWith('./testing/');
const PROD_FILES = Object.keys(SOURCES).filter((file) => !isTesting(file));
const prodSources = Object.fromEntries(
  PROD_FILES.map((file) => [file, SOURCES[file]!]),
);

// ----- ABN-08: không dựng HTML thô -----
const FORBIDDEN_HTML = [
  'dangerouslySetInnerHTML',
  'innerHTML',
  'insertAdjacentHTML',
  'document.write',
];

function forbiddenIn(sources: Record<string, string>): string[] {
  const found: string[] = [];
  for (const [file, source] of Object.entries(sources)) {
    const code = strip(source);
    for (const token of FORBIDDEN_HTML) {
      if (code.includes(token)) found.push(`${file} → ${token}`);
    }
  }
  return found;
}

// ----- Ranh giới import -----
interface Target {
  kind: 'package' | 'inside' | 'testing' | 'shared' | 'index' | 'other';
  specifier: string;
}

function classify(file: string, specifier: string): Target {
  if (!specifier.startsWith('.')) {
    const name = specifier.startsWith('@')
      ? specifier.split('/').slice(0, 2).join('/')
      : specifier.split('/')[0]!;
    return {
      kind: ALLOWED_PACKAGES.includes(name) ? 'package' : 'other',
      specifier,
    };
  }
  const resolved = new URL(specifier, new URL(file.slice(2), ROOT));
  const parts = resolved.pathname.split('/').filter(Boolean);
  if (parts[0] === 'shared') return { kind: 'shared', specifier };
  if (parts[0] === 'features' && parts[1] === 'article') {
    return {
      kind: parts[2] === 'testing' ? 'testing' : 'inside',
      specifier,
    };
  }
  // `features/auth` và `features/admin` CHỈ qua `index.ts` (dừng ở tên thư mục, không đi sâu vào file)
  if (
    parts[0] === 'features' &&
    (parts[1] === 'auth' || parts[1] === 'admin') &&
    parts.length === 2
  ) {
    return { kind: 'index', specifier };
  }
  return { kind: 'other', specifier };
}

function importsOf(source: string): string[] {
  return Array.from(strip(source).matchAll(IMPORT_PATTERN), (m) => m[1]!);
}

function violations(
  files: Record<string, string>,
  isViolation: (file: string, target: Target) => boolean,
): string[] {
  const found: string[] = [];
  for (const [file, source] of Object.entries(files)) {
    for (const specifier of importsOf(source)) {
      if (isViolation(file, classify(file, specifier))) {
        found.push(`${file} → ${specifier}`);
      }
    }
  }
  return found;
}

describe('article F1: quét tĩnh', () => {
  it('ABN-08 có đủ file mã để phép quét có nghĩa', () => {
    expect(PROD_FILES.length).toBeGreaterThanOrEqual(10);
    expect(PROD_FILES).toContain('./common/article-content.tsx');
    expect(PROD_FILES).toContain('./api/article-api.ts');
    expect(Object.keys(SOURCES).some(isTesting)).toBe(true);
  });

  it('ABN-08 không có dangerouslySetInnerHTML, innerHTML, insertAdjacentHTML, document.write ở bất kỳ file mã nào (kể cả testing/)', () => {
    expect(forbiddenIn(SOURCES)).toEqual([]);
  });

  it('ABN-08 bộ quét có tác dụng: bắt từng chuỗi cấm, không báo nhầm câu chú thích hay chữ gần giống (đối chứng)', () => {
    const bad = {
      './a.tsx': '<div dangerouslySetInnerHTML={{ __html: text }} />',
      './b.ts': 'node.innerHTML = text;',
      './c.ts': "el.insertAdjacentHTML('beforeend', text);",
      './d.ts': "document.write('<p>x</p>');",
    };
    expect(forbiddenIn(bad)).toEqual([
      './a.tsx → dangerouslySetInnerHTML',
      './b.ts → innerHTML',
      './c.ts → insertAdjacentHTML',
      './d.ts → document.write',
    ]);

    const good = {
      './a.tsx': [
        '// không dùng dangerouslySetInnerHTML hay innerHTML',
        '/* document.write cũng cấm */',
        'const text = "textContent"; // innerText không bị cấm',
        'node.textContent = text;',
      ].join('\n'),
    };
    expect(forbiddenIn(good)).toEqual([]);
  });

  it('ABN-08 mã chạy thật KHÔNG import `testing/` (lớp giả không lọt vào bản chạy thật)', () => {
    expect(
      violations(prodSources, (_file, target) => target.kind === 'testing'),
    ).toEqual([]);
  });

  it('ABN-08 mã chạy thật chỉ import chính module, `shared/`, `features/auth` và `features/admin` qua index, thư viện đã có', () => {
    expect(
      violations(prodSources, (_file, target) => target.kind === 'other'),
    ).toEqual([]);
  });

  it('ABN-08 chỉ `api/article-api.ts` được import lớp client (một lớp API duy nhất) và không file nào gọi `fetch` trực tiếp', () => {
    expect(
      violations(
        prodSources,
        (_file, target) =>
          target.kind === 'shared' &&
          /shared\/api\/client$/.test(target.specifier),
      ),
    ).toEqual(['./api/article-api.ts → ../../../shared/api/client']);

    const callsFetch = Object.entries(SOURCES)
      .filter(([, source]) => /\bfetch\s*\(/.test(strip(source)))
      .map(([file]) => file);
    expect(callsFetch).toEqual([]);
  });

  it('ABN-08 bộ quét import có tác dụng: bắt `testing/`, features khác, đường sâu vào admin và auth, thư viện lạ; không báo nhầm (đối chứng)', () => {
    const bad = {
      './admin/a.tsx': "import { x } from '../testing/fake-article-api';",
      './admin/b.tsx': "import { y } from '../../search';",
      './admin/c.tsx': "import { z } from '../../admin/admin-me';",
      './admin/d.tsx': "import { w } from '../../auth/auth-store';",
      './admin/e.tsx': "import z from 'zustand';",
      './admin/f.tsx': "const m = await import('../../booking');",
    };
    expect(violations(bad, (_f, t) => t.kind === 'testing')).toHaveLength(1);
    expect(violations(bad, (_f, t) => t.kind === 'other')).toHaveLength(5);

    const good = {
      './admin/a.tsx': [
        "import { Link } from 'react-router';",
        "import { Pencil } from 'lucide-react';",
        "import { AdminTable } from '../../admin';",
        "import { ROLE_HOME_PATHS } from '../../auth';",
        "import { request } from '../../../shared/api/client';",
        "import { x } from './local';",
        "import { y } from '../api/article-types';",
        "// import { q } from '../../search';",
      ].join('\n'),
    };
    expect(violations(good, (_f, t) => t.kind === 'other')).toEqual([]);
    expect(violations(good, (_f, t) => t.kind === 'testing')).toEqual([]);
  });
});
