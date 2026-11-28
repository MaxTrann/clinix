// article F1, ABN-08: quét tĩnh mã của `features/article/` (PLAN article 5.16, T8, T17, R5). Nếp của `features/chatbot/architecture.test.ts`: `import.meta.glob` với `?raw`,
// bỏ chú thích trước khi quét, đối chứng ÂM và DƯƠNG (bộ quét có tác dụng thật, không báo nhầm).
// Quy tắc import (PLAN 1.2): module chỉ dùng `shared/`, `features/auth` và `features/admin` QUA `index.ts`, và thư viện đã có; không import chéo `features/` khác.
const SOURCES = import.meta.glob(['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
// article F2, ABG-13: MỌI file (kể cả test) để chứng minh bộ quét ở trên loại đúng file `*.test.*`, không bỏ sót file mã
const ALL_FILES = import.meta.glob('./**/*.{ts,tsx}', {
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

// ----- article F2, ABG-13: `public/` và `admin/` không nối vào nhau -----
// `public/` chỉ dùng `shared/`, `features/auth` (qua index), `common/`, `api/` và chính nó; KHÔNG `features/admin` (kể cả qua index) và KHÔNG `../admin/`.
// `admin/` dùng `features/admin` chỉ qua index (ca ABN-08 ở trên) và KHÔNG `../public/`. Không import `features/search` hay module khác: đã là `other` ở các ca trên.
function resolvedParts(file: string, specifier: string): string[] {
  if (!specifier.startsWith('.')) return [];
  return new URL(specifier, new URL(file.slice(2), ROOT)).pathname
    .split('/')
    .filter(Boolean);
}

const folderOf = (sources: Record<string, string>, folder: string) =>
  Object.fromEntries(
    Object.entries(sources).filter(([file]) => file.startsWith(`./${folder}/`)),
  );

// Tới `features/admin` (index hay sâu) hoặc tới thư mục `admin/` của chính module
const reachesAdmin = (file: string, target: Target) => {
  const parts = resolvedParts(file, target.specifier);
  return (
    parts[0] === 'features' &&
    (parts[1] === 'admin' || (parts[1] === 'article' && parts[2] === 'admin'))
  );
};
const reachesPublic = (file: string, target: Target) => {
  const parts = resolvedParts(file, target.specifier);
  return (
    parts[0] === 'features' && parts[1] === 'article' && parts[2] === 'public'
  );
};

const isTestFile = (file: string) => /\.test\.tsx?$/u.test(file);

describe('article F2: ranh giới `public/` và `admin/` (ABG-13)', () => {
  it('ABG-13 có đủ file mã ở hai thư mục để phép quét có nghĩa', () => {
    expect(Object.keys(folderOf(prodSources, 'public')).sort()).toEqual(
      expect.arrayContaining([
        './public/article-card.tsx',
        './public/article-detail-page.tsx',
        './public/article-list-page.tsx',
        './public/home-handbook-section.tsx',
        './public/use-article-meta.ts',
      ]),
    );
    expect(Object.keys(folderOf(prodSources, 'admin')).length).toBeGreaterThan(
      10,
    );
  });

  it('ABG-13 `public/` KHÔNG import `features/admin` (kể cả qua index) và KHÔNG import `../admin/` của module', () => {
    expect(violations(folderOf(prodSources, 'public'), reachesAdmin)).toEqual(
      [],
    );
  });

  it('ABG-13 `admin/` KHÔNG import `../public/`', () => {
    expect(violations(folderOf(prodSources, 'admin'), reachesPublic)).toEqual(
      [],
    );
  });

  it('ABG-13 `public/` chỉ import thư viện đã có, `shared/`, `features/auth` qua index, `common/`, `api/` và chính nó (không `testing/`, không module khác)', () => {
    const publicSources = folderOf(prodSources, 'public');
    expect(
      violations(publicSources, (_file, target) => target.kind === 'other'),
    ).toEqual([]);
    expect(
      violations(publicSources, (_file, target) => target.kind === 'testing'),
    ).toEqual([]);
    // `features/auth` và `features/admin` là hai khoá `index`; ở `public/` chỉ còn được là `auth` (đã loại admin ở ca trên)
    const indexImports = violations(
      publicSources,
      (_file, target) => target.kind === 'index',
    );
    for (const entry of indexImports) expect(entry).toMatch(/\/auth'?$/u);
  });

  it('ABG-13 bộ quét có tác dụng: BẮT import sang admin ở `public/` và sang `public/` ở `admin/`, không báo nhầm mẫu lành (đối chứng ÂM và DƯƠNG)', () => {
    const bad = {
      './public/a.tsx': "import x from '../admin/article-styles';",
      './public/b.tsx': "import { AdminTable } from '../../admin';",
      './public/c.tsx': "import y from '../../admin/admin-me';",
      './public/d.tsx': "const m = await import('../admin/article-routes');",
      './admin/e.tsx': "import z from '../public/article-card';",
    };
    expect(violations(folderOf(bad, 'public'), reachesAdmin)).toHaveLength(4);
    expect(violations(folderOf(bad, 'admin'), reachesPublic)).toHaveLength(1);

    const good = {
      './public/a.tsx': [
        "import { ROLE_HOME_PATHS } from '../../auth';",
        "import { ApiError } from '../../../shared/api/errors';",
        "import { slugify } from '../common/slug';",
        "import { ArticleCard } from './article-card';",
        "// import w from '../admin/hashtag-input';",
      ].join('\n'),
      './admin/b.tsx': [
        "import { AdminTable } from '../../admin';",
        "import { slugify } from '../common/slug';",
        "// import w from '../public/article-card';",
      ].join('\n'),
    };
    expect(violations(folderOf(good, 'public'), reachesAdmin)).toEqual([]);
    expect(violations(folderOf(good, 'admin'), reachesPublic)).toEqual([]);
  });

  it('ABG-13 bộ quét loại ĐÚNG file `*.test.*` (không bỏ sót file mã, không quét nhầm file test): test của `public/` vẫn được import `../testing/`', () => {
    const everything = Object.keys(ALL_FILES);
    const tests = everything.filter(isTestFile);
    const code = everything.filter((file) => !isTestFile(file));

    // Tập file được quét = đúng tập file không phải test
    expect(Object.keys(SOURCES).sort()).toEqual([...code].sort());
    expect(PROD_FILES.some(isTestFile)).toBe(false);
    expect(tests.length).toBeGreaterThan(20);

    // Tiền đề: có test trong `public/` import `../testing/` (hợp lệ), và nếu bị quét nhầm thì bộ quét `testing/` sẽ báo (bộ quét có tác dụng)
    const publicTestsUsingTesting = tests.filter(
      (file) =>
        file.startsWith('./public/') &&
        /from '\.\.\/testing\//u.test(ALL_FILES[file]!),
    );
    expect(publicTestsUsingTesting.length).toBeGreaterThan(0);
    const wronglyScanned = Object.fromEntries(
      publicTestsUsingTesting.map((file) => [file, ALL_FILES[file]!]),
    );
    expect(
      violations(wronglyScanned, (_file, target) => target.kind === 'testing')
        .length,
    ).toBeGreaterThan(0);
    // Quét đúng (chỉ file mã) thì không có vi phạm
    expect(
      violations(prodSources, (_file, target) => target.kind === 'testing'),
    ).toEqual([]);
  });

  it('ABG-13 đối chứng của bộ nhận diện file test: `x.test.ts`, `x.test.tsx` là test; `x.ts`, `latest.tsx`, `test.ts`, `x.testing.ts` không phải', () => {
    for (const name of ['./a/x.test.ts', './a/x.test.tsx']) {
      expect(isTestFile(name)).toBe(true);
    }
    for (const name of [
      './a/x.ts',
      './a/latest.tsx',
      './a/test.ts',
      './a/x.testing.ts',
    ]) {
      expect(isTestFile(name)).toBe(false);
    }
  });
});
