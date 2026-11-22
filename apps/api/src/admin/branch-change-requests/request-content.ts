import type { ScheduleRowValue } from '../branches/impact/branch-diff.js';

// Đọc `noi_dung_truoc` / `noi_dung_sau` của yêu cầu thay đổi chi nhánh (admin B9; quy tắc 43). HÀM THUẦN, không đọc DB.
// Dạng hiện hành (B8 ghi): `lich_hoat_dong` là mảng các dòng của thứ đổi, đủ 6 khóa, khoảng không có ghi `null`; `dich_vu_kham_ids` (nếu dịch vụ đổi) là danh sách ĐẦY ĐỦ.
// Dạng cũ `gio_mo_cua` / `gio_dong_cua` chỉ còn ở yêu cầu đã xử lý (lịch sử, CN-87): vẫn hiển thị được nhưng KHÔNG tính lại ảnh hưởng được.
// JSON đọc từ DB không được tin về cấu trúc (DB không kiểm, quy tắc 43): khóa lạ bị bỏ qua, giá trị sai kiểu thành `null`, không ném lỗi.

export interface PeriodView {
  batDau: string;
  ketThuc: string;
}

/** Một thứ ở một phía (trước hoặc sau). `dangCu` chỉ có với dạng cũ. */
export interface DayView {
  hoatDong: boolean | null;
  sang: PeriodView | null;
  chieu: PeriodView | null;
  dangCu?: { gioMoCua: string | null; gioDongCua: string | null };
}

export interface DayChangeView {
  thuTrongTuan: number;
  truoc: DayView | null;
  sau: DayView | null;
}

export interface ParsedContent {
  /** Các thứ đổi, sắp theo thứ */
  lichHoatDong: DayChangeView[];
  /** `null` = yêu cầu không đổi dịch vụ */
  dichVu: { truoc: string[]; sau: string[] } | null;
  /** Có ít nhất một dòng dạng cũ ⇒ không tính lại ảnh hưởng được */
  coDangCu: boolean;
}

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;
const bool = (value: unknown): boolean | null =>
  typeof value === 'boolean'
    ? value
    : value === 1
      ? true
      : value === 0
        ? false
        : null;
const period = (start: unknown, end: unknown): PeriodView | null => {
  const batDau = text(start);
  const ketThuc = text(end);
  return batDau !== null && ketThuc !== null ? { batDau, ketThuc } : null;
};
const isOldRow = (row: Json): boolean =>
  'gio_mo_cua' in row || 'gio_dong_cua' in row;

function dayOf(row: Json): DayView {
  if (isOldRow(row))
    return {
      hoatDong: bool(row.hoat_dong),
      sang: null,
      chieu: null,
      dangCu: {
        gioMoCua: text(row.gio_mo_cua),
        gioDongCua: text(row.gio_dong_cua),
      },
    };
  return {
    hoatDong: bool(row.hoat_dong),
    sang: period(row.gio_bat_dau_sang, row.gio_ket_thuc_sang),
    chieu: period(row.gio_bat_dau_chieu, row.gio_ket_thuc_chieu),
  };
}

/** Các dòng có `thu_trong_tuan` 1..7 hợp lệ, theo thứ. Dòng hỏng bị bỏ qua. */
function rowsByDay(content: unknown): Map<number, Json> {
  const rows = new Map<number, Json>();
  const list = isObject(content) ? content.lich_hoat_dong : undefined;
  if (!Array.isArray(list)) return rows;
  for (const row of list) {
    if (!isObject(row)) continue;
    const day = row.thu_trong_tuan;
    if (
      typeof day === 'number' &&
      Number.isInteger(day) &&
      day >= 1 &&
      day <= 7
    )
      rows.set(day, row);
  }
  return rows;
}

function serviceIds(content: unknown): string[] | null {
  const list = isObject(content) ? content.dich_vu_kham_ids : undefined;
  if (!Array.isArray(list)) return null;
  return list.flatMap((id) =>
    typeof id === 'string' || typeof id === 'number' ? [String(id)] : [],
  );
}

// Cột JSON: tuỳ driver trả object hay chuỗi; chuỗi hỏng coi như rỗng
function asJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

export function parseRequestContent(
  truoc: unknown,
  sau: unknown,
): ParsedContent {
  const before = rowsByDay(asJson(truoc));
  const after = rowsByDay(asJson(sau));
  const days = [...new Set([...before.keys(), ...after.keys()])].sort(
    (a, b) => a - b,
  );
  const servicesBefore = serviceIds(asJson(truoc));
  const servicesAfter = serviceIds(asJson(sau));
  return {
    lichHoatDong: days.map((thuTrongTuan) => {
      const b = before.get(thuTrongTuan);
      const a = after.get(thuTrongTuan);
      return {
        thuTrongTuan,
        truoc: b ? dayOf(b) : null,
        sau: a ? dayOf(a) : null,
      };
    }),
    dichVu:
      servicesBefore === null && servicesAfter === null
        ? null
        : { truoc: servicesBefore ?? [], sau: servicesAfter ?? [] },
    coDangCu: [...before.values(), ...after.values()].some(isOldRow),
  };
}

/** Thứ đổi của yêu cầu (cho danh sách), theo thứ. */
export function changedDaysOf(content: ParsedContent): number[] {
  return content.lichHoatDong.map((day) => day.thuTrongTuan);
}

/**
 * Đầu vào cho `BranchImpactService.compute` (Q46: tính lại khi xem). Chỉ gọi khi `coDangCu = false`.
 * Thứ chỉ có ở phía trước (dữ liệu hỏng) bị bỏ qua; dịch vụ bỏ = có ở trước mà không có ở sau.
 */
export function impactInputOf(content: ParsedContent): {
  changedDays: ScheduleRowValue[];
  removedServiceIds: string[];
} {
  const changedDays = content.lichHoatDong.flatMap(({ thuTrongTuan, sau }) =>
    sau === null
      ? []
      : [
          {
            thuTrongTuan,
            hoatDong: sau.hoatDong,
            gioBatDauSang: sau.sang?.batDau ?? null,
            gioKetThucSang: sau.sang?.ketThuc ?? null,
            gioBatDauChieu: sau.chieu?.batDau ?? null,
            gioKetThucChieu: sau.chieu?.ketThuc ?? null,
          },
        ],
  );
  const after = new Set(content.dichVu?.sau ?? []);
  const removedServiceIds = (content.dichVu?.truoc ?? []).filter(
    (id) => !after.has(id),
  );
  return { changedDays, removedServiceIds };
}
