import type { DataSource } from 'typeorm';
import type { TrangThaiLichHen } from '../../../admin/entities/enums.js';
import type { BookingFixtures } from '../../../appointments/testing/booking-fixtures.js';
import type { StatusWorld } from '../../../appointments/testing/status-world.js';
import {
  formatCalendarDate,
  parseCalendarDate,
} from '../../../scheduling/calendar-date.js';
import {
  PatientExamRecordsQueryDto,
  type PatientExamRecordsQuery,
} from '../patient-view/patient-exam-records.dto.js';
import { PatientExamRecordsRepository } from '../patient-view/patient-exam-records.repository.js';
import { PatientExamRecordsService } from '../patient-view/patient-exam-records.service.js';

// Bộ dựng và đọc dùng chung của int-spec và e2e B4 (doctor-exam; `patient-view/patient-exam-records.int-spec`, `test/doctor-exam-patient-records.e2e-spec`): để jscpd (quét cả `*.int-spec.ts` và `*.e2e-spec.ts`)
// không thấy cùng một đoạn dựng ở nhiều file. Nằm trong `testing/` nên PD-19, HD-08, AR-01 bỏ qua thư mục này (nên được `UPDATE lich_hen SET thoi_gian` thô để đặt giờ tuỳ ý: lịch thật không đổi giờ).

/** `PatientExamRecordsService` THẬT trên MySQL thật. */
export function listService(db: DataSource): PatientExamRecordsService {
  return new PatientExamRecordsService(db, new PatientExamRecordsRepository());
}

/**
 * Query của service: giá trị mặc định (`page` 1, `pageSize` 20) và `offset` lấy từ getter THẬT của `PatientExamRecordsQueryDto`, không tính lại công thức ở test: nhờ vậy
 * một `offset` sai trong DTO (M10 của B4: `page * pageSize`) làm đỏ cả int-spec, không chỉ dto.spec và e2e (tăng cường SAU khi lượt đột biến thấy int xanh dưới M10).
 */
export function listQuery(
  overrides: Partial<Omit<PatientExamRecordsQuery, 'offset'>> = {},
): PatientExamRecordsQuery {
  const query = Object.assign(new PatientExamRecordsQueryDto(), overrides);
  return {
    nguoiKham: query.nguoiKham,
    nam: query.nam,
    thang: query.thang,
    page: query.page,
    pageSize: query.pageSize,
    offset: query.offset,
  };
}

type Visit = Awaited<ReturnType<BookingFixtures['appointmentIn']>>;

export interface VisitOptions {
  /** Mặc định Bệnh nhân của thế giới test */
  patientId?: string;
  /** Mặc định `null` = khám cho bản thân */
  hoSoNguoiThanId?: string | null;
}

// Ngày kế tiếp còn trống của bác sĩ trong MỖI thế giới test (mỗi ca test dựng thế giới mới): mỗi bác sĩ chỉ có MỘT ca sáng mỗi ngày (UNIQUE), nên lần gọi thứ hai trong cùng một ca phải đi tiếp, không bắt đầu lại.
const nextFreeDay = new WeakMap<StatusWorld, number>();

/** `count` khung giờ `ConTrong` MỚI của bác sĩ của thế giới test: mỗi ca sáng (8 ô) là một ngày liên tiếp từ 11/11/2026 (không đụng 8 ô của ngày 10/11), các lần gọi sau đi tiếp ngày trước. */
export async function freeSlots(
  fx: BookingFixtures,
  w: StatusWorld,
  count: number,
): Promise<string[]> {
  const slots: string[] = [];
  let day = nextFreeDay.get(w) ?? parseCalendarDate('2026-11-11') ?? 0;
  while (slots.length < count) {
    const { slotIds } = await fx.doctor.shiftWithSlots(w.doctor.profile, {
      ngay: formatCalendarDate(day),
      ca: 'CaSang',
    });
    slots.push(...slotIds);
    day += 1;
  }
  nextFreeDay.set(w, day);
  return slots.slice(0, count);
}

/** Một lịch ở `state` trên khung giờ `khungGioId` (dựng qua `appointmentIn`: khung giờ nhất quán với trạng thái). */
export function visit(
  fx: BookingFixtures,
  w: StatusWorld,
  state: Parameters<BookingFixtures['appointmentIn']>[0],
  khungGioId: string,
  options: VisitOptions = {},
): Promise<Visit> {
  return fx.appointmentIn(state, {
    doctor: w.doctor.profile,
    khungGioId,
    patientId: options.patientId ?? w.patientId,
    hoSoNguoiThanId: options.hoSoNguoiThanId ?? null,
  });
}

/** `count` lịch `HoanThanh` mới (theo thứ tự tạo, id tăng dần) cho cùng một người khám. */
export async function completedVisits(
  fx: BookingFixtures,
  w: StatusWorld,
  count: number,
  options: VisitOptions = {},
): Promise<Visit[]> {
  const visits: Visit[] = [];
  for (const slot of await freeSlots(fx, w, count))
    visits.push(await visit(fx, w, 'HoanThanh', slot, options));
  return visits;
}

export interface VisitSpec extends VisitOptions {
  /** Mặc định `HoanThanh` */
  state?: TrangThaiLichHen;
  /** Giờ khám `YYYY-MM-DD HH:mm:ss` giờ VN; vắng ⇒ giờ của khung giờ */
  at?: string;
}

/** Dựng các lịch theo TÊN (`{ a1: { at: '2026-11-03 09:00:00' }, r1: { hoSoNguoiThanId } }`), theo thứ tự khai báo (id tăng dần); khoá nào cũng có giá trị nên test không phải `!`. */
export async function seedVisits<K extends string>(
  db: DataSource,
  fx: BookingFixtures,
  w: StatusWorld,
  plan: Record<K, VisitSpec>,
): Promise<Record<K, Visit>> {
  const names = Object.keys(plan) as K[];
  const slots = await freeSlots(fx, w, names.length);
  const seeded = {} as Record<K, Visit>;
  for (const [index, name] of names.entries()) {
    const spec = plan[name];
    const slot = slots[index];
    if (slot === undefined) throw new Error('thiếu khung giờ');
    const lich = await visit(fx, w, spec.state ?? 'HoanThanh', slot, spec);
    if (spec.at !== undefined) await setVisitTime(db, lich.lichHenId, spec.at);
    seeded[name] = lich;
  }
  return seeded;
}

/** Đặt giờ khám (chuỗi `YYYY-MM-DD HH:mm:ss` giờ VN, không qua `Date`): để dựng 23:30 ngày cuối tháng, năm nhuận, cùng giờ cho nhiều lịch. Chỉ test dùng. */
export async function setVisitTime(
  db: DataSource,
  lichHenId: string,
  at: string,
): Promise<void> {
  await db.query('UPDATE lich_hen SET thoi_gian = ? WHERE lich_hen_id = ?', [
    at,
    lichHenId,
  ]);
}

/** Khoá KHÔNG được có trong danh sách (XHS-02, XHS-10): nội dung hồ sơ, đánh giá ẩn, id nội bộ. */
export const FORBIDDEN_LIST_KEYS = [
  'trieuChung',
  'chanDoanSoBo',
  'huongXuLy',
  'ghiChuKham',
  'hoSoKham',
  'danhGia',
  'soSao',
  'nhanXet',
  'biAn',
  'lyDoAn',
  'lichHenId',
  'benhNhanId',
  'hoSoNguoiThanId',
  'soDienThoai',
  'email',
] as const;

/** Mọi tên khoá ở mọi độ sâu của một giá trị JSON, để quét khoá cấm. */
export function keysDeep(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysDeep);
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => [
    key,
    ...keysDeep(child),
  ]);
}
