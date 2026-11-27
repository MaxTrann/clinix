import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listSourceFiles,
  readSource,
  stripComments,
} from '../../doctor/testing/architecture-scan.js';

// chatbot B1 — khoá TÍNH ĐỘC LẬP của phần an toàn (PLAN chatbot 5.4, 5.8, 5.9, 5.10, 6.2): `safety/` và `limit/` chỉ gồm hàm thuần và bộ nhớ,
// không gọi AI, không DB, không mạng, không đọc biến môi trường, không log (IP và câu hỏi không được ra log), không phụ thuộc `providers/`
// (chatbot P1) hay `config/`, và luật khẩn cấp không biết bộ giới hạn (khẩn cấp miễn giới hạn tốc độ: thứ tự gọi là của chatbot B3, GHT-06).
// Mỗi luật có đối chứng ÂM trên nguồn giả trước khi quét mã thật.
const CHATBOT_DIR = fileURLToPath(new URL('..', import.meta.url));
const SCANNED_DIRS = ['safety', 'limit'] as const;

const FORBIDDEN: readonly { name: string; pattern: RegExp }[] = [
  {
    name: 'import từ providers/ hay config/ (phụ thuộc chatbot P1)',
    pattern: /from\s+['"][^'"]*\/(?:providers|config)\//,
  },
  { name: 'import @nestjs/*', pattern: /from\s+['"]@nestjs\// },
  {
    name: 'import DB (typeorm, mysql2)',
    pattern: /from\s+['"](?:typeorm|mysql2)/,
  },
  {
    name: 'import mạng, tiến trình con hay tệp (node:http, https, net, dns, child_process, fs)',
    pattern:
      /from\s+['"](?:node:)?(?:https?|net|dns|tls|dgram|child_process|fs)['"]/,
  },
  { name: 'đọc biến môi trường', pattern: /\bprocess\.env\b/ },
  {
    name: 'gọi mạng (fetch, XMLHttpRequest, WebSocket)',
    pattern: /\bfetch\s*\(|\bXMLHttpRequest\b|\bnew\s+WebSocket\b/,
  },
  { name: 'in ra console', pattern: /\bconsole\./ },
  { name: 'ghi log (Logger)', pattern: /\bLogger\b|\blogger\b/ },
];

/** Tên các luật bị vi phạm trong `code` (đã bỏ comment) của file `file` (đường dẫn tương đối so với `src/chatbot`, dấu `/`). */
function findViolations(file: string, code: string): string[] {
  const found = FORBIDDEN.filter(({ pattern }) => pattern.test(code)).map(
    ({ name }) => name,
  );
  // Hai thư mục không biết nhau: luật khẩn cấp không được nhập bộ giới hạn (và ngược lại)
  if (file.startsWith('safety/') && /from\s+['"][^'"]*\/limit\//.test(code)) {
    found.push('safety/ import limit/');
  }
  if (file.startsWith('limit/') && /from\s+['"][^'"]*\/safety\//.test(code)) {
    found.push('limit/ import safety/');
  }
  return found;
}

const sources = SCANNED_DIRS.flatMap((dir) =>
  listSourceFiles(join(CHATBOT_DIR, dir)).map((path) => ({
    file: relative(CHATBOT_DIR, path).split(sep).join('/'),
    code: stripComments(readSource(path)),
  })),
);

describe('chatbot B1 — kiến trúc phần an toàn (độc lập, thuần, không mạng, không log)', () => {
  it('B1-KT: có mã nguồn để quét (chống quét rỗng)', () => {
    const files = sources.map((source) => source.file);
    for (const expected of [
      'limit/request-limiter.ts',
      'limit/sliding-window-limiter.ts',
      'safety/phrase-matcher.ts',
      'safety/question-normalizer.ts',
      'safety/redact.ts',
    ]) {
      expect(files).toContain(expected);
    }
  });

  it.each([
    ['providers', "import { x } from '../providers/ai-provider.js';"],
    ['config', "import { x } from '../config/chatbot.config.js';"],
    ['nestjs', "import { Injectable } from '@nestjs/common';"],
    ['typeorm', "import { DataSource } from 'typeorm';"],
    ['mysql2', "import mysql from 'mysql2/promise';"],
    ['http', "import http from 'node:http';"],
    ['https không tiền tố', "import https from 'https';"],
    ['fs', "import { readFileSync } from 'node:fs';"],
    ['child_process', "import { exec } from 'node:child_process';"],
    ['process.env', 'const key = process.env.GROQ_API_KEY;'],
    ['fetch', "await fetch('https://example.test');"],
    ['XMLHttpRequest', 'const x = new XMLHttpRequest();'],
    ['console', "console.log('câu hỏi');"],
    ['Logger', "private readonly logger = new Logger('x');"],
  ])('B1-KT: đối chứng ÂM, luật phát hiện %s', (_name, source) => {
    expect(findViolations('safety/fake.ts', source)).not.toEqual([]);
  });

  it('B1-KT: đối chứng ÂM, thư mục này không được import thư mục kia', () => {
    expect(
      findViolations(
        'safety/fake.ts',
        "import { RequestLimiter } from '../limit/request-limiter.js';",
      ),
    ).toEqual(['safety/ import limit/']);
    expect(
      findViolations(
        'limit/fake.ts',
        "import { detectEmergency } from '../safety/emergency.rules.js';",
      ),
    ).toEqual(['limit/ import safety/']);
  });

  it('B1-KT: nguồn sạch (import tương đối cùng thư mục, chỉ hàm thuần) không bị báo', () => {
    const clean = [
      "import { splitWords } from './phrase-matcher.js';",
      "import { trimAsciiWhitespace } from '../../auth/validation/ascii-text.js';",
      'export const now = Date.now;',
      '// process.env và fetch( và console.log chỉ nằm trong comment',
    ].join('\n');
    expect(findViolations('safety/ok.ts', stripComments(clean))).toEqual([]);
    expect(findViolations('limit/ok.ts', stripComments(clean))).toEqual([]);
  });

  it('B1-KT: mã thật của safety/ và limit/ không vi phạm luật nào', () => {
    const report = sources.flatMap(({ file, code }) =>
      findViolations(file, code).map((name) => `${file}: ${name}`),
    );
    expect(report).toEqual([]);
  });
});
