import { request } from '../../../shared/api/client';
import { UnexpectedResponseError } from '../../../shared/api/errors';
import type { ShiftCode } from '../../../shared/schedule/shift-labels';
import {
  sortByTime,
  type StateCounts,
} from '../appointments/appointment-group';

// Client RIÊNG của doctor cho hai API lịch hẹn (doctor UX6; G1, G9, G11). Luật WHT-10 cấm `features/doctor` import client của `features/booking`, nên đây là bản
// nhỏ chỉ khai các khoá CẦN DÙNG: KHÔNG khai `nguoiDat`, SĐT, giá, cọc (dữ liệu cá nhân và tiền không cần cho lịch làm việc). Phạm vi do backend quyết: Bác sĩ chỉ
// thấy lịch của chính mình (`GET /doctor/appointments`), Lễ tân theo chi nhánh đọc từ DB (`GET /reception/appointments`); web không gửi và không lọc quyền.

/** Tối đa của `pageSize` ở backend (`MAX_PAGE_SIZE`); vượt là 400. */
export const APPOINTMENTS_PAGE_SIZE = 100;
/** Ngăn kéo Lễ tân đọc tối đa 5 trang (500 dòng) mỗi ngày; nhiều hơn thì báo, không hiện số từng bác sĩ. */
export const MAX_APPOINTMENT_PAGES = 5;

/** Một dòng lịch hẹn đã rút gọn, dùng chung cho hộp Bác sĩ và ngăn kéo Lễ tân. */
export interface AppointmentLine {
  maLichHen: string;
  // ISO 8601 UTC; giờ hiển thị tính theo giờ Việt Nam (`vnTimeOf`)
  thoiGian: string;
  nguoiKham: string;
  dichVu: string;
  trangThai: string;
}

/** Lịch hẹn của MỘT ca: danh sách (có thể bị cắt trang), tổng số lịch khớp và số theo trạng thái. */
export interface ShiftAppointments {
  lines: AppointmentLine[];
  total: number;
  counts: StateCounts;
}

interface DoctorRow {
  maLichHen: string;
  thoiGian: string;
  trangThai: string;
  nguoiKham?: { hoTen?: string };
  dichVu?: string;
}

interface DoctorPage {
  items: DoctorRow[];
  total: number;
  demTheoTrangThai: Record<string, number>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function assertDoctorPage(data: unknown): asserts data is DoctorPage {
  if (
    !isObject(data) ||
    !Array.isArray(data.items) ||
    typeof data.total !== 'number' ||
    !isObject(data.demTheoTrangThai)
  )
    throw new UnexpectedResponseError(200);
}

/**
 * Lịch hẹn của MỘT ca của chính Bác sĩ: MỘT lời gọi, lọc `ca` ở server (theo `lich_lam_viec.ca`, không suy từ giờ). `demTheoTrangThai` tính trên MỌI lịch
 * khớp ngày và ca, không phụ thuộc trang, nên số theo trạng thái đúng cả khi danh sách bị cắt ở 100 dòng.
 */
export async function listDoctorShiftAppointments(
  input: { ngay: string; ca: ShiftCode },
  signal?: AbortSignal,
): Promise<ShiftAppointments> {
  const data = await request<unknown>('/doctor/appointments', {
    query: {
      tuNgay: input.ngay,
      denNgay: input.ngay,
      ca: input.ca,
      sapXep: 'CuNhat',
      page: 1,
      pageSize: APPOINTMENTS_PAGE_SIZE,
    },
    signal,
  });
  assertDoctorPage(data);
  return {
    lines: sortByTime(
      data.items.map((row) => ({
        maLichHen: row.maLichHen,
        thoiGian: row.thoiGian,
        nguoiKham: row.nguoiKham?.hoTen ?? '',
        dichVu: row.dichVu ?? '',
        trangThai: row.trangThai,
      })),
    ),
    total: data.total,
    counts: data.demTheoTrangThai,
  };
}

/** Dòng lịch hẹn của Lễ tân: thêm TÊN bác sĩ và tên chuyên khoa (API không trả id bác sĩ trong dòng) để nhóm theo bác sĩ. */
export interface ReceptionLine extends AppointmentLine {
  bacSi: string;
  chuyenKhoa: string;
}

export interface DayAppointments {
  lines: ReceptionLine[];
  // `total` của API (mọi trạng thái hiển thị); lớn hơn `lines.length` khi `truncated`
  total: number;
  // Quá `MAX_APPOINTMENT_PAGES` trang: chỉ có trang 1, không đủ để thống kê
  truncated: boolean;
}

interface ReceptionRow {
  maLichHen: string;
  thoiGian: string;
  trangThai: string;
  bacSi?: string;
  chuyenKhoa?: string;
  dichVu?: string;
  nguoiKham?: { hoTen?: string };
}

interface ReceptionPage {
  items: ReceptionRow[];
  total: number;
}

function assertReceptionPage(data: unknown): asserts data is ReceptionPage {
  if (
    !isObject(data) ||
    !Array.isArray(data.items) ||
    typeof data.total !== 'number'
  )
    throw new UnexpectedResponseError(200);
}

function toReceptionLine(row: ReceptionRow): ReceptionLine {
  return {
    maLichHen: row.maLichHen,
    thoiGian: row.thoiGian,
    nguoiKham: row.nguoiKham?.hoTen ?? '',
    dichVu: row.dichVu ?? '',
    trangThai: row.trangThai,
    bacSi: row.bacSi ?? '',
    chuyenKhoa: row.chuyenKhoa ?? '',
  };
}

async function receptionPage(
  input: { day: string; bacSiId?: string },
  page: number,
  signal?: AbortSignal,
): Promise<ReceptionPage> {
  const data = await request<unknown>('/reception/appointments', {
    query: {
      tuNgay: input.day,
      denNgay: input.day,
      bacSiId: input.bacSiId,
      page,
      pageSize: APPOINTMENTS_PAGE_SIZE,
    },
    signal,
  });
  assertReceptionPage(data);
  return data;
}

/**
 * Mọi lịch hẹn của MỘT ngày trong chi nhánh của Lễ tân (có thể thu hẹp một bác sĩ). Trang 1 cho biết `total`; trang còn lại gọi SONG SONG (tối đa
 * `MAX_APPOINTMENT_PAGES` trang). Một trang lỗi thì cả lời gọi lỗi: không bao giờ trả số thiếu như thể đủ. Chi nhánh KHÔNG gửi: server đọc từ hồ sơ Lễ tân.
 */
export async function listReceptionDayAppointments(
  input: { day: string; bacSiId?: string },
  signal?: AbortSignal,
): Promise<DayAppointments> {
  const first = await receptionPage(input, 1, signal);
  const pageCount = Math.ceil(first.total / APPOINTMENTS_PAGE_SIZE);
  if (pageCount > MAX_APPOINTMENT_PAGES)
    return {
      lines: first.items.map(toReceptionLine),
      total: first.total,
      truncated: true,
    };
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) =>
      receptionPage(input, index + 2, signal),
    ),
  );
  return {
    lines: [first, ...rest].flatMap((page) => page.items.map(toReceptionLine)),
    total: first.total,
    truncated: false,
  };
}
