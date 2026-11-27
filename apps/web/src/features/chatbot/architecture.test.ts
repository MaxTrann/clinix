import { describe, expect, it } from 'vitest';

// Chatbot F1. WTL-08 (mã giả không lọt vào bản chạy thật; `fetch` chỉ qua lớp client) và WTL-10 (phần tĩnh: không kho trình duyệt, URL, tiêu đề,
// console, HTML thô). Nếp của `features/booking/architecture.test.ts`: `import.meta.glob` với `?raw`, regex import, đối chứng ÂM và DƯƠNG.
// Quy tắc import (PLAN chatbot 1.2): chatbot chỉ dùng `shared/`, `features/auth` qua `index.ts` và thư viện đã có; không import chéo `features/` khác.
const SOURCES = import.meta.glob(['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const IMPORT_PATTERN = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
const ROOT = 'http://web.invalid/features/chatbot/';
// Thư viện đã có trong `package.json` của web mà chatbot được dùng (không thêm phụ thuộc)
const ALLOWED_PACKAGES = ['react', 'react-dom', 'react-router', 'lucide-react'];

// Bỏ chú thích (câu giải thích có thể nhắc đúng những từ bị cấm), nếp của `focus-hygiene.test.ts`
const strip = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

// Mã chạy thật = mọi file ngoài `testing/`
const isTesting = (file: string) => file.startsWith('./testing/');
const PROD_FILES = Object.keys(SOURCES).filter((file) => !isTesting(file));

interface Target {
  kind: 'package' | 'inside' | 'testing' | 'shared' | 'auth-index' | 'other';
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
  if (parts[0] === 'features' && parts[1] === 'chatbot') {
    return {
      kind: parts[2] === 'testing' ? 'testing' : 'inside',
      specifier,
    };
  }
  // `features/auth` CHỈ qua `index.ts` (dừng ở tên thư mục, không đi sâu vào file)
  if (parts[0] === 'features' && parts[1] === 'auth' && parts.length === 2) {
    return { kind: 'auth-index', specifier };
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

const prodSources = Object.fromEntries(
  PROD_FILES.map((file) => [file, SOURCES[file]!]),
);

describe('chatbot F1: ranh giới import', () => {
  it('WTL-08 có đủ file mã để phép quét có nghĩa', () => {
    expect(PROD_FILES.length).toBeGreaterThan(15);
    expect(PROD_FILES).toContain('./widget/chatbot-widget.tsx');
    expect(Object.keys(SOURCES).some(isTesting)).toBe(true);
  });

  it('WTL-08 mã chạy thật KHÔNG import `testing/` (lớp giả không lọt vào bản chạy thật)', () => {
    expect(
      violations(prodSources, (_file, target) => target.kind === 'testing'),
    ).toEqual([]);
  });

  it('WTL-08 mã chạy thật chỉ import chính chatbot, `shared/`, `features/auth` qua index và thư viện đã có', () => {
    expect(
      violations(prodSources, (_file, target) => target.kind === 'other'),
    ).toEqual([]);
  });

  it('WTL-08 chỉ `api/chatbot-api.ts` được import lớp client (một lớp API duy nhất, không rải lời gọi mạng)', () => {
    const clientImports = violations(
      prodSources,
      (_file, target) =>
        target.kind === 'shared' &&
        /shared\/api\/client$/.test(target.specifier),
    );
    expect(clientImports).toEqual([
      './api/chatbot-api.ts → ../../../shared/api/client',
    ]);
  });

  it('WTL-08 `index.ts` chỉ xuất `ChatbotWidget` và hai kiểu; không xuất `testing/`', () => {
    const names = Array.from(
      strip(SOURCES['./index.ts']!).matchAll(
        /export\s+(?:type\s+)?\{([^}]+)\}/g,
      ),
      (m) => m[1]!.split(',').map((name) => name.trim()),
    ).flat();
    expect(names.sort()).toEqual([
      'ChatbotApi',
      'ChatbotWidget',
      'ChatbotWidgetProps',
    ]);
    expect(strip(SOURCES['./index.ts']!)).not.toContain('testing');
  });

  it('WTL-08 bộ quét có tác dụng: bắt import `testing/`, features khác, thư viện lạ; không báo nhầm (đối chứng)', () => {
    const bad = {
      './widget/a.tsx': "import { x } from '../testing/fake-chatbot-api';",
      './widget/b.tsx': "import { y } from '../../search';",
      './widget/c.tsx': "import { z } from '../../auth/auth-store';",
      './widget/d.tsx': "import z from 'zustand';",
      './widget/e.tsx': "const m = await import('../../booking');",
    };
    expect(violations(bad, (_f, t) => t.kind === 'testing')).toHaveLength(1);
    expect(violations(bad, (_f, t) => t.kind === 'other')).toHaveLength(4);

    const good = {
      './widget/a.tsx': [
        "import { Link } from 'react-router';",
        "import { Bot } from 'lucide-react';",
        "import { useAuth } from '../../auth';",
        "import { request } from '../../../shared/api/client';",
        "import { x } from './local';",
        "import { y } from '../api/chatbot-types';",
        "// import { q } from '../../search';",
      ].join('\n'),
    };
    expect(violations(good, (_f, t) => t.kind === 'other')).toEqual([]);
    expect(violations(good, (_f, t) => t.kind === 'testing')).toEqual([]);
  });
});

// Chuỗi bị cấm ở mã chạy thật (PLAN 5.9: lịch sử chỉ trong bộ nhớ; 5.12: không tự gọi mạng; không HTML thô)
const FORBIDDEN: Array<[string, RegExp]> = [
  ['localStorage', /\blocalStorage\b/],
  ['sessionStorage', /\bsessionStorage\b/],
  ['indexedDB', /\bindexedDB\b/],
  ['document.cookie', /\bdocument\s*\.\s*cookie\b/],
  ['document.title', /\bdocument\s*\.\s*title\b/],
  ['console.*', /\bconsole\s*\./],
  ['history.pushState/replaceState', /\b(?:pushState|replaceState)\b/],
  [
    'window.location (ghi URL)',
    /\blocation\s*\.\s*(?:assign|replace)\b|\blocation\s*\.\s*(?:href|search|hash)\s*=(?!=)/,
  ],
  ['dangerouslySetInnerHTML', /\bdangerouslySetInnerHTML\b/],
  ['innerHTML', /\b(?:inner|outer)HTML\b/],
  ['fetch(', /\bfetch\s*\(/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['sendBeacon', /\bsendBeacon\b/],
  ['WebSocket', /\bWebSocket\b/],
];

function forbiddenIn(files: Record<string, string>): string[] {
  const found: string[] = [];
  for (const [file, source] of Object.entries(files)) {
    const code = strip(source);
    for (const [name, pattern] of FORBIDDEN) {
      if (pattern.test(code)) found.push(`${file}: ${name}`);
    }
  }
  return found;
}

describe('chatbot F1: không kho trình duyệt, URL, tiêu đề, console, HTML thô', () => {
  it('WTL-10 không file mã chạy thật nào chứa chuỗi bị cấm', () => {
    expect(forbiddenIn(prodSources)).toEqual([]);
  });

  it('WTL-10 bộ quét có tác dụng: bắt từng chuỗi cấm; chú thích và từ gần giống không bị báo nhầm (đối chứng)', () => {
    const bad = Object.fromEntries(
      [
        'window.localStorage.setItem("k", v);',
        'sessionStorage.setItem("k", v);',
        'indexedDB.open("db");',
        'document.cookie = "a=1";',
        'document.title = q;',
        'console.log(q);',
        'history.pushState({}, "", url);',
        'window.location.href = url;',
        '<div dangerouslySetInnerHTML={{ __html: x }} />',
        'el.innerHTML = x;',
        'await fetch("/api/x");',
        'new XMLHttpRequest();',
        'navigator.sendBeacon(u, d);',
        'new WebSocket(u);',
      ].map((line, index) => [`./bad-${index}.ts`, line]),
    );
    expect(forbiddenIn(bad)).toHaveLength(Object.keys(bad).length);

    const good = {
      './good.ts': [
        '// không dùng localStorage, console.log, fetch(...) hay dangerouslySetInnerHTML',
        '/* sessionStorage, document.title */',
        'const refetch = prefetchList(); // fetchers',
        "const text = 'https://example.test';",
      ].join('\n'),
    };
    expect(forbiddenIn(good)).toEqual([]);
  });
});
