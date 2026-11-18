import {
  CONFIG_KEYS,
  CONFIG_PARAMS,
  type ConfigKey,
} from './system-config-params.js';

// Dựng một mục của tab "Lịch sử thay đổi" từ dòng nhật ký `CapNhatCauHinh` (admin B6; PLAN admin Q37; TRACKING 9A.4 mục 2.1).
// Hàm THUẦN, không DB, không log: lý do là chữ tự do của Quản trị viên.
// Hợp đồng ghi của B5 (`SystemConfigAdminService.record`): `chi_tiet_thay_doi = { truoc, sau, ly_do }`, khoá của `truoc`/`sau` là TÊN CỘT,
// giá trị là số hoặc mảng số (lần tạo đầu: `truoc` là null ở từng khoá). CHECK DB ép hình dạng, nhưng KHÔNG ép kiểu giá trị,
// nên mapper không tin dữ liệu: khoá lạ hoặc giá trị sai kiểu bị bỏ khỏi `thayDoi`, còn cả dòng thì luôn được giữ (để `total` đúng số dòng).

/** Một dòng đọc từ DB: `id` là BIGINT ra chuỗi, `changes` là cột JSON đã parse (KHÔNG tin hình dạng). */
export interface HistoryRow {
  id: string;
  thoiDiem: Date;
  hoTen: string;
  changes: unknown;
}

type HistoryValue = number | number[];

/** Một tham số có đổi: `khoa` là khoá camelCase giống `GET`/`PUT /admin/system-config`; `truoc` là null khi đó là lần tạo đầu. */
export interface ConfigChange {
  khoa: ConfigKey;
  truoc: HistoryValue | null;
  sau: HistoryValue;
}

export interface SystemConfigHistoryItem {
  id: string;
  thoiDiem: string;
  nguoiThucHien: string;
  lyDo: string;
  thayDoi: ConfigChange[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Số hữu hạn hoặc mảng số hữu hạn; mọi thứ khác (chuỗi, object, mảng lẫn chuỗi, null) là `undefined`.
function valueOf(raw: unknown): HistoryValue | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (
    Array.isArray(raw) &&
    raw.every((item) => typeof item === 'number' && Number.isFinite(item))
  )
    return [...(raw as number[])];
  return undefined;
}

// Duyệt theo CONFIG_KEYS (thứ tự biểu mẫu), không theo thứ tự khoá của JSON: MySQL chuẩn hoá thứ tự khoá JSON nên không dựa vào nó được.
function changesOf(truoc: unknown, sau: unknown): ConfigChange[] {
  if (!isRecord(truoc) || !isRecord(sau)) return [];
  const result: ConfigChange[] = [];
  for (const khoa of CONFIG_KEYS) {
    const column = CONFIG_PARAMS[khoa].column;
    if (!Object.hasOwn(truoc, column) || !Object.hasOwn(sau, column)) continue;
    const after = valueOf(sau[column]);
    if (after === undefined) continue;
    // null là hợp lệ ở `truoc` (lần tạo đầu); giá trị sai kiểu khác thì bỏ cả khoá
    const rawBefore = truoc[column];
    const before = rawBefore === null ? null : valueOf(rawBefore);
    if (before === undefined) continue;
    result.push({ khoa, truoc: before, sau: after });
  }
  return result;
}

export function mapHistoryRow(row: HistoryRow): SystemConfigHistoryItem {
  const changes = isRecord(row.changes) ? row.changes : {};
  return {
    id: row.id,
    thoiDiem: row.thoiDiem.toISOString(),
    nguoiThucHien: row.hoTen,
    lyDo: typeof changes['ly_do'] === 'string' ? changes['ly_do'] : '',
    thayDoi: changesOf(changes['truoc'], changes['sau']),
  };
}
