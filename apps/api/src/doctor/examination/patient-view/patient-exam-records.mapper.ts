import type {
  ExamineeOption,
  MonthCounts,
  PatientExamRecordItem,
} from './patient-exam-records.dto.js';
import { MONTHS_PER_YEAR } from './patient-exam-records.rules.js';

// Hàng thô của câu SQL ⇒ hình dạng trả về (doctor-exam B4; PLAN 5.6; XHS-02). Hàm THUẦN, không DB. Danh sách trắng: từng khoá được gán tường minh, không `...row`.

/** Hàng thô của câu trang. `thoiGian` là `Date` (driver `+07:00`); biểu thức logic ra `0/1` hay chuỗi tuỳ driver nên đọc bằng `Number(...)`. */
export interface ExamRecordRow {
  maLichHen: string;
  thoiGian: Date;
  chuyenKhoa: string;
  bacSiHoTen: string;
  chucDanh: string;
  nguoiKhamHoTen: string;
  /** NULL khi người khám là bản thân (LEFT JOIN hồ sơ người thân) */
  quanHe: string | null;
  coHoSoKham: number | string;
  daDanhGia: number | string;
}

/** Hàng thô của câu lựa chọn người khám: `id` là BIGINT ra chuỗi, NULL = bản thân. */
export interface ExamineeRow {
  id: string | null;
  hoTen: string;
  quanHe: string | null;
}

/** MỘT hàng của câu 12 tháng: cột `m1` đến `m12` (tổng ra chuỗi hay số tuỳ driver). */
export type MonthCountsRow = Record<string, number | string | null>;

const asFlag = (value: number | string): boolean => Number(value) === 1;

export function toItem(row: ExamRecordRow): PatientExamRecordItem {
  return {
    maLichHen: row.maLichHen,
    thoiGian: row.thoiGian.toISOString(),
    chuyenKhoa: row.chuyenKhoa,
    bacSi: { hoTen: row.bacSiHoTen, chucDanh: row.chucDanh },
    nguoiKham: { hoTen: row.nguoiKhamHoTen, quanHe: row.quanHe },
    coHoSoKham: asFlag(row.coHoSoKham),
    daDanhGia: asFlag(row.daDanhGia),
  };
}

export function toExaminee(row: ExamineeRow): ExamineeOption {
  return {
    id: row.id === null ? null : String(row.id),
    hoTen: row.hoTen,
    quanHe: row.quanHe,
  };
}

/** Đủ 12 khoá `"1"` đến `"12"`; cột thiếu hay NULL là 0. */
export function toMonthCounts(row: MonthCountsRow | undefined): MonthCounts {
  const counts: MonthCounts = {};
  for (let month = 1; month <= MONTHS_PER_YEAR; month += 1) {
    counts[String(month)] = Number(row?.[`m${month}`] ?? 0);
  }
  return counts;
}
