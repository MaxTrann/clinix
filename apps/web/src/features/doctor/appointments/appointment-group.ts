import type { ShiftCode } from '../../../shared/schedule/shift-labels';
import {
  APPOINTMENT_STATE_LABELS,
  isAppointmentState,
  UNKNOWN_STATE_LABEL,
  type AppointmentState,
} from './appointment-state';

// Hàm THUẦN gộp lịch hẹn theo giờ, ca và trạng thái (doctor UX6; G1, G9, G11; WL-06, WL-08, WL-13). Không DOM, không gọi API, không đọc đồng hồ máy.
// Giờ lịch hẹn là ISO 8601 UTC của API; giờ nghiệp vụ là giờ Việt Nam (UTC + 7), như `todayVn` của `shared/schedule/week.ts`.

const VN_TIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** `HH:mm` theo giờ Việt Nam; chuỗi sai dạng ⇒ `null` (không ném). */
export function vnTimeOf(iso: string): string | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : VN_TIME_FORMAT.format(date);
}

/** Sắp tăng theo giờ; cùng giờ giữ thứ tự gốc (sắp ổn định); giờ sai dạng xuống cuối. Không đổi mảng vào. */
export function sortByTime<T extends { thoiGian: string }>(
  items: readonly T[],
): T[] {
  const stamp = (item: T) => {
    const time = new Date(item.thoiGian).getTime();
    return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
  };
  return [...items].sort((a, b) => stamp(a) - stamp(b));
}

export type StateCounts = Readonly<Record<string, number>>;

export interface StateCount {
  // Một trong sáu trạng thái, hoặc 'Unknown' (mọi mã lạ gộp một mục, không lộ mã thô)
  state: AppointmentState | 'Unknown';
  label: string;
  count: number;
}

/** Số lịch theo mã trạng thái thô của API (mã lạ giữ nguyên mã, `countByState` mới gom). */
export function tallyStates(
  items: readonly { trangThai: string }[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items)
    counts[item.trangThai] = (counts[item.trangThai] ?? 0) + 1;
  return counts;
}

// Thứ tự CỐ ĐỊNH của dòng trạng thái: lịch còn hiệu lực trước, "Đã hủy" ở CUỐI (Đại chọn 23/11/2026)
const LIVE_ORDER: readonly AppointmentState[] = [
  'ChoThanhToan',
  'DaXacNhan',
  'DaTiepDon',
  'HoanThanh',
  'VangMat',
];

/** Danh sách (trạng thái, nhãn, số) theo thứ tự cố định, bỏ trạng thái 0; mọi mã lạ gom vào "Chưa xác định" (trước "Đã hủy"). */
export function countByState(counts: StateCounts): StateCount[] {
  const known = (state: AppointmentState): StateCount => ({
    state,
    label: APPOINTMENT_STATE_LABELS[state],
    count: counts[state] ?? 0,
  });
  const unknown = Object.entries(counts)
    .filter(([code]) => !isAppointmentState(code))
    .reduce((sum, [, count]) => sum + count, 0);
  const list: StateCount[] = LIVE_ORDER.map(known);
  list.push({ state: 'Unknown', label: UNKNOWN_STATE_LABEL, count: unknown });
  list.push(known('DaHuy'));
  return list.filter((entry) => entry.count > 0);
}

/**
 * Tổng và câu mô tả: "3 lịch hẹn: 1 Đã xác nhận · 1 Đã tiếp đón · 1 Hoàn thành · 2 Đã hủy". Tổng KHÔNG tính "Đã hủy" (khung giờ đã trả lại, Đại chọn
 * 23/11/2026) nhưng "Đã hủy" vẫn hiện riêng ở cuối dòng. Không có lịch nào ⇒ "Chưa có lịch hẹn".
 */
export function summarize(counts: StateCounts): {
  total: number;
  text: string;
} {
  const list = countByState(counts);
  if (list.length === 0) return { total: 0, text: 'Chưa có lịch hẹn' };
  const total = list
    .filter((entry) => entry.state !== 'DaHuy')
    .reduce((sum, entry) => sum + entry.count, 0);
  const parts = list
    .map((entry) => `${entry.count} ${entry.label}`)
    .join(' · ');
  return {
    total,
    text:
      total === 0
        ? `Chưa có lịch hẹn · ${parts}`
        : `${total} lịch hẹn: ${parts}`,
  };
}

/** Giờ cắt ca khi không biết giờ ca nào [đề xuất]; khớp giờ hoạt động mẫu 08:00 đến 12:00 và 13:00 đến 17:00. */
export const DEFAULT_BOUNDARY = '12:00';

interface ShiftHours {
  ca: ShiftCode;
  batDau: string | null;
  ketThuc: string | null;
}

// Cắt về `HH:mm` để so chuỗi đúng ("12:00" so với "12:00:00" không được lệch)
const hhmm = (time: string) => time.slice(0, 5);

/**
 * Ranh giới giữa ca sáng và ca chiều của MỘT bác sĩ trong MỘT ngày: giờ kết thúc ca sáng nếu biết; không thì giờ bắt đầu ca chiều; không thì `DEFAULT_BOUNDARY`.
 * `GET /reception/appointments` không có trường `ca` nên Lễ tân tách ca ở web theo giờ.
 */
export function shiftBoundary(shifts: readonly ShiftHours[]): string {
  const morningEnd = shifts.find(
    (shift) => shift.ca === 'CaSang' && shift.ketThuc !== null,
  )?.ketThuc;
  if (morningEnd) return hhmm(morningEnd);
  const afternoonStart = shifts.find(
    (shift) => shift.ca === 'CaChieu' && shift.batDau !== null,
  )?.batDau;
  if (afternoonStart) return hhmm(afternoonStart);
  return DEFAULT_BOUNDARY;
}

/** Ca của một giờ (`HH:mm`): NỬA MỞ, giờ < ranh giới là sáng, còn lại (kể cả khe giữa hai ca) là chiều. */
export function caOf(time: string, boundary: string): ShiftCode {
  return time < boundary ? 'CaSang' : 'CaChieu';
}

export interface DayLine {
  // `bacSi` là TÊN và `chuyenKhoa` là tên: API Lễ tân không trả id bác sĩ trong dòng lịch hẹn
  bacSi: string;
  chuyenKhoa: string;
  thoiGian: string;
  trangThai: string;
}

export interface DayDoctor {
  bacSiId: string;
  hoTen: string;
  chuyenKhoa: string;
  ca: readonly (ShiftHours & { ngay: string })[];
}

export interface DayGroups {
  // Khoá `${bacSiId}|${ca}` ⇒ số lịch theo mã trạng thái; không có khoá ⇒ chưa có lịch
  counts: Map<string, Record<string, number>>;
  // Bác sĩ KHÔNG thể phân biệt với bác sĩ khác trùng tên và chuyên khoa (có lịch hẹn khớp): không gán số cho ai, giao diện hiện "—"
  ambiguous: Set<string>;
}

const doctorKey = (name: string, specialty: string) =>
  `${name}\u0001${specialty}`;

/** Nhóm lịch hẹn của MỘT ngày theo (bác sĩ, ca) cho ngăn kéo "Chi tiết ngày" của Lễ tân. Lịch của bác sĩ không có trong lưới bị bỏ qua. */
export function groupDay(
  lines: readonly DayLine[],
  doctors: readonly DayDoctor[],
  day: string,
): DayGroups {
  const byKey = new Map<string, DayDoctor[]>();
  for (const doctor of doctors) {
    const key = doctorKey(doctor.hoTen, doctor.chuyenKhoa);
    byKey.set(key, [...(byKey.get(key) ?? []), doctor]);
  }

  const counts = new Map<string, Record<string, number>>();
  const ambiguous = new Set<string>();
  for (const line of lines) {
    const owners = byKey.get(doctorKey(line.bacSi, line.chuyenKhoa));
    if (owners === undefined) continue;
    if (owners.length > 1) {
      for (const owner of owners) ambiguous.add(owner.bacSiId);
      continue;
    }
    const time = vnTimeOf(line.thoiGian);
    if (time === null) continue;
    const doctor = owners[0];
    const boundary = shiftBoundary(
      doctor.ca.filter((shift) => shift.ngay === day),
    );
    const bucketKey = `${doctor.bacSiId}|${caOf(time, boundary)}`;
    const bucket = counts.get(bucketKey) ?? {};
    bucket[line.trangThai] = (bucket[line.trangThai] ?? 0) + 1;
    counts.set(bucketKey, bucket);
  }
  return { counts, ambiguous };
}

/** Số lịch hẹn còn thiếu khi danh sách bị cắt (không âm). */
export function missingCount(total: number, shown: number): number {
  return Math.max(0, total - shown);
}
