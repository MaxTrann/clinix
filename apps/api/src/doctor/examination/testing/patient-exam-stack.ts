import type { DataSource } from 'typeorm';
import type { TrangThaiLichHen } from '../../../admin/entities/enums.js';
import type { BookingFixtures } from '../../../appointments/testing/booking-fixtures.js';
import type { StatusWorld } from '../../../appointments/testing/status-world.js';
import {
  formatCalendarDate,
  parseCalendarDate,
} from '../../../scheduling/calendar-date.js';
import { PatientExamDetailRepository } from '../patient-view/patient-exam-detail.repository.js';
import { PatientExamDetailService } from '../patient-view/patient-exam-detail.service.js';
import {
  PatientExamRecordsQueryDto,
  type PatientExamRecordsQuery,
} from '../patient-view/patient-exam-records.dto.js';
import { PatientExamRecordsRepository } from '../patient-view/patient-exam-records.repository.js';
import { PatientExamRecordsService } from '../patient-view/patient-exam-records.service.js';

// Bộ dựng và đọc dùng chung của int-spec và e2e B4, B5 (doctor-exam; `patient-view/patient-exam-records.int-spec`, `patient-view/patient-exam-detail.int-spec`, `test/doctor-exam-patient-records.e2e-spec`): để jscpd (quét cả `*.int-spec.ts` và `*.e2e-spec.ts`)
// không thấy cùng một đoạn dựng ở nhiều file. Nằm trong `testing/` nên PD-19, HD-08, AR-01 bỏ qua thư mục này (nên được `UPDATE lich_hen SET thoi_gian` thô để đặt giờ tuỳ ý: lịch thật không đổi giờ).

/** `PatientExamRecordsService` THẬT trên MySQL thật. */
export function listService(db: DataSource): PatientExamRecordsService {
  return new PatientExamRecordsService(db, new PatientExamRecordsRepository());
}

/** `PatientExamDetailService` THẬT trên MySQL thật (doctor-exam B5). */
export function detailService(db: DataSource): PatientExamDetailService {
  return new PatientExamDetailService(db, new PatientExamDetailRepository());
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

/**
 * Khoá KHÔNG được có trong CHI TIẾT một lịch (XHS-10, Q19; doctor-exam B5): đánh giá bị ẩn (`biAn`, `lyDoAn`), mọi id nội bộ, liên hệ, giá. Nội dung hồ sơ và đánh giá của chính Bệnh nhân
 * thì ĐƯỢC có ở chi tiết (khác danh sách). Hằng viết tay độc lập với mapper, không lấy từ mã đang kiểm.
 */
export const FORBIDDEN_DETAIL_KEYS = [
  'biAn',
  'lyDoAn',
  'lichHenId',
  'hoSoKhamId',
  'danhGiaId',
  'benhNhanId',
  'bacSiId',
  'hoSoNguoiThanId',
  'chiNhanhId',
  'chuyenKhoaId',
  'khungGioId',
  'trangThai',
  'soDienThoai',
  'email',
  'giaSnapshot',
  'tienCocSnapshot',
  'lyDoKham',
] as const;

async function scalar(
  db: DataSource,
  sql: string,
  id: string,
): Promise<string> {
  const rows = await db.query<{ v: string }[]>(sql, [id]);
  const value = rows[0]?.v;
  if (value === undefined) throw new Error(`Không có dòng cho id ${id}`);
  return value;
}

// Ba hàm đọc DỮ LIỆU MẪU bằng SQL riêng (không gọi mã đang kiểm) để test so tên bác sĩ, chi nhánh, chuyên khoa với giá trị trong DB thay vì chép hằng (doctor-exam B5).
/**
 * Đặt họ tên KHÁC NHAU cho bác sĩ và Bệnh nhân của thế giới test: bộ dựng mặc định cho MỌI tài khoản cùng tên "Nguyễn Văn A" (lần chạy đầu của B5 thấy `capNhatBoi` và tên người khám trùng chữ),
 * nên `capNhatBoi` lấy nhầm tên Bệnh nhân hay người khám (M17) sẽ KHÔNG bị bắt nếu không đặt tên riêng. Trả hai tên.
 */
export async function nameDoctorAndPatient(
  db: DataSource,
  w: Pick<StatusWorld, 'patientId'> & {
    doctor: { account: { taiKhoanId: string } };
  },
): Promise<{ doctorName: string; patientName: string }> {
  const doctorName = 'Bác sĩ Lê Đặc Biệt';
  const patientName = 'Bệnh nhân Phạm Riêng';
  await db.query('UPDATE tai_khoan SET ho_ten = ? WHERE tai_khoan_id = ?', [
    doctorName,
    w.doctor.account.taiKhoanId,
  ]);
  await db.query('UPDATE tai_khoan SET ho_ten = ? WHERE tai_khoan_id = ?', [
    patientName,
    w.patientId,
  ]);
  return { doctorName, patientName };
}

/** Họ tên của một tài khoản (bác sĩ hay Bệnh nhân). */
export const accountName = (db: DataSource, accountId: string) =>
  scalar(
    db,
    'SELECT ho_ten AS v FROM tai_khoan WHERE tai_khoan_id = ?',
    accountId,
  );

/** Tên một chi nhánh. */
export const branchName = (db: DataSource, branchId: string) =>
  scalar(db, 'SELECT ten AS v FROM chi_nhanh WHERE chi_nhanh_id = ?', branchId);

/** Tên chuyên khoa HIỆN TẠI của một bác sĩ. */
export const specialtyName = (db: DataSource, doctorId: string) =>
  scalar(
    db,
    'SELECT ck.ten AS v FROM bac_si bs INNER JOIN chuyen_khoa ck ON ck.chuyen_khoa_id = bs.chuyen_khoa_id WHERE bs.tai_khoan_id = ?',
    doctorId,
  );

/** Mọi tên khoá ở mọi độ sâu của một giá trị JSON, để quét khoá cấm. */
export function keysDeep(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysDeep);
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => [
    key,
    ...keysDeep(child),
  ]);
}
