import { DataSource, type EntityManager } from 'typeorm';
import {
  BranchHoursReader,
  hoursKey,
} from '../../scheduling/branch-hours/branch-hours.reader.js';
import { shiftWindow } from '../../scheduling/branch-hours/shift-window.rules.js';
import { checkSlotWithinBranchHours } from '../../scheduling/branch-hours/slot-hours.rules.js';
import {
  formatHHMM,
  isoWeekdayOf,
} from '../../scheduling/branch-hours/time-of-day.js';
import type { CaLamViec } from '../../scheduling/branch-hours/branch-hours.types.js';
import { generateSlotStarts } from '../../scheduling/slots/slot-generator.rules.js';

// Bất biến IV-01…IV-04 của module doctor (PLAN mục 7.9), chạy trên DB thật SAU mỗi ca đồng thời.
// Mỗi hàm trả danh sách vi phạm; rỗng = đúng. Chỉ ĐỌC, không ghi.
type Db = DataSource | EntityManager;
export type Violation = Record<string, unknown>;

/** IV-01 (I-1): mọi ca có `ngay >= today` mang chi nhánh = chi nhánh hiện tại của bác sĩ. */
export async function checkBranchInvariant(
  db: Db,
  today: string,
): Promise<Violation[]> {
  return db.query(
    `SELECT l.lich_lam_viec_id AS lichLamViecId, l.chi_nhanh_id AS caChiNhanhId, b.chi_nhanh_id AS bacSiChiNhanhId
     FROM lich_lam_viec l JOIN bac_si b ON b.tai_khoan_id = l.bac_si_id
     WHERE l.ngay >= ? AND l.chi_nhanh_id <> b.chi_nhanh_id ORDER BY l.lich_lam_viec_id`,
    [today],
  );
}

interface ShiftRow {
  lichLamViecId: string;
  chiNhanhId: string;
  ngay: string;
  ca: CaLamViec;
  thoiLuong: number;
}

/** Ca (từ `fromDate`) kèm các khung giờ của nó, giờ dạng 'YYYY-MM-DD HH:MM:SS' (đọc bằng DATE_FORMAT, không lệch múi giờ). */
async function loadShiftsWithSlots(db: Db, fromDate: string) {
  const shifts: ShiftRow[] = await db.query(
    `SELECT l.lich_lam_viec_id AS lichLamViecId, l.chi_nhanh_id AS chiNhanhId, DATE_FORMAT(l.ngay, '%Y-%m-%d') AS ngay,
            l.ca AS ca, d.thoi_luong AS thoiLuong
     FROM lich_lam_viec l JOIN bac_si b ON b.tai_khoan_id = l.bac_si_id
     JOIN dich_vu_kham d ON d.dich_vu_kham_id = b.dich_vu_kham_id
     WHERE l.ngay >= ? ORDER BY l.lich_lam_viec_id`,
    [fromDate],
  );
  const slots: { shiftId: string; khungGioId: string; gio: string }[] =
    await db.query(
      `SELECT k.lich_lam_viec_id AS shiftId, k.khung_gio_id AS khungGioId, DATE_FORMAT(k.ngay_gio, '%Y-%m-%d %H:%i:%s') AS gio
       FROM khung_gio k JOIN lich_lam_viec l ON l.lich_lam_viec_id = k.lich_lam_viec_id
       WHERE l.ngay >= ? ORDER BY k.ngay_gio`,
      [fromDate],
    );
  const hours = await new BranchHoursReader().loadMany(
    db instanceof DataSource ? db.manager : db,
    shifts.map((s) => ({
      chiNhanhId: String(s.chiNhanhId),
      thuTrongTuan: isoWeekdayOf(s.ngay),
    })),
  );
  return shifts.map((shift) => ({
    shift,
    slots: slots.filter(
      (s) => String(s.shiftId) === String(shift.lichLamViecId),
    ),
    day: hours.get(
      hoursKey({
        chiNhanhId: String(shift.chiNhanhId),
        thuTrongTuan: isoWeekdayOf(shift.ngay),
      }),
    ),
  }));
}

/** IV-02: mọi ca có đủ khung giờ theo `generateSlotStarts` (không thiếu, không thừa), theo giờ hoạt động hiện hành. */
export async function checkSlotCompleteness(
  db: Db,
  fromDate: string,
): Promise<Violation[]> {
  const violations: Violation[] = [];
  for (const { shift, slots, day } of await loadShiftsWithSlots(db, fromDate)) {
    const window = shiftWindow(shift.ca, day ?? null);
    const expected = window.ok
      ? generateSlotStarts(window.khoang, shift.thoiLuong).map(
          (start) => `${shift.ngay} ${formatHHMM(start)}:00`,
        )
      : [];
    const actual = slots.map((s) => s.gio);
    const thieu = expected.filter((gio) => !actual.includes(gio));
    const thua = actual.filter((gio) => !expected.includes(gio));
    if (thieu.length > 0 || thua.length > 0)
      violations.push({ lichLamViecId: shift.lichLamViecId, thieu, thua });
  }
  return violations;
}

/** IV-03: mọi khung giờ nằm trọn trong khoảng của ca (theo giờ hoạt động hiện hành). */
export async function checkSlotsWithinShift(
  db: Db,
  fromDate: string,
): Promise<Violation[]> {
  const violations: Violation[] = [];
  for (const { shift, slots, day } of await loadShiftsWithSlots(db, fromDate)) {
    for (const slot of slots) {
      const result = checkSlotWithinBranchHours({
        ngayGio: new Date(`${slot.gio.replace(' ', 'T')}+07:00`),
        thoiLuongPhut: shift.thoiLuong,
        ca: shift.ca,
        ngayHoatDong: day ?? null,
      });
      if (!result.ok)
        violations.push({
          khungGioId: slot.khungGioId,
          lichLamViecId: shift.lichLamViecId,
          lyDo: result.lyDo,
        });
    }
  }
  return violations;
}

/** IV-04: không có hai yêu cầu ChoDuyet/DaDuyet chồng nhau của một bác sĩ (CaNgay chồng mọi yêu cầu cùng ngày; TheoCa chỉ chồng TheoCa cùng ca). */
export async function checkLeaveOverlap(db: Db): Promise<Violation[]> {
  return db.query(
    `SELECT a.yeu_cau_nghi_phep_id AS yeuCauA, b.yeu_cau_nghi_phep_id AS yeuCauB, a.bac_si_id AS bacSiId
     FROM yeu_cau_nghi_phep a JOIN yeu_cau_nghi_phep b
       ON a.bac_si_id = b.bac_si_id AND a.yeu_cau_nghi_phep_id < b.yeu_cau_nghi_phep_id
      AND a.trang_thai IN ('ChoDuyet','DaDuyet') AND b.trang_thai IN ('ChoDuyet','DaDuyet')
      AND a.ngay_bat_dau <= b.ngay_ket_thuc AND b.ngay_bat_dau <= a.ngay_ket_thuc
      AND (a.hinh_thuc_nghi = 'CaNgay' OR b.hinh_thuc_nghi = 'CaNgay' OR a.ca = b.ca)
     ORDER BY a.yeu_cau_nghi_phep_id, b.yeu_cau_nghi_phep_id`,
  );
}

/** Chạy cả bốn; ném lỗi nêu rõ bất biến nào vỡ (gọi cuối mỗi ca đồng thời). */
export async function assertInvariants(db: Db, today: string): Promise<void> {
  const broken = Object.entries({
    'IV-01': await checkBranchInvariant(db, today),
    'IV-02': await checkSlotCompleteness(db, today),
    'IV-03': await checkSlotsWithinShift(db, today),
    'IV-04': await checkLeaveOverlap(db),
  }).filter(([, violations]) => violations.length > 0);
  if (broken.length > 0)
    throw new Error(
      `Bất biến bị vi phạm: ${broken.map(([id, v]) => `${id} ${JSON.stringify(v)}`).join('; ')}`,
    );
}
