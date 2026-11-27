import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listSourceFiles,
  readSource,
  stripComments,
} from '../../doctor/testing/architecture-scan.js';

// chatbot B4 — khoá ràng buộc cứng của B4 (PLAN chatbot 5.4, 5.11, 5.12; GOI-09): `suggest/` thuần dữ liệu và tất định. KHÔNG gọi AI (không import `providers/`, `config/`),
// KHÔNG phụ thuộc phần hỏi đáp (`safety/`, `limit/`, `context/`, `answer/`), KHÔNG ghi DB, KHÔNG lấy khoá, KHÔNG mở giao dịch ngoài `runReadOnly`, KHÔNG gọi mạng,
// KHÔNG đọc biến môi trường, KHÔNG log, KHÔNG đồng hồ hay số ngẫu nhiên thật (mốc giờ đi qua `nowVN()` và tham số `now`).
// Cộng việc nhốt học vị: chỉ ba file được nhắc tới học vị, và `suggestion.dto.ts` (hình dạng thân trả về) không có chữ nào về học vị hay điểm xếp hạng.
// Mỗi luật có đối chứng ÂM trên nguồn giả trước khi quét mã thật.
const CHATBOT_DIR = fileURLToPath(new URL('..', import.meta.url));
const SUGGEST_DIR = join(CHATBOT_DIR, 'suggest');

const FORBIDDEN: readonly { name: string; pattern: RegExp }[] = [
  { name: 'import mysql2', pattern: /from\s+['"]mysql2/ },
  {
    name: 'import providers/ (B4 không dùng AI)',
    pattern: /from\s+['"][^'"]*\/providers\//,
  },
  { name: 'import config/', pattern: /from\s+['"][^'"]*\/config\// },
  { name: 'import limit/', pattern: /from\s+['"][^'"]*\/limit\// },
  { name: 'import safety/', pattern: /from\s+['"][^'"]*\/safety\// },
  { name: 'import context/', pattern: /from\s+['"][^'"]*\/context\// },
  { name: 'import answer/', pattern: /from\s+['"][^'"]*\/answer\// },
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

// Chỉ ba file được nhắc tới học vị: nơi đọc (repository), nơi tính (luật), nơi nối hai việc (service).
const DEGREE_WORD = /\bhocVi\b|\bhoc_vi\b|\bHocViBacSi\b|HOC_VI_BAC_SI/;
const DEGREE_ALLOWED = new Set([
  'suggest/doctor-degree.repository.ts',
  'suggest/ranking.rules.ts',
  'suggest/suggestion.service.ts',
]);
// Hình dạng thân trả về không được có chữ nào về học vị, số năm gốc, điểm xếp hạng
const RESPONSE_SHAPE_FORBIDDEN =
  /hoc_?vi|soNamKinhNghiem|\bscore\b|diemXepHang|xepHang|\brank\b/i;

/** Tên các luật bị vi phạm trong `code` (đã bỏ comment). */
function findViolations(code: string): string[] {
  return FORBIDDEN.filter(({ pattern }) => pattern.test(code)).map(
    ({ name }) => name,
  );
}

const sources = listSourceFiles(SUGGEST_DIR).map((path) => ({
  file: relative(CHATBOT_DIR, path).split(sep).join('/'),
  code: stripComments(readSource(path)),
}));

describe('chatbot B4 — kiến trúc API gợi ý (chỉ đọc, không AI, không log)', () => {
  it('B4-KT: có mã nguồn để quét (chống quét rỗng)', () => {
    const files = sources.map((source) => source.file).sort();
    expect(files).toEqual([
      'suggest/doctor-degree.repository.ts',
      'suggest/ranking.rules.ts',
      'suggest/suggestion-query.parser.ts',
      'suggest/suggestion.constants.ts',
      'suggest/suggestion.controller.ts',
      'suggest/suggestion.dto.ts',
      'suggest/suggestion.repository.ts',
      'suggest/suggestion.service.ts',
    ]);
  });

  it.each([
    ['mysql2', "import mysql from 'mysql2/promise';"],
    [
      'providers giá trị',
      "import { FallbackChain } from '../providers/fallback-chain.js';",
    ],
    [
      'providers import type cũng không được',
      "import type { AiProvider } from '../providers/ai-provider.js';",
    ],
    ['config', "import { x } from '../config/chatbot.config.js';"],
    ['limit', "import { RequestLimiter } from '../limit/request-limiter.js';"],
    [
      'safety',
      "import { detectEmergency } from '../safety/emergency.rules.js';",
    ],
    [
      'context',
      "import { ContextBuilder } from '../context/context-builder.js';",
    ],
    [
      'answer',
      "import { mapSpecialties } from '../answer/specialty-mapper.js';",
    ],
    [
      'chatbot.constants',
      "import { AI_CLOCK } from '../chatbot.constants.js';",
    ],
    ['http', "import http from 'node:http';"],
    ['https không tiền tố', "import https from 'https';"],
    ['fs', "import { readFileSync } from 'node:fs';"],
    ['child_process', "import { exec } from 'node:child_process';"],
    ['process.env', 'const key = process.env.GROQ_API_KEY;'],
    ['fetch', "await fetch('https://example.test');"],
    ['XMLHttpRequest', 'const x = new XMLHttpRequest();'],
    ['console', "console.log('gợi ý');"],
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
  ])('B4-KT: đối chứng ÂM, luật phát hiện %s', (_name, source) => {
    expect(findViolations(source)).not.toEqual([]);
  });

  it('B4-KT: nguồn sạch (typeorm, nest, nowVN, runReadOnly, SELECT thường) không bị báo', () => {
    const clean = [
      "import { Inject, Injectable } from '@nestjs/common';",
      "import { DataSource, type EntityManager } from 'typeorm';",
      "import { nowVN, todayVN } from '../../common/time/time.js';",
      "import { runReadOnly } from '../../common/transaction/read-only-tx.js';",
      "import { PublicDoctorService } from '../../search/doctors/public-doctor.service.js';",
      "const sql = 'SELECT ten FROM chuyen_khoa WHERE chuyen_khoa_id = ?';",
      '// process.env, fetch( và console.log, UPDATE x SET, FOR UPDATE, Date.now chỉ nằm trong comment',
    ].join('\n');
    expect(findViolations(stripComments(clean))).toEqual([]);
  });

  it('B4-KT: mã thật của suggest/ không vi phạm luật nào', () => {
    const report = sources.flatMap(({ file, code }) =>
      findViolations(code).map((name) => `${file}: ${name}`),
    );
    expect(report).toEqual([]);
  });

  it.each([
    ['hocVi', 'const x = item.hocVi;'],
    ['hoc_vi', "const sql = 'SELECT hoc_vi FROM bac_si';"],
    ['HocViBacSi', "import type { HocViBacSi } from './enums.js';"],
  ])('B4-KT: đối chứng ÂM, bắt chữ về học vị (%s)', (_name, source) => {
    expect(DEGREE_WORD.test(source)).toBe(true);
    expect(RESPONSE_SHAPE_FORBIDDEN.test(source)).toBe(true);
  });

  it('B4-KT: học vị chỉ được nhắc ở repository học vị, luật xếp hạng và service (GOI-09)', () => {
    const mentions = sources
      .filter(({ code }) => DEGREE_WORD.test(code))
      .map(({ file }) => file)
      .sort();
    expect(mentions).toEqual([...DEGREE_ALLOWED].sort());
  });

  it('B4-KT: hình dạng thân trả về (suggestion.dto.ts) không có chữ nào về học vị, số năm gốc, điểm xếp hạng', () => {
    const dto = sources.find(
      ({ file }) => file === 'suggest/suggestion.dto.ts',
    );
    expect(dto).toBeDefined();
    expect(RESPONSE_SHAPE_FORBIDDEN.test(dto?.code ?? '')).toBe(false);
  });
});
