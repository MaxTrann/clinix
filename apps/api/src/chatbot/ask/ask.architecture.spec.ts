import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listSourceFiles,
  readSource,
  stripComments,
} from '../../doctor/testing/architecture-scan.js';

// chatbot B3 — khoá ràng buộc cứng của B3 (PLAN chatbot 5.4, 5.9, 5.12; RTU-06, RTU-07; đột biến 12): `ask/` KHÔNG ghi DB, KHÔNG lấy khoá, KHÔNG mở giao dịch ngoài `runReadOnly`,
// KHÔNG gọi mạng, KHÔNG đọc biến môi trường, KHÔNG `console`, KHÔNG đọc header hay token (route công khai), KHÔNG số ngẫu nhiên hay đồng hồ thật (đồng hồ tiêm vào), KHÔNG gọi nhà cung cấp
// trực tiếp (chỉ `import type` từ `providers/`; chuỗi dự phòng do `ChatbotModule` truyền vào). Nest chỉ ở controller. Đúng MỘT chỗ ghi log, ở `ask.service.ts`, và chỉ bằng `.log(`.
// Mỗi luật có đối chứng ÂM trên nguồn giả trước khi quét mã thật.
const CHATBOT_DIR = fileURLToPath(new URL('..', import.meta.url));
const ASK_DIR = join(CHATBOT_DIR, 'ask');

const FORBIDDEN: readonly { name: string; pattern: RegExp }[] = [
  { name: 'import mysql2', pattern: /from\s+['"]mysql2/ },
  {
    name: 'import typeorm không phải `import type`',
    pattern: /^\s*import\s+(?!type\b)[^;]*?from\s+['"]typeorm['"]/m,
  },
  {
    name: 'import providers/ không phải `import type` (không gọi nhà cung cấp trực tiếp)',
    pattern: /^\s*import\s+(?!type\b)[^;]*?from\s+['"][^'"]*\/providers\//m,
  },
  {
    name: 'import limit/ không phải `import type` (bộ giới hạn do module truyền vào)',
    pattern: /^\s*import\s+(?!type\b)[^;]*?from\s+['"][^'"]*\/limit\//m,
  },
  { name: 'import config/', pattern: /from\s+['"][^'"]*\/config\// },
  {
    name: 'import chatbot.constants (token AI_*)',
    pattern: /from\s+['"][^'"]*\/chatbot\.constants/,
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
  { name: 'lớp Logger (module truyền logger vào)', pattern: /\bLogger\b/ },
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
    name: 'đồng hồ hay số ngẫu nhiên thật (Date.now, new Date, Math.random, randomInt, hẹn giờ)',
    pattern:
      /\bDate\.now\b|\bnew\s+Date\s*\(|\bMath\.random\b|\brandomInt\b|\bsetTimeout\b|\bsetInterval\b/,
  },
  {
    name: 'đọc header, cookie hay token (route công khai không đọc token, TLA-11)',
    pattern:
      /@Headers\b|\.headers\b|\bauthorization\b|\bbearer\b|@Req\b|cookie/i,
  },
  {
    name: 'ghi log nội dung (khoá `cauHoi`, `traLoi`, `noiDung` đi vào lời gọi log)',
    pattern:
      /\.log\([^)]*\b(?:cauHoi|traLoi|noiDung|question|answer|context|ip)\b/,
  },
];

/** Nest chỉ được nằm ở controller. */
const NEST_IMPORT = /from\s+['"]@nestjs\//;
/** Chỉ `ask.service.ts` được ghi log, và chỉ bằng `.log(`. */
const LOGGER_USE = /\blogger\b/;
const LOGGER_NOT_LOG = /\blogger\.(?!log\()/;
/** `runReadOnly` chỉ ở bộ đọc địa chỉ. */
const RUN_READ_ONLY = /\brunReadOnly\b/;

/** Tên các luật bị vi phạm trong `code` (đã bỏ comment) của file `file` (tương đối so với `src/chatbot`, dấu `/`). */
function findViolations(file: string, code: string): string[] {
  const found = FORBIDDEN.filter(({ pattern }) => pattern.test(code)).map(
    ({ name }) => name,
  );
  if (file !== 'ask/ask.controller.ts' && NEST_IMPORT.test(code)) {
    found.push('import @nestjs/* ngoài controller');
  }
  if (file !== 'ask/ask.service.ts' && LOGGER_USE.test(code)) {
    found.push('ghi log ngoài ask.service.ts');
  }
  if (LOGGER_NOT_LOG.test(code)) found.push('logger dùng hàm khác `.log(`');
  if (file !== 'ask/branch-directory.ts' && RUN_READ_ONLY.test(code)) {
    found.push('runReadOnly ngoài branch-directory.ts');
  }
  return found;
}

const sources = listSourceFiles(ASK_DIR).map((path) => ({
  file: relative(CHATBOT_DIR, path).split(sep).join('/'),
  code: stripComments(readSource(path)),
}));

describe('chatbot B3 — kiến trúc API hỏi đáp (chỉ đọc, không log nội dung, không đọc token)', () => {
  it('B3-KT: có đúng các file mã nguồn dự kiến (chống quét rỗng và file lạ)', () => {
    expect(sources.map((source) => source.file).sort()).toEqual([
      'ask/ask.constants.ts',
      'ask/ask.controller.ts',
      'ask/ask.dto.ts',
      'ask/ask.errors.ts',
      'ask/ask.log.ts',
      'ask/ask.response.ts',
      'ask/ask.service.ts',
      'ask/ask.tokens.ts',
      'ask/branch-directory.ts',
      'ask/history-quoting.ts',
    ]);
  });

  it.each([
    ['mysql2', 'ask/x.ts', "import mysql from 'mysql2/promise';"],
    ['typeorm giá trị', 'ask/x.ts', "import { DataSource } from 'typeorm';"],
    [
      'providers giá trị',
      'ask/x.ts',
      "import { FallbackChain } from '../providers/fallback-chain.js';",
    ],
    [
      'limit giá trị',
      'ask/x.ts',
      "import { RequestLimiter } from '../limit/request-limiter.js';",
    ],
    ['config', 'ask/x.ts', "import { x } from '../config/chatbot.config.js';"],
    [
      'chatbot.constants',
      'ask/x.ts',
      "import { AI_CLOCK } from '../chatbot.constants.js';",
    ],
    ['http', 'ask/x.ts', "import http from 'node:http';"],
    ['fs', 'ask/x.ts', "import { readFileSync } from 'node:fs';"],
    ['process.env', 'ask/x.ts', 'const key = process.env.GROQ_API_KEY;'],
    ['fetch', 'ask/x.ts', "await fetch('https://example.test');"],
    ['console', 'ask/x.ts', "console.log('hỏi');"],
    ['Logger', 'ask/ask.service.ts', "const l = new Logger('x');"],
    [
      'INSERT',
      'ask/x.ts',
      "await m.query('INSERT INTO lich_hen (a) VALUES (1)');",
    ],
    [
      'UPDATE ... SET',
      'ask/x.ts',
      "await m.query('UPDATE khung_gio SET a = 1');",
    ],
    ['FOR UPDATE', 'ask/x.ts', "await m.query('SELECT 1 FROM x FOR UPDATE');"],
    ['startTransaction', 'ask/x.ts', 'await runner.startTransaction();'],
    ['createQueryRunner', 'ask/x.ts', 'const r = db.createQueryRunner();'],
    ['Date.now', 'ask/x.ts', 'const t = Date.now();'],
    ['new Date', 'ask/x.ts', 'const t = new Date();'],
    ['Math.random', 'ask/x.ts', 'const r = Math.random();'],
    ['randomInt', 'ask/x.ts', 'const r = randomInt(26);'],
    ['setTimeout', 'ask/x.ts', 'setTimeout(() => 1, 5);'],
    ['header Authorization', 'ask/x.ts', "const a = req.headers['x'];"],
    ['@Headers', 'ask/x.ts', 'ask(@Headers() headers: unknown) {}'],
    ['@Req', 'ask/x.ts', 'ask(@Req() req: unknown) {}'],
    ['cookie', 'ask/x.ts', 'const c = req.cookies;'],
    ['bearer', 'ask/x.ts', "const t = 'Bearer abc';"],
    [
      'nest ngoài controller',
      'ask/x.ts',
      "import { Inject } from '@nestjs/common';",
    ],
    ['logger ngoài service', 'ask/x.ts', "this.logger.log('x');"],
    ['logger.warn', 'ask/ask.service.ts', "this.deps.logger.warn('x');"],
    [
      'runReadOnly ngoài bộ đọc',
      'ask/x.ts',
      'await runReadOnly(db, async () => 1);',
    ],
    ['log câu hỏi', 'ask/ask.service.ts', 'this.deps.logger.log(question);'],
    [
      'log câu trả lời',
      'ask/ask.service.ts',
      'this.deps.logger.log(`a ${answer}`);',
    ],
    [
      'log cauHoi',
      'ask/ask.service.ts',
      'this.deps.logger.log(input.body.cauHoi);',
    ],
  ])('B3-KT: đối chứng ÂM, luật phát hiện %s', (_name, file, source) => {
    expect(findViolations(file, source)).not.toEqual([]);
  });

  it('B3-KT: nguồn sạch (typeorm import type, providers import type, nowVN không dùng, runReadOnly ở bộ đọc, logger.log ở service) không bị báo', () => {
    const clean = [
      "import type { DataSource } from 'typeorm';",
      "import type { FallbackChain } from '../providers/fallback-chain.js';",
      "import type { RequestLimiter } from '../limit/request-limiter.js';",
      "import { ANSWER_OUTPUT } from '../answer/output.schema.js';",
      "const sql = 'SELECT ten FROM chi_nhanh ORDER BY ten';",
      '// process.env, fetch( và console.log, Date.now, @Headers chỉ nằm trong comment',
    ].join('\n');
    expect(findViolations('ask/ask.service.ts', stripComments(clean))).toEqual(
      [],
    );
    expect(
      findViolations(
        'ask/ask.service.ts',
        'this.deps.logger.log(formatAskLog(entry));',
      ),
    ).toEqual([]);
    expect(
      findViolations(
        'ask/branch-directory.ts',
        "import { runReadOnly } from '../../common/transaction/read-only-tx.js';\nawait runReadOnly(db, async () => 1);",
      ),
    ).toEqual([]);
    expect(
      findViolations(
        'ask/ask.controller.ts',
        "import { Inject } from '@nestjs/common';",
      ),
    ).toEqual([]);
  });

  it('B3-KT: mã thật của ask/ không vi phạm luật nào', () => {
    const report = sources.flatMap(({ file, code }) =>
      findViolations(file, code).map((name) => `${file}: ${name}`),
    );
    expect(report).toEqual([]);
  });

  it('RTU-06: ask.service.ts có ĐÚNG MỘT lời gọi ghi log, và nó đi qua formatAskLog', () => {
    const service = sources.find(
      ({ file }) => file === 'ask/ask.service.ts',
    )?.code;
    expect(service).toBeDefined();
    expect(service?.match(/\.logger\.log\(/g)).toHaveLength(1);
    expect(service).toMatch(/\.logger\.log\(\s*formatAskLog\(/);
  });

  it('TLA-11: controller chỉ nhận body, ip và res; đúng MỘT route POST; không @Roles, không guard', () => {
    const controller = sources.find(
      ({ file }) => file === 'ask/ask.controller.ts',
    )?.code;
    expect(controller).toBeDefined();
    expect(controller?.match(/@Post\(/g)).toHaveLength(1);
    expect(controller).toMatch(/@Public\(\)/);
    expect(controller).not.toMatch(/@Roles|@UseGuards/);
    expect(controller).toMatch(/@Ip\(\) ip: string/);
  });
});
