import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listSourceFiles,
  readSource,
  stripComments,
} from '../../doctor/testing/architecture-scan.js';

// chatbot B2 — khoá ràng buộc 8 của B2 (PLAN chatbot 5.4, 5.9, 5.15 đột biến 9 đến 11): `context/` và `answer/` KHÔNG ghi DB, KHÔNG lấy khoá, KHÔNG mở giao dịch ngoài
// `runReadOnly`, KHÔNG gọi mạng, KHÔNG đọc biến môi trường, KHÔNG log, KHÔNG phụ thuộc đồng hồ hay số ngẫu nhiên thật, KHÔNG dùng Nest và KHÔNG gọi mô hình khác để chấm
// (không import `providers/` ngoài `import type`). `answer/` được dùng `context/`, ngược lại thì không. Mỗi luật có đối chứng ÂM trên nguồn giả trước khi quét mã thật.
const CHATBOT_DIR = fileURLToPath(new URL('..', import.meta.url));
const SCANNED_DIRS = ['context', 'answer'] as const;

// Chỉ hai file của B1 được import: bộ khớp cụm và bộ chuẩn hoá (hàm thuần). Không import luật khẩn cấp, che định danh, giới hạn…
const ALLOWED_SAFETY = 'phrase-matcher\\.js|question-normalizer\\.js';

const FORBIDDEN: readonly { name: string; pattern: RegExp }[] = [
  { name: 'import @nestjs/*', pattern: /from\s+['"]@nestjs\// },
  { name: 'import mysql2', pattern: /from\s+['"]mysql2/ },
  {
    name: 'import typeorm không phải `import type`',
    pattern: /^\s*import\s+(?!type\b)[^;]*?from\s+['"]typeorm['"]/m,
  },
  {
    name: 'import providers/ không phải `import type` (không gọi mô hình khác để chấm)',
    pattern: /^\s*import\s+(?!type\b)[^;]*?from\s+['"][^'"]*\/providers\//m,
  },
  { name: 'import config/', pattern: /from\s+['"][^'"]*\/config\// },
  { name: 'import limit/', pattern: /from\s+['"][^'"]*\/limit\// },
  {
    name: 'import safety/ ngoài phrase-matcher và question-normalizer',
    pattern: new RegExp(
      `from\\s+['"][^'"]*\\/safety\\/(?!(?:${ALLOWED_SAFETY})['"])`,
    ),
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
  {
    name: 'câu SQL ghi hay đổi cấu trúc',
    pattern:
      /\b(?:INSERT\s+INTO|UPDATE\s+`?\w+`?\s+SET|DELETE\s+FROM|REPLACE\s+INTO|TRUNCATE|ALTER\s+TABLE|DROP\s+(?:TABLE|DATABASE)|CREATE\s+(?:TABLE|DATABASE))\b/i,
  },
  {
    name: 'lấy khoá (FOR UPDATE, FOR SHARE, LOCK IN SHARE MODE, GET_LOCK)',
    pattern:
      /\bFOR\s+(?:UPDATE|SHARE)\b|\bLOCK\s+IN\s+SHARE\s+MODE\b|\bGET_LOCK\b/i,
  },
  {
    name: 'tự mở giao dịch (chỉ `runReadOnly` được mở)',
    pattern: /\bstartTransaction\b|\bcreateQueryRunner\b|\.transaction\s*\(/,
  },
  {
    name: 'đồng hồ hay số ngẫu nhiên thật (Date.now, new Date, Math.random, hẹn giờ)',
    pattern:
      /\bDate\.now\b|\bnew\s+Date\s*\(|\bMath\.random\b|\bsetTimeout\b|\bsetInterval\b/,
  },
];

/** Tên các luật bị vi phạm trong `code` (đã bỏ comment) của file `file` (đường dẫn tương đối so với `src/chatbot`, dấu `/`). */
function findViolations(file: string, code: string): string[] {
  const found = FORBIDDEN.filter(({ pattern }) => pattern.test(code)).map(
    ({ name }) => name,
  );
  // Hướng phụ thuộc: answer/ dùng context/, context/ không biết answer/
  if (file.startsWith('context/') && /from\s+['"][^'"]*\/answer\//.test(code)) {
    found.push('context/ import answer/');
  }
  return found;
}

const sources = SCANNED_DIRS.flatMap((dir) =>
  listSourceFiles(join(CHATBOT_DIR, dir)).map((path) => ({
    file: relative(CHATBOT_DIR, path).split(sep).join('/'),
    code: stripComments(readSource(path)),
  })),
);

describe('chatbot B2 — kiến trúc ngữ cảnh và đối chiếu (chỉ đọc, thuần, không mạng, không log)', () => {
  it('B2-KT: có mã nguồn để quét (chống quét rỗng)', () => {
    const files = sources.map((source) => source.file);
    for (const expected of [
      'context/context-builder.ts',
      'context/public-context.repository.ts',
      'context/doctor-source.ts',
      'context/placeholder.ts',
      'context/policy-knowledge.ts',
      'context/keyword-matcher.ts',
      'answer/output-verifier.ts',
      'answer/output.schema.ts',
      'answer/specialty-mapper.ts',
      'answer/entity-resolver.ts',
      'answer/answer-renderer.ts',
      'answer/answer-reconciler.ts',
    ]) {
      expect(files).toContain(expected);
    }
  });

  it.each([
    ['nestjs', "import { Injectable } from '@nestjs/common';"],
    ['mysql2', "import mysql from 'mysql2/promise';"],
    ['typeorm giá trị', "import { DataSource } from 'typeorm';"],
    [
      'typeorm nhiều dòng',
      "import {\n  DataSource,\n  EntityManager,\n} from 'typeorm';",
    ],
    [
      'providers giá trị',
      "import { FallbackChain } from '../providers/fallback-chain.js';",
    ],
    [
      'providers SYSTEM_CLOCK',
      "import { SYSTEM_CLOCK } from '../providers/ai-provider.js';",
    ],
    ['config', "import { x } from '../config/chatbot.config.js';"],
    ['limit', "import { RequestLimiter } from '../limit/request-limiter.js';"],
    [
      'safety khẩn cấp',
      "import { detectEmergency } from '../safety/emergency.rules.js';",
    ],
    [
      'safety che định danh',
      "import { redactText } from '../safety/redact.js';",
    ],
    ['http', "import http from 'node:http';"],
    ['https không tiền tố', "import https from 'https';"],
    ['fs', "import { readFileSync } from 'node:fs';"],
    ['child_process', "import { exec } from 'node:child_process';"],
    ['process.env', 'const key = process.env.GROQ_API_KEY;'],
    ['fetch', "await fetch('https://example.test');"],
    ['XMLHttpRequest', 'const x = new XMLHttpRequest();'],
    ['console', "console.log('câu hỏi');"],
    ['Logger', "private readonly logger = new Logger('x');"],
    ['INSERT', "await m.query('INSERT INTO lich_hen (a) VALUES (1)');"],
    ['UPDATE ... SET', "await m.query('UPDATE khung_gio SET trang_thai = 1');"],
    ['DELETE', "await m.query('DELETE FROM thong_bao');"],
    ['TRUNCATE', "await m.query('TRUNCATE TABLE x');"],
    ['ALTER', "await m.query('ALTER TABLE x ADD y INT');"],
    ['FOR UPDATE', "await m.query('SELECT 1 FROM x FOR UPDATE');"],
    ['FOR SHARE', "await m.query('SELECT 1 FROM x FOR SHARE');"],
    ['startTransaction', 'await runner.startTransaction();'],
    ['createQueryRunner', 'const r = db.createQueryRunner();'],
    ['.transaction(', 'await db.transaction(async () => 1);'],
    ['Date.now', 'const t = Date.now();'],
    ['new Date', 'const t = new Date();'],
    ['Math.random', 'const r = Math.random();'],
    ['setTimeout', 'setTimeout(() => 1, 5);'],
  ])('B2-KT: đối chứng ÂM, luật phát hiện %s', (_name, source) => {
    expect(findViolations('answer/fake.ts', source)).not.toEqual([]);
  });

  it('B2-KT: đối chứng ÂM, context/ không được import answer/', () => {
    expect(
      findViolations(
        'context/fake.ts',
        "import { verifyAnswer } from '../answer/output-verifier.js';",
      ),
    ).toEqual(['context/ import answer/']);
    expect(
      findViolations(
        'answer/fake.ts',
        "import { createContextIndex } from '../context/context-index.js';",
      ),
    ).toEqual([]);
  });

  it('B2-KT: nguồn sạch (import type, hai file safety được phép, SELECT thường) không bị báo', () => {
    const clean = [
      "import type { DataSource } from 'typeorm';",
      "import type { AiOutputSchema } from '../providers/ai-provider.js';",
      "import { foldVietnamese } from '../safety/phrase-matcher.js';",
      "import { codePointLength } from '../safety/question-normalizer.js';",
      "import { runReadOnly } from '../../common/transaction/read-only-tx.js';",
      "const sql = 'SELECT ten FROM chuyen_khoa WHERE chuyen_khoa_id IN (?)';",
      '// process.env, fetch( và console.log, UPDATE x SET, FOR UPDATE, Date.now chỉ nằm trong comment',
    ].join('\n');
    expect(findViolations('context/ok.ts', stripComments(clean))).toEqual([]);
    expect(findViolations('answer/ok.ts', stripComments(clean))).toEqual([]);
  });

  it('B2-KT: mã thật của context/ và answer/ không vi phạm luật nào', () => {
    const report = sources.flatMap(({ file, code }) =>
      findViolations(file, code).map((name) => `${file}: ${name}`),
    );
    expect(report).toEqual([]);
  });
});
