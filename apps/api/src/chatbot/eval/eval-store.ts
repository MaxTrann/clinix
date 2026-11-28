import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { AttemptRecord } from './eval-metrics.js';
import { finalAttempt } from './eval-metrics.js';
import type { Truth } from './eval-world.js';
import { truthTable } from './eval-world.js';
import type { GoldenSet } from './golden-set.js';

// Ghi kết quả của bộ câu hỏi chuẩn ra đĩa (chatbot X2): checkpoint từng câu, `results.json`, bảng chấm tay `cham-tay.csv`. KHÔNG BAO GIỜ ghi khoá:
// mọi chuỗi đi qua bộ che trước khi xuống đĩa. Thư mục ra phải NẰM NGOÀI repo git (kết quả có câu trả lời của mô hình, không được vô tình commit).

export class EvalSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvalSetupError';
  }
}

/** Có `.git` ở thư mục này hay thư mục cha nào không (cả thư mục lẫn tệp, vì worktree dùng tệp `.git`). */
export function isInsideGitRepo(directory: string): boolean {
  let current = resolve(directory);
  for (;;) {
    if (existsSync(join(current, '.git'))) return true;
    const parent = dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

const SECRET_PATTERNS: readonly RegExp[] = [
  /gsk_[A-Za-z0-9]{8,}/g,
  /AIza[0-9A-Za-z_-]{8,}/g,
  /\bAQ\.[0-9A-Za-z_-]{8,}/g,
];

export const REDACTED = '[khoá]';

export interface Scrubber {
  scrub(text: string): string;
  /** Chuỗi có chứa khoá (giá trị đã khai hay mẫu khoá quen thuộc) không. */
  containsSecret(text: string): boolean;
  /** Bộ che đệ quy trên mọi chuỗi của giá trị JSON. */
  scrubDeep<T>(value: T): T;
}

export function createScrubber(secrets: readonly string[]): Scrubber {
  const literals = secrets
    .filter((secret) => secret !== '')
    .sort((a, b) => b.length - a.length);
  const scrub = (text: string): string => {
    let result = text;
    for (const secret of literals) result = result.split(secret).join(REDACTED);
    for (const pattern of SECRET_PATTERNS)
      result = result.replace(pattern, REDACTED);
    return result;
  };
  const containsSecret = (text: string): boolean =>
    literals.some((secret) => text.includes(secret)) ||
    SECRET_PATTERNS.some((pattern) => new RegExp(pattern.source).test(text));
  const scrubDeep = <T>(value: T): T => {
    if (typeof value === 'string') return scrub(value) as T;
    if (Array.isArray(value))
      return value.map((entry: unknown) => scrubDeep(entry)) as T;
    if (typeof value === 'object' && value !== null) {
      const copy: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(value))
        copy[scrub(key)] = scrubDeep(entry);
      return copy as T;
    }
    return value;
  };
  return { scrub, containsSecret, scrubDeep };
}

/** Cấu hình một lần chạy, ghi ở dòng đầu của checkpoint; `--resume` từ chối khi khác. */
export interface RunConfig {
  readonly phienBan: 1;
  readonly thatHayGia: 'that' | 'gia';
  readonly che: 'chuoi' | 'groq' | 'gemini';
  readonly modelGroq: string;
  readonly modelGemini: string;
  readonly goldenSha256: string;
  readonly promptSha256: string;
  readonly coMucPhu: boolean;
  readonly node: string;
  readonly batDau: string;
}

export type CheckpointLine =
  { readonly kind: 'run'; readonly config: RunConfig } | AttemptRecord;

/** Lý do không chạy tiếp được (hoặc `null` nếu cấu hình khớp). */
export function configMismatch(
  previous: RunConfig,
  current: RunConfig,
): string | null {
  const keys = [
    'thatHayGia',
    'che',
    'modelGroq',
    'modelGemini',
    'goldenSha256',
    'promptSha256',
    'coMucPhu',
  ] as const;
  for (const key of keys) {
    if (previous[key] !== current[key]) return `khác ở ${key}`;
  }
  return null;
}

export class EvalStore {
  readonly checkpointPath: string;
  readonly resultsPath: string;
  readonly gradingPath: string;

  constructor(
    readonly outDir: string,
    private readonly scrubber: Scrubber,
  ) {
    this.checkpointPath = join(outDir, 'checkpoint.jsonl');
    this.resultsPath = join(outDir, 'results.json');
    this.gradingPath = join(outDir, 'cham-tay.csv');
  }

  /** Chốt thư mục ra: nằm trong repo git thì từ chối; chưa có thì tạo. */
  prepare(): void {
    if (isInsideGitRepo(this.outDir)) {
      throw new EvalSetupError(
        `thư mục --out nằm trong một repo git: ${this.outDir}; hãy chọn thư mục ngoài repo`,
      );
    }
    mkdirSync(this.outDir, { recursive: true });
  }

  hasCheckpoint(): boolean {
    return existsSync(this.checkpointPath);
  }

  append(line: CheckpointLine): void {
    appendFileSync(
      this.checkpointPath,
      `${this.scrubber.scrub(JSON.stringify(this.scrubber.scrubDeep(line)))}\n`,
      'utf8',
    );
  }

  /** Đọc lại checkpoint. Dòng cuối dở dang (ngắt giữa lúc ghi) bị bỏ qua. */
  readLines(): CheckpointLine[] {
    if (!this.hasCheckpoint()) return [];
    const rows = readFileSync(this.checkpointPath, 'utf8')
      .split('\n')
      .filter((row) => row.trim() !== '');
    const lines: CheckpointLine[] = [];
    rows.forEach((row, index) => {
      try {
        lines.push(JSON.parse(row) as CheckpointLine);
      } catch {
        if (index !== rows.length - 1)
          throw new EvalSetupError(
            `checkpoint hỏng ở dòng ${String(index + 1)}`,
          );
      }
    });
    return lines;
  }

  writeResults(value: unknown): void {
    this.writeAtomically(
      this.resultsPath,
      JSON.stringify(this.scrubber.scrubDeep(value), null, 2),
    );
  }

  writeGrading(csv: string): void {
    this.writeAtomically(this.gradingPath, this.scrubber.scrub(csv));
  }

  private writeAtomically(path: string, text: string): void {
    const temp = `${path}.tmp`;
    writeFileSync(temp, text, 'utf8');
    renameSync(temp, path);
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Bảng chấm tay

const BOM = '﻿';

export function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

const csvRow = (fields: readonly string[]): string =>
  fields.map(csvField).join(',');

function renderAnswer(attempt: AttemptRecord | undefined): string {
  if (attempt === undefined) return '(chưa chạy)';
  return attempt.doan.map((piece) => piece.chu).join('');
}

const VERDICT_TEXT = {
  dat: 'đạt',
  khong: 'không đạt',
  chuaDo: 'chưa đo',
  khongTinh: 'không tính',
} as const;

/**
 * Bảng chấm cho HAI người (Đại và Trung): mỗi câu một dòng với câu trả lời và hai ô chấm TRỐNG; mười mẫu kiểm tay CB2; bảng dữ liệu chuẩn để đối chiếu.
 * Tôi (phiên Claude) không điền ô chấm. UTF-8 có BOM để Excel đọc đúng tiếng Việt.
 */
export function buildGradingCsv(
  set: GoldenSet,
  records: readonly AttemptRecord[],
  truth: Truth,
  samples: readonly string[],
): string {
  const rows: string[] = [];
  const specialtyNames = (ids: readonly string[]): string =>
    ids
      .map(
        (id) =>
          `${truth.values.get(`CK:${id}`)?.chu ?? 'chuyên khoa lạ'} (${id})`,
      )
      .join('; ');
  rows.push(
    csvRow([
      'Mã',
      'Nhóm',
      'Câu hỏi',
      'Lịch sử',
      'Câu trả lời',
      'Kết quả',
      'Tự động',
      'Chuyên khoa gợi ý',
      'Lớp',
      'Ghi chú chấm tay của bộ chuẩn',
      'Đại chấm (Đúng/Sai)',
      'Trung chấm (Đúng/Sai)',
      'Ghi chú hai người',
    ]),
  );
  const items = [
    ...set.cau.map((item) => ({
      ma: item.ma,
      nhom: item.nhom as string,
      cauHoi: item.cauHoi,
      lichSu: item.lichSu,
      note: item.chamTay,
    })),
    ...set.phu.map((item) => ({
      ma: item.ma,
      nhom: 'phu',
      cauHoi: item.cauHoi,
      lichSu: item.lichSu,
      note: item.mucDich,
    })),
  ];
  for (const item of items) {
    const attempt = finalAttempt(records, item.ma);
    rows.push(
      csvRow([
        item.ma,
        item.nhom,
        item.cauHoi,
        (item.lichSu ?? [])
          .map((turn) => `${turn.vai}: ${turn.noiDung}`)
          .join('\n'),
        renderAnswer(attempt),
        attempt?.ketQua ?? '',
        attempt === undefined
          ? ''
          : `${VERDICT_TEXT[attempt.kiemTra.ketQua]}${attempt.kiemTra.lyDo.length > 0 ? `: ${attempt.kiemTra.lyDo.join('; ')}` : ''}`,
        attempt === undefined ? '' : specialtyNames(attempt.chuyenKhoaIds),
        attempt?.lop ?? '',
        item.note,
        '',
        '',
        '',
      ]),
    );
  }

  rows.push('');
  rows.push(
    csvRow([
      'CB2: mười mẫu kiểm tay (đối chiếu giá, bác sĩ, giờ nhận khám với bảng dữ liệu chuẩn bên dưới)',
    ]),
  );
  rows.push(
    csvRow([
      'Mã',
      'Câu trả lời',
      'Giá trị chuẩn liên quan',
      'Đại đối chiếu (Khớp/Lệch)',
      'Trung đối chiếu (Khớp/Lệch)',
      'Ghi chú',
    ]),
  );
  for (const ma of samples) {
    const attempt = finalAttempt(records, ma);
    const item = set.cau.find((candidate) => candidate.ma === ma);
    const expected = (item?.kyVong.nhac ?? []).map(
      (key) => `${key} = ${truth.values.get(key)?.chu ?? '(không có)'}`,
    );
    const related =
      expected.length > 0
        ? expected.join('\n')
        : attempt === undefined
          ? ''
          : specialtyNames(attempt.chuyenKhoaIds);
    rows.push(csvRow([ma, renderAnswer(attempt), related, '', '', '']));
  }

  rows.push('');
  rows.push(
    csvRow(['Bảng dữ liệu chuẩn (chữ do máy chủ dựng từ dữ liệu mẫu)']),
  );
  rows.push(csvRow(['Khoá', 'Giá trị']));
  for (const [key, value] of truthTable(truth)) rows.push(csvRow([key, value]));
  return `${BOM}${rows.join('\r\n')}\r\n`;
}
