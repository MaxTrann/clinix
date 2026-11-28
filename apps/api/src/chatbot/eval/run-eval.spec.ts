import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ModelAnswer } from '../answer/output.schema.js';
import type { AiRequest, Clock } from '../providers/ai-provider.js';
import { ProviderError } from '../providers/provider-error.js';
import { createVirtualPaceClock } from './eval-http.js';
import type { AttemptRecord } from './eval-metrics.js';
import { EvalSetupError, createScrubber } from './eval-store.js';
import { defaultDryRunScript, type DryRunScript } from './eval-world.js';
import { loadGoldenSet } from './golden-set.js';
import {
  assertLiveAllowed,
  loadKeys,
  main,
  parseArgs,
  runEval,
  UsageError,
  type MainIo,
  type RunDeps,
  type RunOptions,
} from './run-eval.js';

// Test của script chạy bộ câu hỏi chuẩn (chatbot X2). KHÔNG khoá, KHÔNG mạng: nhà cung cấp là bản giả của `--dry-run`, hay adapter thật với `fetch` giả.
// Mọi tệp ra nằm ở thư mục tạm của hệ điều hành (ngoài repo). Các tệp `.env` dùng ở đây do CHÍNH test tạo với giá trị giả; không bao giờ đọc `.env` thật.

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function tempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), 'clinix-x2-'));
  directories.push(directory);
  return directory;
}

const options = (out: string, extra: Partial<RunOptions> = {}): RunOptions => ({
  dryRun: true,
  only: null,
  resume: false,
  retryDuPhong: false,
  out,
  envFile: null,
  gapMs: 0,
  groqTpm: 8000,
  groqTpd: 200_000,
  groqUsedToday: 0,
  includeExtra: true,
  ...extra,
});

const silent = (extra: RunDeps = {}): RunDeps => ({
  stdout: () => undefined,
  ...extra,
});
const read = (path: string): string => readFileSync(path, 'utf8');

describe('X2-08: --dry-run chạy đủ đường AskService, không khoá, không mạng', () => {
  it('X2-08: 30 câu và 5 câu phụ đều ra kết quả đạt với mô hình giả lý tưởng; mọi chỉ số đạt hoặc chờ chấm tay', async () => {
    const out = tempDir();
    const fetchImpl = vi.fn<typeof globalThis.fetch>(() => {
      throw new Error('không được gọi mạng ở chạy khô');
    });
    const outcome = await runEval(options(out), silent({ fetchImpl }));
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stopReason).toBeNull();
    expect(outcome.records).toHaveLength(35);
    const notOk = outcome.records.filter(
      (record) => !record.phu && record.kiemTra.ketQua !== 'dat',
    );
    expect(
      notOk.map(
        (record) =>
          `${record.ma}: ${record.ketQua} ${record.kiemTra.lyDo.join('; ')}`,
      ),
    ).toEqual([]);
    const byCode = Object.fromEntries(
      outcome.report.chiSo.map((row) => [row.ma, row.phanQuyet]),
    );
    expect(byCode).toEqual({
      N6: 'DAT',
      CB1: 'DAT',
      CB2: 'CHO_CHAM_TAY',
      CB3: 'CHO_CHAM_TAY',
      CB4: 'DAT',
      CB5: 'DAT',
      CB6: 'DAT',
    });
  });

  it('X2-08: ba tệp ra đúng hình dạng; results.json mang cờ "gia" và không có chữ câu trả lời; bảng chấm đủ dòng và hai cột chấm rỗng', async () => {
    const out = tempDir();
    await runEval(options(out), silent());
    const results = JSON.parse(read(join(out, 'results.json'))) as Record<
      string,
      unknown
    >;
    expect(results.thatHayGia).toBe('gia');
    expect(results.canhBaoGia).toContain('KHÔNG PHẢI SỐ ĐO THẬT');
    expect(results.hoanThanh).toBe(true);
    const text = read(join(out, 'results.json'));
    // Chữ câu trả lời của mô hình giả KHÔNG được vào results.json
    expect(text).not.toContain('Hiện phòng khám chưa có dữ liệu');
    expect(text).not.toContain('Thông tin bạn cần');
    const checkpoint = read(join(out, 'checkpoint.jsonl')).trim().split('\n');
    expect(checkpoint).toHaveLength(36);
    expect(JSON.parse(checkpoint[0] ?? '{}')).toMatchObject({ kind: 'run' });
    const csv = read(join(out, 'cham-tay.csv'));
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    for (const code of ['G01', 'G30', 'P01', 'L04'])
      expect(csv).toContain(`"${code}"`);
    // Hai cột chấm để trống ở mọi dòng của bảng chính: `"","",""` ở cuối dòng
    // Bảng chính nằm trước dòng trống đầu tiên (sau đó là mười mẫu CB2 và bảng dữ liệu chuẩn)
    const mainTable = csv.split('\r\n\r\n')[0] ?? '';
    const gradingRows = mainTable
      .split('\r\n')
      .filter((row) => /^"(G\d\d|P01|L0\d)"/.test(row));
    expect(gradingRows).toHaveLength(35);
    expect(gradingRows.every((row) => row.endsWith(',"","",""'))).toBe(true);
    expect(csv).toContain('Bảng dữ liệu chuẩn');
  });

  it('X2-08: không đọc biến môi trường khoá và không đọc tệp .env ở chạy khô (qua main)', async () => {
    const out = tempDir();
    const exists = vi.fn(() => true);
    const readFile = vi.fn(() => 'GROQ_API_KEY=gsk_KHONG_DUOC_DOC');
    const lines: string[] = [];
    const io: MainIo = {
      env: {
        GROQ_API_KEY: 'gsk_TRONG_MOI_TRUONG',
        GEMINI_API_KEY: 'AIzaTRONGMOITRUONG',
      },
      cwd: tempDir(),
      stdout: (line) => lines.push(line),
      stderr: (line) => lines.push(line),
      exists,
      readFile,
    };
    const code = await main(['--dry-run', '--out', out], io);
    expect(code).toBe(0);
    expect(exists).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
    expect(lines.join('\n')).toContain('KHÔNG PHẢI SỐ ĐO THẬT');
    expect(lines.join('\n')).not.toContain('gsk_');
  });
});

describe('X2-05: 429 liên tiếp thì dừng hẳn', () => {
  const rateLimited: DryRunScript = () => new ProviderError('rateLimited', 429);

  it('X2-05: lớp Groq trả 429 ba lần liên tiếp (hai lớp cùng 429 thì chuỗi gọi cả hai) thì dừng, mã thoát 3, checkpoint còn đủ', async () => {
    const out = tempDir();
    const outcome = await runEval(
      options(out, { only: 'groq' }),
      silent({ dryRunScript: rateLimited }),
    );
    expect(outcome.exitCode).toBe(3);
    expect(outcome.stopReason).toBe('429');
    // Mỗi câu cần AI gọi Groq đúng một lần (429 không thử lại); câu thứ ba làm bộ đếm đủ 3 nên dừng ngay sau câu đó
    const aiAttempts = outcome.records.filter((record) => record.aiBound);
    expect(aiAttempts).toHaveLength(3);
    expect(aiAttempts.every((record) => record.ketQua === 'DuPhong')).toBe(
      true,
    );
    const results = JSON.parse(read(join(out, 'results.json'))) as {
      hoanThanh: boolean;
      dungVi: string;
    };
    expect(results.hoanThanh).toBe(false);
    expect(results.dungVi).toBe('429');
  });

  it('X2-05: 429 rồi một lần 2xx của cùng lớp thì đặt lại bộ đếm và chạy hết', async () => {
    const out = tempDir();
    const base = defaultDryRunScript(loadGoldenSet().set);
    let aiCalls = 0;
    // Hai câu 429 rồi một câu thành công, lặp lại: không bao giờ đủ ba liên tiếp
    const script: DryRunScript = (layer, request) => {
      aiCalls += 1;
      return aiCalls % 3 === 0
        ? base(layer, request)
        : new ProviderError('rateLimited', 429);
    };
    const outcome = await runEval(
      options(out, { only: 'groq' }),
      silent({ dryRunScript: script }),
    );
    expect(outcome.stopReason).toBeNull();
    expect(outcome.exitCode).toBe(0);
  });
});

describe('X2-04: khoảng cách tối thiểu tự nâng theo trần mỗi phút của sản phẩm', () => {
  const gapOf = async (extra: Partial<RunOptions>): Promise<string> => {
    const lines: string[] = [];
    await runEval(options(tempDir(), { includeExtra: false, ...extra }), {
      stdout: (line) => lines.push(line),
    });
    return lines.find((line) => line.includes('cách nhau tối thiểu')) ?? '';
  };

  it('X2-04: chuỗi hay riêng Gemini (trần 10 mỗi phút) nâng lên 6 giây; riêng Groq (trần 20) lên 3 giây; khai lớn hơn thì giữ', async () => {
    expect(await gapOf({ gapMs: 0 })).toContain('tối thiểu 6000 ms');
    expect(await gapOf({ gapMs: 0, only: 'gemini' })).toContain(
      'tối thiểu 6000 ms',
    );
    expect(await gapOf({ gapMs: 0, only: 'groq' })).toContain(
      'tối thiểu 3000 ms',
    );
    expect(await gapOf({ gapMs: 4000, only: 'groq' })).toContain(
      'tối thiểu 4000 ms',
    );
    expect(await gapOf({ gapMs: 9000 })).toContain('tối thiểu 9000 ms');
  });
});

describe('X2-06: checkpoint và --resume', () => {
  it('X2-06: dừng giữa chừng rồi chạy tiếp từ câu kế tiếp, không trùng dòng', async () => {
    const out = tempDir();
    const first = await runEval(
      options(out),
      silent({ stopAfterAttempts: 10 }),
    );
    expect(first.stopReason).toBe('gioi-han-thu-nghiem');
    expect(first.records).toHaveLength(10);
    const second = await runEval(options(out, { resume: true }), silent());
    expect(second.stopReason).toBeNull();
    expect(second.records).toHaveLength(35);
    const codes = second.records.map(
      (record) => `${record.ma}#${String(record.lan)}`,
    );
    expect(new Set(codes).size).toBe(35);
    const lines = read(join(out, 'checkpoint.jsonl')).trim().split('\n');
    expect(lines).toHaveLength(36);
  });

  it('X2-06: có checkpoint mà thiếu --resume thì từ chối; --resume mà chưa có thì từ chối', async () => {
    const out = tempDir();
    await runEval(options(out), silent({ stopAfterAttempts: 2 }));
    await expect(runEval(options(out), silent())).rejects.toThrow(/--resume/);
    await expect(
      runEval(options(tempDir(), { resume: true }), silent()),
    ).rejects.toThrow(/chưa có checkpoint/);
  });

  it('X2-06: khác chế độ hay khác mục phụ thì không --resume được', async () => {
    const out = tempDir();
    await runEval(options(out), silent({ stopAfterAttempts: 2 }));
    await expect(
      runEval(options(out, { resume: true, only: 'gemini' }), silent()),
    ).rejects.toThrow(/khác ở che/);
    await expect(
      runEval(options(out, { resume: true, includeExtra: false }), silent()),
    ).rejects.toThrow(/khác ở coMucPhu/);
  });

  it('X2-06: --retry-duphong chỉ hỏi lại câu mà lần cuối là DuPhong và giữ nguyên lần đầu', async () => {
    const out = tempDir();
    const base = defaultDryRunScript(loadGoldenSet().set);
    let failures = 2;
    // Hai lần thử của lớp (lần đầu và thử lại) đều 503 nên câu G09 rơi xuống DuPhong
    const failTwice: DryRunScript = (layer, request) => {
      if (failures > 0 && request.question.startsWith('Cổ tay tôi')) {
        failures -= 1;
        return new ProviderError('server', 503);
      }
      return base(layer, request);
    };
    // gapMs ảo 61 giây: cooldown 60 giây của chuỗi hết giữa hai câu nên chỉ G09 bị ảnh hưởng
    const firstRun = await runEval(
      options(out, { only: 'groq', gapMs: 61_000 }),
      silent({ dryRunScript: failTwice }),
    );
    const before = firstRun.records.filter((record) => record.ma === 'G09');
    expect(before.map((record) => record.ketQua)).toEqual(['DuPhong']);
    expect(before[0]?.kiemTra.ketQua).toBe('chuaDo');
    expect(
      firstRun.records.filter((record) => record.ketQua === 'DuPhong'),
    ).toHaveLength(1);
    const retried = await runEval(
      options(out, {
        only: 'groq',
        gapMs: 61_000,
        resume: true,
        retryDuPhong: true,
      }),
      silent({ dryRunScript: base }),
    );
    const after: AttemptRecord[] = retried.records.filter(
      (record) => record.ma === 'G09',
    );
    expect(
      after.map((record) => `${String(record.lan)}:${record.ketQua}`),
    ).toEqual(['1:DuPhong', '2:GoiY']);
    // Mọi câu khác không bị hỏi lại
    expect(retried.records.filter((record) => record.lan > 1)).toHaveLength(1);
    // CB5 tính trên lần đầu: vẫn một câu DuPhong trên 23 câu cần AI (4,3 phần trăm: đạt); nội dung tính trên lần cuối
    const cb5 = retried.report.chiSo.find((row) => row.ma === 'CB5');
    expect(cb5?.giaTri).toBe('1/23');
    expect(cb5?.phanQuyet).toBe('DAT');
    expect(
      retried.report.theoNhom.find((group) => group.nhom === 'B')?.dat,
    ).toBe(8);
  });
});

describe('X2-07: khoá không bao giờ xuống đĩa', () => {
  it('X2-07: nhà cung cấp giả cố ý lặp lại khoá trong câu trả lời thì mọi tệp ra không chứa khoá', async () => {
    const out = tempDir();
    const secret = 'gsk_TEST_KHONG_PHAI_KHOA_THAT';
    const leak: DryRunScript = () => ({
      loai: 'hoiDap',
      traLoi: `Mã nội bộ là ${secret} và AIzaSyKHONGPHAIKHOATHATabc`,
      chuyenKhoaGoiY: [],
    });
    const lines: string[] = [];
    await runEval(options(out), {
      keys: { groq: secret },
      dryRunScript: leak,
      stdout: (line) => lines.push(line),
    });
    for (const file of ['checkpoint.jsonl', 'results.json', 'cham-tay.csv']) {
      const text = read(join(out, file));
      expect(text, file).not.toContain(secret);
      expect(text, file).not.toContain('AIzaSyKHONGPHAIKHOATHATabc');
    }
    expect(lines.join('\n')).not.toContain(secret);
    // Đối chứng ÂM: bộ che tắt thì phép quét tìm thấy khoá (chứng minh phép kiểm có hiệu lực)
    const disabled = createScrubber([]);
    expect(disabled.containsSecret(`x ${secret}`)).toBe(false);
    expect(createScrubber([secret]).containsSecret(`x ${secret}`)).toBe(true);
    expect(createScrubber([]).containsSecret('gsk_ABCDEFGHIJKL')).toBe(true);
  });
});

describe('X2-11: thư mục ra', () => {
  it('X2-11: nằm trong một repo git (thư mục có .git, kể cả tệp .git của worktree) thì từ chối', async () => {
    const root = tempDir();
    mkdirSync(join(root, '.git'));
    await expect(runEval(options(join(root, 'ra')), silent())).rejects.toThrow(
      /repo git/,
    );
    const worktree = tempDir();
    writeFileSync(join(worktree, '.git'), 'gitdir: ../elsewhere');
    await expect(
      runEval(options(join(worktree, 'ra')), silent()),
    ).rejects.toThrow(EvalSetupError);
    // Thư mục tạm của hệ điều hành được nhận
    await expect(
      runEval(
        options(join(tempDir(), 'ra'), { includeExtra: false }),
        silent(),
      ),
    ).resolves.toBeDefined();
  });
});

describe('X2-12: tham số, khoá và chốt NODE_ENV', () => {
  it('X2-12: từ chối chạy thật khi NODE_ENV=test', async () => {
    expect(() => assertLiveAllowed('test')).toThrow(EvalSetupError);
    expect(() => assertLiveAllowed('development')).not.toThrow();
    await expect(
      runEval(
        options(tempDir(), { dryRun: false }),
        silent({ keys: { groq: 'gsk_x1234567890' }, nodeEnv: 'test' }),
      ),
    ).rejects.toThrow(/NODE_ENV=test/);
  });

  it('X2-12: chạy thật mà không có khoá nào thì dừng ngay; --only một lớp thiếu khoá cũng dừng', async () => {
    await expect(
      runEval(
        options(tempDir(), { dryRun: false }),
        silent({ keys: {}, nodeEnv: 'development' }),
      ),
    ).rejects.toThrow(/chưa có khoá/);
    await expect(
      runEval(
        options(tempDir(), { dryRun: false, only: 'gemini' }),
        silent({ keys: { groq: 'gsk_x1234567890' }, nodeEnv: 'development' }),
      ),
    ).rejects.toThrow(/lớp gemini/);
  });

  it('X2-12: nạp khoá từ .env GIẢ do test tạo; biến môi trường thắng tệp; không in giá trị', () => {
    const directory = tempDir();
    const envFile = join(directory, 'gia.env');
    writeFileSync(
      envFile,
      'GROQ_API_KEY=gsk_TU_TEP\nGEMINI_API_KEY=AIzaTuTep\nDB_PASSWORD=khong-lien-quan\nGROQ_MODEL=openai/gpt-oss-20b\n',
    );
    const keys = loadKeys(envFile, {
      env: { GROQ_API_KEY: 'gsk_TU_MOI_TRUONG' },
      cwd: directory,
      exists: (path) => path === envFile,
      readFile: (path) => readFileSync(path, 'utf8'),
    });
    expect(keys).toEqual({
      groq: 'gsk_TU_MOI_TRUONG',
      gemini: 'AIzaTuTep',
      groqModel: 'openai/gpt-oss-20b',
    });
    expect(Object.keys(keys)).not.toContain('DB_PASSWORD');
    expect(() =>
      loadKeys(join(directory, 'khong-co.env'), {
        env: {},
        cwd: directory,
        exists: () => false,
        readFile: () => '',
      }),
    ).toThrow(/--env-file/);
    expect(() =>
      loadKeys(null, {
        env: { GROQ_API_KEY: 'có khoảng trắng' },
        cwd: directory,
        exists: () => false,
        readFile: () => '',
      }),
    ).toThrow(/GROQ_API_KEY sai dạng/);
  });

  it('X2-12: tham số dòng lệnh; thiếu --out hay tham số lạ thì báo cách dùng và mã thoát 1', async () => {
    expect(
      parseArgs([
        '--out',
        'x',
        '--only',
        'groq',
        '--groq-used-today',
        '1500',
        '--without-extra',
      ]),
    ).toMatchObject({
      out: 'x',
      only: 'groq',
      groqUsedToday: 1500,
      includeExtra: false,
      dryRun: false,
    });
    expect(parseArgs(['--out', 'x', '--retry-duphong']).resume).toBe(true);
    expect(() => parseArgs([])).toThrow(UsageError);
    expect(() => parseArgs(['--out', 'x', '--only', 'ollama'])).toThrow(
      UsageError,
    );
    expect(() => parseArgs(['--out', 'x', '--gap-ms', '-1'])).toThrow(
      UsageError,
    );
    expect(() => parseArgs(['--out', 'x', '--la'])).toThrow(/tham số lạ/);
    const errors: string[] = [];
    const io: MainIo = {
      env: {},
      cwd: tempDir(),
      stdout: () => undefined,
      stderr: (line) => errors.push(line),
      exists: () => false,
      readFile: () => '',
    };
    expect(await main(['--la'], io)).toBe(1);
    expect(errors.join('\n')).toContain('Dùng: npm run chatbot:eval');
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------------
// Đường THẬT của hai adapter (GroqProvider, GeminiProvider, FetchHttpTransport, FallbackChain) với `fetch` GIẢ: không mạng, khoá là chuỗi giả.

const GROQ_KEY = 'gsk_GIA_KHONG_PHAI_KHOA_THAT';
const GEMINI_KEY = 'AIzaGiaKhongPhaiKhoaThatabc';

interface FakeNetwork {
  readonly fetchImpl: typeof globalThis.fetch;
  readonly urls: string[];
  readonly authorized: { groq: boolean; gemini: boolean };
}

function fakeNetwork(handlers: {
  groq?: (answer: ModelAnswer) => Response;
  gemini?: (answer: ModelAnswer) => Response;
}): FakeNetwork {
  const script = defaultDryRunScript(loadGoldenSet().set);
  const urls: string[] = [];
  const authorized = { groq: false, gemini: false };
  const fetchImpl: typeof globalThis.fetch = (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    urls.push(url);
    const headers = new Headers(init?.headers);
    const body = JSON.parse(
      typeof init?.body === 'string' ? init.body : '{}',
    ) as Record<string, unknown>;
    if (url.includes('groq.com')) {
      authorized.groq = headers.get('authorization') === `Bearer ${GROQ_KEY}`;
      const messages = body.messages as { content: string }[];
      const question = messages[messages.length - 1]?.content ?? '';
      const answer = script('groq', { question } as AiRequest<unknown>);
      if (answer instanceof ProviderError) throw answer;
      return Promise.resolve(
        handlers.groq?.(answer) ?? new Response('', { status: 500 }),
      );
    }
    authorized.gemini = headers.get('x-goog-api-key') === GEMINI_KEY;
    const steps = body.input as { content: { text: string }[] }[];
    const question = steps[steps.length - 1]?.content[0]?.text ?? '';
    const answer = script('gemini', { question } as AiRequest<unknown>);
    if (answer instanceof ProviderError) throw answer;
    return Promise.resolve(
      handlers.gemini?.(answer) ?? new Response('', { status: 500 }),
    );
  };
  return { fetchImpl, urls, authorized };
}

const groqOk = (answer: ModelAnswer): Response =>
  new Response(
    JSON.stringify({
      choices: [
        { message: { role: 'assistant', content: JSON.stringify(answer) } },
      ],
      usage: {
        prompt_tokens: 1700,
        completion_tokens: 100,
        total_tokens: 1800,
      },
    }),
    {
      status: 200,
      headers: {
        'x-ratelimit-remaining-tokens': '6000',
        'x-ratelimit-reset-tokens': '2s',
      },
    },
  );

const geminiOk = (answer: ModelAnswer): Response =>
  new Response(
    JSON.stringify({
      status: 'completed',
      steps: [
        {
          type: 'model_output',
          content: [{ type: 'text', text: JSON.stringify(answer) }],
        },
      ],
      usage: {
        total_input_tokens: 1500,
        total_output_tokens: 80,
        total_tokens: 1580,
      },
    }),
    { status: 200 },
  );

const tooMany = (): Response =>
  new Response('', { status: 429, headers: { 'retry-after': '5' } });

/** Hai đồng hồ ảo nối nhau: bộ giãn lời gọi và chuỗi dự phòng (cooldown 60 giây trôi theo thời gian ảo, không chờ thật). */
function virtualClocks(): {
  paceClock: ReturnType<typeof createVirtualPaceClock>;
  chainClock: Clock;
} {
  const paceClock = createVirtualPaceClock();
  return {
    paceClock,
    chainClock: { now: () => paceClock.now(), setTimer: () => () => undefined },
  };
}

describe('X2-13: đường thật của hai adapter với fetch giả', () => {
  it('X2-13: chuỗi gọi Groq trước; ghi mã, token, header hạn mức; header khoá có trên yêu cầu nhưng KHÔNG vào bản ghi hay tệp ra', async () => {
    const out = tempDir();
    const network = fakeNetwork({ groq: groqOk, gemini: geminiOk });
    const outcome = await runEval(
      options(out, { dryRun: false, includeExtra: false }),
      silent({
        keys: { groq: GROQ_KEY, gemini: GEMINI_KEY },
        nodeEnv: 'development',
        fetchImpl: network.fetchImpl,
        ...virtualClocks(),
      }),
    );
    expect(outcome.exitCode).toBe(0);
    expect(network.authorized.groq).toBe(true);
    expect(
      network.urls.filter(
        (url) =>
          !url.startsWith('https://api.groq.com/openai/v1/chat/completions'),
      ),
    ).toEqual([]);
    expect(network.urls).toHaveLength(23);
    const aiAttempts = outcome.records.filter((record) => record.aiBound);
    expect(aiAttempts).toHaveLength(23);
    expect(
      aiAttempts.every(
        (record) => record.lop === 'groq' && record.kiemTra.ketQua === 'dat',
      ),
    ).toBe(true);
    expect(aiAttempts[0]?.goiHttp[0]).toMatchObject({
      layer: 'groq',
      status: 200,
      tokensIn: 1700,
      tokensOut: 100,
      tokensTotal: 1800,
      remainingTokens: 6000,
      resetMs: 2000,
    });
    expect(aiAttempts[0]?.tokenVao).toBe(1700);
    const results = JSON.parse(read(join(out, 'results.json'))) as {
      tokenGroqDaDungLanChayNay: number;
      thatHayGia: string;
    };
    expect(results.tokenGroqDaDungLanChayNay).toBe(23 * 1800);
    expect(results.thatHayGia).toBe('that');
    for (const file of ['checkpoint.jsonl', 'results.json', 'cham-tay.csv']) {
      const text = read(join(out, file));
      expect(text, file).not.toContain(GROQ_KEY);
      expect(text, file).not.toContain(GEMINI_KEY);
      expect(text, file).not.toContain('Bearer');
    }
    expect(outcome.report.chiSo.find((row) => row.ma === 'N6')?.phanQuyet).toBe(
      'DAT',
    );
  });

  it('X2-13: --only gemini chỉ gọi Gemini (khoá gửi bằng header x-goog-api-key, không ở địa chỉ) và không động tới ngân sách token Groq', async () => {
    const out = tempDir();
    const network = fakeNetwork({ groq: groqOk, gemini: geminiOk });
    const outcome = await runEval(
      options(out, { dryRun: false, only: 'gemini', includeExtra: false }),
      silent({
        keys: { groq: GROQ_KEY, gemini: GEMINI_KEY },
        nodeEnv: 'development',
        fetchImpl: network.fetchImpl,
        ...virtualClocks(),
      }),
    );
    expect(outcome.exitCode).toBe(0);
    expect(network.authorized.gemini).toBe(true);
    expect(
      network.urls.every(
        (url) =>
          url.includes('googleapis.com') &&
          !url.includes(GEMINI_KEY) &&
          !url.includes('key='),
      ),
    ).toBe(true);
    expect(
      outcome.records
        .filter((record) => record.aiBound)
        .every((record) => record.lop === 'gemini'),
    ).toBe(true);
    const results = JSON.parse(read(join(out, 'results.json'))) as {
      tokenGroqDaDungLanChayNay: number;
      che: string;
    };
    expect(results.tokenGroqDaDungLanChayNay).toBe(0);
    expect(results.che).toBe('gemini');
  });

  it('X2-05: Groq trả 429 mãi: chuỗi sang Gemini cho từng câu, nhưng sau ba lần 429 liên tiếp của Groq thì dừng hẳn, mã thoát 3', async () => {
    const out = tempDir();
    const network = fakeNetwork({ groq: tooMany, gemini: geminiOk });
    const outcome = await runEval(
      options(out, { dryRun: false, includeExtra: false }),
      silent({
        keys: { groq: GROQ_KEY, gemini: GEMINI_KEY },
        nodeEnv: 'development',
        fetchImpl: network.fetchImpl,
        ...virtualClocks(),
      }),
    );
    expect(outcome.exitCode).toBe(3);
    expect(outcome.stopReason).toBe('429');
    const aiAttempts = outcome.records.filter((record) => record.aiBound);
    expect(aiAttempts).toHaveLength(3);
    // Mỗi câu: một lời gọi Groq (429, không thử lại) rồi một lời gọi Gemini thành công
    expect(aiAttempts.every((record) => record.lop === 'gemini')).toBe(true);
    expect(
      aiAttempts[0]?.goiHttp.map((call) => [call.layer, call.status]),
    ).toEqual([
      ['groq', 429],
      ['gemini', 200],
    ]);
    expect(aiAttempts[0]?.goiHttp[0]?.retryAfterMs).toBe(5000);
    expect(JSON.parse(read(join(out, 'results.json')))).toMatchObject({
      hoanThanh: false,
      dungVi: '429',
    });
  });

  it('X2-05: hết ngân sách token ngày thì dừng sạch trước câu kế (mã thoát 2) và chạy tiếp được bằng --resume', async () => {
    const out = tempDir();
    const network = fakeNetwork({ groq: groqOk, gemini: geminiOk });
    const first = await runEval(
      options(out, { dryRun: false, includeExtra: false, groqTpd: 5000 }),
      silent({
        keys: { groq: GROQ_KEY },
        nodeEnv: 'development',
        fetchImpl: network.fetchImpl,
        ...virtualClocks(),
      }),
    );
    // 5.000 token chứa được hai lời gọi: ước 2.400 cho câu thứ ba vượt ngân sách (1.800 × 2 + 2.400 > 5.000)
    expect(first.exitCode).toBe(2);
    expect(first.stopReason).toBe('ngan-sach-ngay');
    expect(first.records.filter((record) => record.aiBound)).toHaveLength(2);
    const second = await runEval(
      options(out, { dryRun: false, includeExtra: false, resume: true }),
      silent({
        keys: { groq: GROQ_KEY },
        nodeEnv: 'development',
        fetchImpl: network.fetchImpl,
        ...virtualClocks(),
      }),
    );
    expect(second.exitCode).toBe(0);
    expect(second.records).toHaveLength(30);
  });
});
