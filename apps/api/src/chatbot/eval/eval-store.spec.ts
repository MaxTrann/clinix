import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AttemptRecord } from './eval-metrics.js';
import {
  EvalSetupError,
  EvalStore,
  REDACTED,
  buildGradingCsv,
  configMismatch,
  createScrubber,
  csvField,
  isInsideGitRepo,
  type RunConfig,
} from './eval-store.js';
import { SampleWorld, buildTruth } from './eval-world.js';
import { loadGoldenSet } from './golden-set.js';

// Test của lớp ghi tệp ra đĩa: bộ che khoá, thư mục ra ngoài repo, checkpoint, bảng chấm tay (chatbot X2). Thư mục tạm của hệ điều hành, không khoá thật.

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function tempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), 'clinix-x2-store-'));
  directories.push(directory);
  return directory;
}

const { set } = loadGoldenSet();

const config: RunConfig = {
  phienBan: 1,
  thatHayGia: 'that',
  che: 'chuoi',
  modelGroq: 'openai/gpt-oss-20b',
  modelGemini: 'gemini-3.5-flash-lite',
  goldenSha256: 'a'.repeat(64),
  promptSha256: 'b'.repeat(64),
  coMucPhu: true,
  node: 'v22.0.0',
  batDau: '2026-11-28T00:00:00.000Z',
};

function attempt(
  ma: string,
  extra: Partial<AttemptRecord> = {},
): AttemptRecord {
  return {
    kind: 'attempt',
    ma,
    phu: false,
    nhom: 'A',
    lan: 1,
    aiBound: true,
    coLichSu: false,
    ketQua: 'TraLoi',
    maLoi: null,
    loai: 'hoiDap',
    lop: 'groq',
    luat: null,
    thoiGianMs: 900,
    daCho: 0,
    goiHttp: [],
    tokenVao: 1800,
    tokenRa: 100,
    chuyenKhoaIds: [],
    thucThe: [],
    kinSo: true,
    tenThucThe: true,
    kiemTra: { ketQua: 'dat', lyDo: [] },
    doan: [{ kieu: 'chu', chu: 'Chào bạn' }],
    ...extra,
  };
}

describe('X2-07: bộ che khoá', () => {
  it('X2-07: che mọi xuất hiện của giá trị khoá (khoá dài trước), kể cả trong khoá của đối tượng; bỏ qua khoá rỗng', () => {
    const scrubber = createScrubber(['gsk_ABC', 'gsk_ABC_DAI_HON', '']);
    expect(scrubber.scrub('a gsk_ABC_DAI_HON b gsk_ABC c')).toBe(
      `a ${REDACTED} b ${REDACTED} c`,
    );
    expect(scrubber.scrub('không có gì')).toBe('không có gì');
    expect(
      scrubber.scrubDeep({
        gsk_ABC: ['x gsk_ABC y', 1, null, { z: 'gsk_ABC' }],
      }),
    ).toEqual({
      [REDACTED]: [`x ${REDACTED} y`, 1, null, { z: REDACTED }],
    });
  });

  it('X2-07: mẫu khoá quen thuộc bị che dù chưa khai (gsk_, AIza, AQ.)', () => {
    const scrubber = createScrubber([]);
    expect(
      scrubber.scrub('gsk_abcdefghijkl AIzaSyabcdefghij AQ.abcdefghijkl'),
    ).toBe(`${REDACTED} ${REDACTED} ${REDACTED}`);
    expect(scrubber.containsSecret('xin chào')).toBe(false);
    expect(scrubber.containsSecret('gsk_abcdefghijkl')).toBe(true);
    // Chuỗi ngắn hơn mẫu không bị coi là khoá
    expect(scrubber.scrub('gsk_ab')).toBe('gsk_ab');
  });
});

describe('X2-11: thư mục ra', () => {
  it('X2-11: nhận ra repo git (thư mục .git, tệp .git của worktree, thư mục cha xa hơn); thư mục tạm thì không', () => {
    const root = tempDir();
    expect(isInsideGitRepo(root)).toBe(false);
    mkdirSync(join(root, '.git'));
    mkdirSync(join(root, 'a', 'b', 'c'), { recursive: true });
    expect(isInsideGitRepo(join(root, 'a', 'b', 'c'))).toBe(true);
    const worktree = tempDir();
    writeFileSync(join(worktree, '.git'), 'gitdir: x');
    expect(isInsideGitRepo(worktree)).toBe(true);
  });

  it('X2-11: prepare tạo thư mục ngoài repo và từ chối thư mục trong repo (không tạo gì)', () => {
    const root = tempDir();
    const store = new EvalStore(join(root, 'ra', 'lan-1'), createScrubber([]));
    store.prepare();
    expect(existsSync(join(root, 'ra', 'lan-1'))).toBe(true);
    const repo = tempDir();
    mkdirSync(join(repo, '.git'));
    const bad = new EvalStore(join(repo, 'ra'), createScrubber([]));
    expect(() => bad.prepare()).toThrow(EvalSetupError);
    expect(existsSync(join(repo, 'ra'))).toBe(false);
  });
});

describe('X2-06: checkpoint', () => {
  it('X2-06: ghi từng dòng, đọc lại đúng thứ tự, khoá bị che trong cả khoá lẫn giá trị', () => {
    const store = new EvalStore(
      tempDir(),
      createScrubber(['gsk_BI_MAT_RIENG']),
    );
    store.prepare();
    expect(store.hasCheckpoint()).toBe(false);
    expect(store.readLines()).toEqual([]);
    store.append({ kind: 'run', config });
    store.append(
      attempt('G01', {
        doan: [{ kieu: 'chu', chu: 'khoá gsk_BI_MAT_RIENG lộ' }],
      }),
    );
    const raw = readFileSync(store.checkpointPath, 'utf8');
    expect(raw).not.toContain('gsk_BI_MAT_RIENG');
    expect(raw.endsWith('\n')).toBe(true);
    const lines = store.readLines();
    expect(lines.map((line) => line.kind)).toEqual(['run', 'attempt']);
  });

  it('X2-06: dòng cuối dở dang (ngắt giữa lúc ghi) bị bỏ qua, nhưng dòng hỏng ở GIỮA là lỗi', () => {
    const store = new EvalStore(tempDir(), createScrubber([]));
    store.prepare();
    store.append({ kind: 'run', config });
    store.append(attempt('G01'));
    appendFileSync(store.checkpointPath, '{"kind":"attempt","ma":"G02"');
    expect(store.readLines()).toHaveLength(2);
    const broken = new EvalStore(tempDir(), createScrubber([]));
    broken.prepare();
    writeFileSync(
      broken.checkpointPath,
      `{"hỏng":\n${JSON.stringify({ kind: 'run', config })}\n`,
    );
    expect(() => broken.readLines()).toThrow(/dòng 1/);
  });

  it('X2-06: writeResults ghi nguyên tử (không để lại tệp .tmp) và che khoá', () => {
    const store = new EvalStore(
      tempDir(),
      createScrubber(['gsk_BI_MAT_RIENG']),
    );
    store.prepare();
    store.writeResults({ ghiChu: 'có gsk_BI_MAT_RIENG', so: 3 });
    expect(JSON.parse(readFileSync(store.resultsPath, 'utf8'))).toEqual({
      ghiChu: `có ${REDACTED}`,
      so: 3,
    });
    store.writeGrading('"a","gsk_BI_MAT_RIENG"');
    expect(readFileSync(store.gradingPath, 'utf8')).not.toContain(
      'gsk_BI_MAT_RIENG',
    );
    expect(
      readdirSync(store.outDir).filter((name) => name.endsWith('.tmp')),
    ).toEqual([]);
  });

  it('X2-06: configMismatch nêu đúng trường khác; cùng cấu hình khác thời điểm bắt đầu và phiên bản Node thì khớp', () => {
    expect(
      configMismatch(config, { ...config, batDau: 'khác', node: 'v99' }),
    ).toBeNull();
    expect(configMismatch(config, { ...config, che: 'groq' })).toBe(
      'khác ở che',
    );
    expect(configMismatch(config, { ...config, modelGroq: 'model-khac' })).toBe(
      'khác ở modelGroq',
    );
    expect(
      configMismatch(config, { ...config, goldenSha256: 'c'.repeat(64) }),
    ).toBe('khác ở goldenSha256');
    expect(
      configMismatch(config, { ...config, promptSha256: 'c'.repeat(64) }),
    ).toBe('khác ở promptSha256');
    expect(configMismatch(config, { ...config, thatHayGia: 'gia' })).toBe(
      'khác ở thatHayGia',
    );
    expect(configMismatch(config, { ...config, coMucPhu: false })).toBe(
      'khác ở coMucPhu',
    );
  });
});

describe('X2-08: bảng chấm tay', () => {
  it('X2-08: csvField thoát dấu nháy kép, giữ xuống dòng và tiếng Việt', () => {
    expect(csvField('a "b"\nc đ')).toBe('"a ""b""\nc đ"');
  });

  it('X2-08: mỗi câu một dòng với ô chấm trống; câu chưa chạy ghi rõ; có khối mẫu CB2 và bảng dữ liệu chuẩn; BOM; CRLF', async () => {
    const truth = await buildTruth(new SampleWorld());
    const records = [
      attempt('G05', {
        doan: [
          {
            kieu: 'thucThe',
            doiTuong: 'BacSi',
            id: '14',
            chu: 'ThS.BS. Nguyễn Thị Lan',
          },
          { kieu: 'chu', chu: ' thu phí "500.000 đồng".' },
        ],
      }),
      attempt('G09', {
        nhom: 'B',
        ketQua: 'GoiY',
        lop: 'gemini',
        chuyenKhoaIds: ['1', '2'],
        kiemTra: { ketQua: 'khong', lyDo: ['sai'] },
      }),
    ];
    const csv = buildGradingCsv(set, records, truth, ['G05']);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('\r\n');
    const main = csv.split('\r\n\r\n')[0] ?? '';
    const rows = main.split('\r\n');
    expect(rows).toHaveLength(36);
    expect(rows[0]).toContain('Đại chấm (Đúng/Sai)');
    const g05 = rows.find((row) => row.startsWith('"G05"')) ?? '';
    expect(g05).toContain('ThS.BS. Nguyễn Thị Lan thu phí ""500.000 đồng"".');
    expect(g05).toContain('"TraLoi"');
    expect(g05.endsWith(',"","",""')).toBe(true);
    const g09 = rows.find((row) => row.startsWith('"G09"')) ?? '';
    expect(g09).toContain('không đạt: sai');
    expect(g09).toContain('Cơ Xương Khớp (1); Thần kinh (2)');
    expect(g09).toContain('"gemini"');
    const g10 = rows.find((row) => row.startsWith('"G10"')) ?? '';
    expect(g10).toContain('(chưa chạy)');
    expect(csv).toContain('CB2: mười mẫu kiểm tay');
    expect(csv).toContain('BS:14 = ThS.BS. Nguyễn Thị Lan');
    expect(csv).toContain('GIA:14 = 500.000 đồng');
    expect(csv).toContain('Bảng dữ liệu chuẩn');
    expect(csv).toContain('"GIO:3"');
  });
});
