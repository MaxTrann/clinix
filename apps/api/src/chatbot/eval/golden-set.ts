import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isBigintId } from '../../appointments/lists/list-query.rules.js';
import type { AskOutcome } from '../ask/ask.dto.js';
import {
  HISTORY_MAX_TURNS,
  HISTORY_TURN_MAX_CODE_POINTS,
  QUESTION_MAX_CODE_POINTS,
  codePointLength,
  type HistoryTurn,
} from '../safety/question-normalizer.js';

// Bộ câu hỏi chuẩn của Trợ lý AI (chatbot X2; PLAN chatbot 5.15). File này CHỈ đọc và kiểm tra `golden-set.json`; nội dung câu hỏi nằm ở file JSON
// (nguồn duy nhất, Đại duyệt 28/11/2026). Câu là dữ liệu TỔNG HỢP, không có dữ liệu thật.
// Hàm thuần ngoài `loadGoldenSet` (đọc một file cục bộ). Không mạng, không biến môi trường.

export type GoldenGroup = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

/** Cơ cấu của PLAN 5.15: hỏi đáp 8, gợi ý 8, ngoài phạm vi 5, khẩn cấp 4, chèn lệnh 3, không có dữ liệu 2 (tổng 30). */
export const GROUP_SIZES: Readonly<Record<GoldenGroup, number>> = {
  A: 8,
  B: 8,
  C: 5,
  D: 4,
  E: 3,
  F: 2,
};

export const GROUPS: readonly GoldenGroup[] = ['A', 'B', 'C', 'D', 'E', 'F'];

/** Tên nhóm theo PLAN 5.15 (dùng ở bảng tóm tắt và bảng chấm tay). */
export const GROUP_NAMES: Readonly<Record<GoldenGroup, string>> = {
  A: 'Hỏi – đáp dữ liệu',
  B: 'Gợi ý đặt lịch',
  C: 'Ngoài phạm vi',
  D: 'Khẩn cấp',
  E: 'Chèn lệnh, lộ lời nhắc',
  F: 'Dữ liệu không có',
};

/** Điều kiện đạt TỰ ĐỘNG của một câu (chấm tay ghi riêng ở `chamTay`). Mọi trường ngoài `ketQua` là tuỳ chọn. */
export interface GoldenExpectation {
  /** `ketQua` được chấp nhận. */
  readonly ketQua: readonly AskOutcome[];
  /** Chỗ giữ `LOẠI:id` mà câu trả lời phải dùng (kiểm bằng giá trị do bộ đọc thật dựng từ dữ liệu mẫu). */
  readonly nhac?: readonly string[];
  /** Tập id chuyên khoa chấp nhận: `chuyenKhoaGoiY` phải giao với tập này. */
  readonly chapNhan?: readonly string[];
  /** Câu trả lời phải có chữ "115". */
  readonly canCo115?: boolean;
  /** Không lộ lời nhắc, mã chim mồi, dấu hiệu khối dữ liệu hay chỗ giữ thô. */
  readonly khongLoLoiNhac?: boolean;
  /** Không có chữ cấm (miễn phí, giảm giá, khuyến mãi). */
  readonly khongChuCam?: boolean;
  /** Không có đường dẫn. */
  readonly khongUrl?: boolean;
}

export interface GoldenItem {
  readonly ma: string;
  readonly nhom: GoldenGroup;
  readonly cauHoi: string;
  readonly lichSu?: readonly HistoryTurn[];
  readonly kyVong: GoldenExpectation;
  /** Ghi chú cho hai người chấm tay. */
  readonly chamTay: string;
}

/** Mục phụ: ngoài 30 câu, không vào N6 và CB1 đến CB6; chỉ báo. */
export interface ExtraItem {
  readonly ma: string;
  readonly cauHoi: string;
  readonly lichSu?: readonly HistoryTurn[];
  readonly mucDich: string;
  /** Gợi ý chỗ giữ cho người chấm tham khảo (không tính đạt hay không). */
  readonly goiYNhac: readonly string[];
}

export interface GoldenSet {
  readonly phienBan: number;
  readonly moTa: string;
  readonly cau: readonly GoldenItem[];
  readonly phu: readonly ExtraItem[];
}

const OUTCOMES: readonly AskOutcome[] = [
  'TraLoi',
  'GoiY',
  'NgoaiPhamVi',
  'KhanCap',
  'TaiKhoan',
  'KhongKhopDuLieu',
  'KhongCoChuyenKhoa',
  'DuPhong',
];

const PLACEHOLDER_KEY = /^(CK|BS|GIA|CN|DC|GIO|DV|GIADV|COC|TL|HOAN):[1-9]\d*$/;
const MAIN_CODE = /^G(\d{2})$/;

export class GoldenSetError extends Error {
  constructor(message: string) {
    super(`bộ câu hỏi chuẩn không hợp lệ: ${message}`);
    this.name = 'GoldenSetError';
  }
}

function fail(message: string): never {
  throw new GoldenSetError(message);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function readString(
  record: Record<string, unknown>,
  key: string,
  where: string,
): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim() === '') {
    return fail(`${where}.${key} phải là chuỗi không rỗng`);
  }
  return value;
}

function readStringList(
  record: Record<string, unknown>,
  key: string,
  where: string,
  required: boolean,
): readonly string[] | undefined {
  const value = record[key];
  if (value === undefined) {
    return required ? fail(`${where}.${key} bắt buộc`) : undefined;
  }
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== 'string')
  ) {
    return fail(`${where}.${key} phải là mảng chuỗi`);
  }
  return value as string[];
}

function readFlag(
  record: Record<string, unknown>,
  key: string,
  where: string,
): boolean | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean')
    return fail(`${where}.${key} phải là true hoặc false`);
  return value;
}

function parseHistory(
  raw: unknown,
  where: string,
): readonly HistoryTurn[] | undefined {
  if (raw === undefined) return undefined;
  if (
    !Array.isArray(raw) ||
    raw.length === 0 ||
    raw.length > HISTORY_MAX_TURNS
  ) {
    return fail(
      `${where}.lichSu phải có từ 1 đến ${String(HISTORY_MAX_TURNS)} lượt`,
    );
  }
  return raw.map((turn: unknown, index) => {
    const at = `${where}.lichSu[${String(index)}]`;
    if (!isRecord(turn)) return fail(`${at} phải là đối tượng`);
    const vai = turn.vai;
    if (vai !== 'NguoiDung' && vai !== 'TroLy') return fail(`${at}.vai lạ`);
    const noiDung = readString(turn, 'noiDung', at);
    if (codePointLength(noiDung) > HISTORY_TURN_MAX_CODE_POINTS) {
      return fail(
        `${at}.noiDung quá ${String(HISTORY_TURN_MAX_CODE_POINTS)} điểm mã`,
      );
    }
    return { vai, noiDung };
  });
}

function parseQuestion(record: Record<string, unknown>, where: string): string {
  const text = readString(record, 'cauHoi', where);
  if (codePointLength(text) > QUESTION_MAX_CODE_POINTS) {
    return fail(
      `${where}.cauHoi quá ${String(QUESTION_MAX_CODE_POINTS)} điểm mã`,
    );
  }
  return text;
}

function parseExpectation(raw: unknown, where: string): GoldenExpectation {
  if (!isRecord(raw)) return fail(`${where}.kyVong phải là đối tượng`);
  const outcomes = readStringList(raw, 'ketQua', `${where}.kyVong`, true) ?? [];
  if (outcomes.length === 0)
    return fail(`${where}.kyVong.ketQua không được rỗng`);
  for (const outcome of outcomes) {
    if (!(OUTCOMES as readonly string[]).includes(outcome)) {
      return fail(`${where}.kyVong.ketQua có giá trị lạ "${outcome}"`);
    }
  }
  const nhac = readStringList(raw, 'nhac', `${where}.kyVong`, false);
  for (const key of nhac ?? []) {
    if (!PLACEHOLDER_KEY.test(key))
      return fail(`${where}.kyVong.nhac có chỗ giữ sai dạng "${key}"`);
  }
  const chapNhan = readStringList(raw, 'chapNhan', `${where}.kyVong`, false);
  for (const id of chapNhan ?? []) {
    const label: string = id;
    if (!isBigintId(id))
      return fail(`${where}.kyVong.chapNhan có id sai dạng "${label}"`);
  }
  const canCo115 = readFlag(raw, 'canCo115', `${where}.kyVong`);
  const khongLoLoiNhac = readFlag(raw, 'khongLoLoiNhac', `${where}.kyVong`);
  const khongChuCam = readFlag(raw, 'khongChuCam', `${where}.kyVong`);
  const khongUrl = readFlag(raw, 'khongUrl', `${where}.kyVong`);
  return {
    ketQua: outcomes as AskOutcome[],
    ...(nhac === undefined ? {} : { nhac }),
    ...(chapNhan === undefined ? {} : { chapNhan }),
    ...(canCo115 === undefined ? {} : { canCo115 }),
    ...(khongLoLoiNhac === undefined ? {} : { khongLoLoiNhac }),
    ...(khongChuCam === undefined ? {} : { khongChuCam }),
    ...(khongUrl === undefined ? {} : { khongUrl }),
  };
}

function parseMainItem(raw: unknown, index: number): GoldenItem {
  const where = `cau[${String(index)}]`;
  if (!isRecord(raw)) return fail(`${where} phải là đối tượng`);
  const ma = readString(raw, 'ma', where);
  const nhom = raw.nhom;
  if (
    typeof nhom !== 'string' ||
    !(GROUPS as readonly string[]).includes(nhom)
  ) {
    return fail(`${where}.nhom phải là một trong ${GROUPS.join(', ')}`);
  }
  const lichSu = parseHistory(raw.lichSu, where);
  return {
    ma,
    nhom: nhom as GoldenGroup,
    cauHoi: parseQuestion(raw, where),
    ...(lichSu === undefined ? {} : { lichSu }),
    kyVong: parseExpectation(raw.kyVong, where),
    chamTay: readString(raw, 'chamTay', where),
  };
}

function parseExtraItem(raw: unknown, index: number): ExtraItem {
  const where = `phu[${String(index)}]`;
  if (!isRecord(raw)) return fail(`${where} phải là đối tượng`);
  const goiYNhac = readStringList(raw, 'goiYNhac', where, true) ?? [];
  for (const key of goiYNhac) {
    if (!PLACEHOLDER_KEY.test(key))
      return fail(`${where}.goiYNhac có chỗ giữ sai dạng "${key}"`);
  }
  const lichSu = parseHistory(raw.lichSu, where);
  return {
    ma: readString(raw, 'ma', where),
    cauHoi: parseQuestion(raw, where),
    ...(lichSu === undefined ? {} : { lichSu }),
    mucDich: readString(raw, 'mucDich', where),
    goiYNhac,
  };
}

/** Kiểm cấu trúc, cơ cấu 8 + 8 + 5 + 4 + 3 + 2, mã `G01…G30` liền nhau không trùng, mã phụ không trùng. Sai thì ném `GoldenSetError`. */
export function parseGoldenSet(raw: unknown): GoldenSet {
  if (!isRecord(raw)) return fail('gốc phải là đối tượng');
  const phienBan = raw.phienBan;
  if (
    typeof phienBan !== 'number' ||
    !Number.isInteger(phienBan) ||
    phienBan < 1
  ) {
    return fail('phienBan phải là số nguyên dương');
  }
  if (!Array.isArray(raw.cau)) return fail('cau phải là mảng');
  if (!Array.isArray(raw.phu)) return fail('phu phải là mảng');
  const cau = raw.cau.map((entry: unknown, index) =>
    parseMainItem(entry, index),
  );
  const phu = raw.phu.map((entry: unknown, index) =>
    parseExtraItem(entry, index),
  );

  const total = Object.values(GROUP_SIZES).reduce((sum, size) => sum + size, 0);
  if (cau.length !== total)
    return fail(
      `phải có đúng ${String(total)} câu, đang có ${String(cau.length)}`,
    );
  for (const group of GROUPS) {
    const count = cau.filter((item) => item.nhom === group).length;
    if (count !== GROUP_SIZES[group]) {
      return fail(
        `nhóm ${group} phải có ${String(GROUP_SIZES[group])} câu, đang có ${String(count)}`,
      );
    }
  }
  cau.forEach((item, index) => {
    const expected = `G${String(index + 1).padStart(2, '0')}`;
    if (item.ma !== expected || !MAIN_CODE.test(item.ma)) {
      fail(
        `câu thứ ${String(index + 1)} phải mang mã ${expected}, đang là "${item.ma}"`,
      );
    }
  });
  const extraCodes = new Set<string>();
  for (const item of phu) {
    if (extraCodes.has(item.ma) || MAIN_CODE.test(item.ma))
      fail(`mã phụ "${item.ma}" trùng hay lẫn với mã chính`);
    extraCodes.add(item.ma);
  }
  const questions = new Set<string>();
  for (const item of [...cau, ...phu]) {
    const key = item.cauHoi.normalize('NFC').trim().toLowerCase();
    if (questions.has(key)) fail(`câu hỏi của ${item.ma} trùng một câu khác`);
    questions.add(key);
  }
  return {
    phienBan,
    moTa: typeof raw.moTa === 'string' ? raw.moTa : '',
    cau,
    phu,
  };
}

/**
 * Đường dẫn tới `golden-set.json` nằm ở `src/`, vì `tsc` không sao chép JSON sang `dist/` (không `resolveJsonModule`, `nest-cli.json` không có `assets`).
 * `src/chatbot/eval/` và `dist/chatbot/eval/` cùng độ sâu nên cùng một đường đi tương đối tới `apps/api/src/chatbot/eval/golden-set.json`.
 */
export function defaultGoldenSetPath(): string {
  return fileURLToPath(
    new URL('../../../src/chatbot/eval/golden-set.json', import.meta.url),
  );
}

export interface LoadedGoldenSet {
  readonly set: GoldenSet;
  /** SHA-256 của nội dung file đã đổi CRLF về LF (gắn với chữ, không với kiểu xuống dòng khi checkout); kiểm `--resume` và khoá nội dung sau khi duyệt. */
  readonly sha256: string;
}

export function loadGoldenSet(
  path: string = defaultGoldenSetPath(),
): LoadedGoldenSet {
  const text = readFileSync(path, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail('file không phải JSON');
  }
  return {
    set: parseGoldenSet(parsed),
    sha256: createHash('sha256')
      .update(text.replace(/\r\n/g, '\n'))
      .digest('hex'),
  };
}

/**
 * Thứ tự chạy: XEN KẼ NHÓM (A1, B1, C1, D1, E1, F1, A2, B2, …) để sự cố giữa chừng không dồn vào một nhóm (nếp X1). Mục phụ chạy sau cùng.
 * Trả mọi mục, mỗi mục kèm cờ `phu`.
 */
export interface RunItem {
  readonly ma: string;
  readonly phu: boolean;
  readonly nhom: GoldenGroup | 'phu';
  readonly cauHoi: string;
  readonly lichSu?: readonly HistoryTurn[];
  readonly main?: GoldenItem;
  readonly extra?: ExtraItem;
}

export function runOrder(
  set: GoldenSet,
  options: { includeExtra: boolean },
): RunItem[] {
  const buckets = GROUPS.map((group) =>
    set.cau.filter((item) => item.nhom === group),
  );
  const longest = Math.max(...buckets.map((bucket) => bucket.length));
  const order: RunItem[] = [];
  for (let round = 0; round < longest; round += 1) {
    for (const bucket of buckets) {
      const item = bucket[round];
      if (item === undefined) continue;
      order.push({
        ma: item.ma,
        phu: false,
        nhom: item.nhom,
        cauHoi: item.cauHoi,
        ...(item.lichSu === undefined ? {} : { lichSu: item.lichSu }),
        main: item,
      });
    }
  }
  if (options.includeExtra) {
    for (const item of set.phu) {
      order.push({
        ma: item.ma,
        phu: true,
        nhom: 'phu',
        cauHoi: item.cauHoi,
        ...(item.lichSu === undefined ? {} : { lichSu: item.lichSu }),
        extra: item,
      });
    }
  }
  return order;
}
