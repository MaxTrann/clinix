import type { ShiftCode } from '../../../shared/schedule/shift-labels';
import {
  listDoctorShiftAppointments,
  listReceptionDayAppointments,
  type DayAppointments,
  type ShiftAppointments,
} from '../api/appointments-api';
import type { ReceptionDoctorRow, ReceptionShift } from '../api/reception-api';
import { useLoad, type LoadState } from '../reception/use-reception-data';
import {
  caOf,
  shiftBoundary,
  tallyStates,
  vnTimeOf,
} from './appointment-group';

// Hook tải lịch hẹn của ca và của ngày (doctor UX6). Dùng lại `useLoad` của lịch Lễ tân: gọi lại khi `key` đổi hoặc `retry`, HUỶ yêu cầu cũ khi đóng hộp
// hay đổi ca (kết quả muộn không ghi đè). Mỗi hộp chỉ gọi MỘT lần cho mỗi (ngày, ca) đang mở.

/** Lịch hẹn của MỘT ca của chính Bác sĩ (`GET /doctor/appointments`, lọc `ca` ở server). */
export function useDoctorShiftAppointments(ngay: string, ca: ShiftCode) {
  return useLoad<ShiftAppointments>(
    (signal) => listDoctorShiftAppointments({ ngay, ca }, signal),
    `doctor-shift:${ngay}:${ca}`,
  );
}

/**
 * Lịch hẹn của MỘT ca của MỘT bác sĩ (ngăn kéo "Chi tiết ca" của Lễ tân). API Lễ tân không có tham số ca, nên lấy cả ngày của bác sĩ rồi tách theo giờ:
 * ranh giới là của CHÍNH các ca bác sĩ đó trong ngày (`shiftBoundary`).
 */
export function useReceptionShiftAppointments(
  doctor: ReceptionDoctorRow,
  shift: ReceptionShift,
) {
  return useLoad<ShiftAppointments>(async (signal) => {
    const day = await listReceptionDayAppointments(
      { day: shift.ngay, bacSiId: doctor.bacSiId },
      signal,
    );
    const boundary = shiftBoundary(
      doctor.ca.filter((item) => item.ngay === shift.ngay),
    );
    const lines = day.lines.filter((line) => {
      const time = vnTimeOf(line.thoiGian);
      return time !== null && caOf(time, boundary) === shift.ca;
    });
    return {
      lines,
      // Bị cắt (quá 500 lịch trong MỘT ngày của MỘT bác sĩ: không xảy ra với dữ liệu thật) thì báo số còn thiếu thay vì giả vờ đủ
      total: day.truncated ? day.total : lines.length,
      counts: tallyStates(lines),
    };
  }, `reception-shift:${doctor.bacSiId}:${shift.ngay}:${shift.ca}`);
}

/** Lịch hẹn của MỘT ngày trong chi nhánh của Lễ tân (ngăn kéo "Chi tiết ngày"). */
export function useReceptionDayAppointments(day: string): {
  state: LoadState<DayAppointments>;
  retry: () => void;
} {
  return useLoad<DayAppointments>(
    (signal) => listReceptionDayAppointments({ day }, signal),
    `reception-day:${day}`,
  );
}
