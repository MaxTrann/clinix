import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { DoctorFixtures } from './doctor-fixtures.js';
import {
  assertInvariants,
  checkBranchInvariant,
  checkLeaveOverlap,
  checkSlotCompleteness,
  checkSlotsWithinShift,
} from './invariants.js';

// Doctor P5 — bất biến IV-01…IV-04 và hạ tầng test, trên MySQL 8.4 THẬT. Chưa có mã ghi (B3…B15) nên mỗi ca kiểm 2 chiều:
// dữ liệu sạch ⇒ không vi phạm; cố ý gài lỗi (ca "đột biến") ⇒ bị phát hiện. Đồng hồ ứng dụng giả = 02/11/2026 (T0).
const TODAY = '2026-11-02';
let db: DataSource;
let fx: DoctorFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new DoctorFixtures(d);
});

const ids = (violations: Record<string, unknown>[], key: string) =>
  violations.map((v) => String(v[key]));

describe('DoctorFixtures', () => {
  it('world dựng chi nhánh đủ 7 thứ, bác sĩ, Lễ tân và hai Admin; shiftWithSlots sinh 8 ô 30 phút ghi bằng chuỗi giờ', async () => {
    const w = await fx.world();
    expect(w.doctor.profile.chiNhanhId).toBe(w.branch.chiNhanhId);
    expect(w.branchAdmin.profile.chiNhanhId).toBe(w.branch.chiNhanhId);
    expect(w.systemAdmin.profile.chiNhanhId).toBeNull();

    const { shift, slotIds } = await fx.shiftWithSlots(w.doctor.profile, {
      ngay: '2026-11-10',
      ca: 'CaSang',
    });
    expect(slotIds).toHaveLength(8);
    const rows: { gio: string }[] = await db.query(
      "SELECT DATE_FORMAT(ngay_gio, '%Y-%m-%d %H:%i:%s') AS gio FROM khung_gio WHERE lich_lam_viec_id = ? ORDER BY ngay_gio",
      [shift.lichLamViecId],
    );
    expect(rows[0]?.gio).toBe('2026-11-10 08:00:00');
    expect(rows.at(-1)?.gio).toBe('2026-11-10 11:30:00');
  });
});

describe('IV-01 chi nhánh của ca = chi nhánh hiện tại của bác sĩ', () => {
  it('dữ liệu sạch ⇒ rỗng; ca (từ hôm nay) mang chi nhánh khác ⇒ bị phát hiện; ca quá khứ thì bỏ qua; ca đúng hôm nay vẫn tính', async () => {
    const w = await fx.world();
    const other = await fx.admin.branch();
    const doctor = w.doctor.profile;
    const future = await fx.admin.shift(doctor, { ngay: '2026-11-10' });
    const today = await fx.admin.shift(doctor, { ngay: TODAY, ca: 'CaChieu' });
    const past = await fx.admin.shift(doctor, { ngay: '2026-10-01' });
    expect(await checkBranchInvariant(db, TODAY)).toEqual([]);

    await db.query(
      'UPDATE lich_lam_viec SET chi_nhanh_id = ? WHERE lich_lam_viec_id IN (?, ?, ?)',
      [
        other.chiNhanhId,
        future.lichLamViecId,
        today.lichLamViecId,
        past.lichLamViecId,
      ],
    );
    const violations = await checkBranchInvariant(db, TODAY);
    expect(ids(violations, 'lichLamViecId')).toEqual([
      String(future.lichLamViecId),
      String(today.lichLamViecId),
    ]);
  });
});

describe('IV-02 ca có đủ khung giờ, không thừa không thiếu', () => {
  it('đủ ⇒ rỗng; thiếu một ô và thừa một ô ⇒ nêu đúng ô; sinh sai thời lượng ⇒ bị phát hiện', async () => {
    const w = await fx.world();
    const doctor = w.doctor.profile;
    const morning = await fx.shiftWithSlots(doctor, {
      ngay: '2026-11-10',
      ca: 'CaSang',
    });
    expect(await checkSlotCompleteness(db, TODAY)).toEqual([]);

    await db.query('DELETE FROM khung_gio WHERE khung_gio_id = ?', [
      morning.slotIds[0],
    ]);
    await db.query(
      "INSERT INTO khung_gio (lich_lam_viec_id, ngay_gio) VALUES (?, '2026-11-10 12:00:00')",
      [morning.shift.lichLamViecId],
    );
    expect(await checkSlotCompleteness(db, TODAY)).toEqual([
      {
        lichLamViecId: morning.shift.lichLamViecId,
        thieu: ['2026-11-10 08:00:00'],
        thua: ['2026-11-10 12:00:00'],
      },
    ]);

    // dịch vụ của bác sĩ 30 phút nhưng ca chiều bị sinh theo 60 phút ⇒ thiếu 4 ô
    await fx.shiftWithSlots(doctor, {
      ngay: '2026-11-11',
      ca: 'CaChieu',
      thoiLuongPhut: 60,
    });
    const violations = await checkSlotCompleteness(db, TODAY);
    expect(violations).toHaveLength(2);
    expect(violations[1]?.['thieu']).toHaveLength(4);
  });
});

describe('IV-03 khung giờ nằm trọn trong khoảng của ca', () => {
  it('đúng ⇒ rỗng; ô 12:00 trong ca sáng (hết 12:00) và ô 11:45 xuyên giờ kết thúc ⇒ NgoaiGioHoatDong', async () => {
    const w = await fx.world();
    const { shift } = await fx.shiftWithSlots(w.doctor.profile, {
      ngay: '2026-11-10',
      ca: 'CaSang',
    });
    expect(await checkSlotsWithinShift(db, TODAY)).toEqual([]);

    await db.query(
      "INSERT INTO khung_gio (lich_lam_viec_id, ngay_gio) VALUES (?, '2026-11-10 12:00:00'), (?, '2026-11-10 11:45:00')",
      [shift.lichLamViecId, shift.lichLamViecId],
    );
    const violations = await checkSlotsWithinShift(db, TODAY);
    expect(violations).toHaveLength(2);
    expect(violations.every((v) => v['lyDo'] === 'NgoaiGioHoatDong')).toBe(
      true,
    );
  });

  it('chi nhánh đổi sang ngày nghỉ sau khi sinh ô ⇒ ô bị phát hiện với lý do NgayNghi (dữ liệu hoạt động hiện hành)', async () => {
    const w = await fx.world();
    await fx.shiftWithSlots(w.doctor.profile, {
      ngay: '2026-11-10',
      ca: 'CaSang',
    });
    await db.query(
      'UPDATE chi_nhanh_lich_hoat_dong SET hoat_dong = false, gio_bat_dau_sang = NULL, gio_ket_thuc_sang = NULL, gio_bat_dau_chieu = NULL, gio_ket_thuc_chieu = NULL WHERE chi_nhanh_id = ? AND thu_trong_tuan = 2',
      [w.branch.chiNhanhId],
    );
    const violations = await checkSlotsWithinShift(db, TODAY);
    expect(violations).toHaveLength(8);
    expect(violations.every((v) => v['lyDo'] === 'NgayNghi')).toBe(true);
  });
});

describe('IV-04 không có hai yêu cầu nghỉ chồng nhau ở trạng thái còn hiệu lực', () => {
  it('chồng (CaNgay với TheoCa, cùng ngày biên, hai TheoCa cùng ca) ⇒ phát hiện; không chồng (khác ca, liền kề, đã TuChoi, bác sĩ khác) ⇒ bỏ qua', async () => {
    const w = await fx.world();
    const doctorId = w.doctor.account.taiKhoanId;
    const adminId = w.systemAdmin.account.taiKhoanId;
    const other = await fx.admin.doctor(w.branch);
    const rejected = {
      trangThai: 'TuChoi',
      nguoiXuLyId: adminId,
      thoiDiemXuLy: '2026-11-20 08:00:00',
    } as const;

    const a = await fx.leaveRequest({
      bacSiId: doctorId,
      batDau: '2026-12-01',
      ketThuc: '2026-12-05',
    });
    // không chồng: liền kề, TuChoi chồng ngày, bác sĩ khác chồng ngày, TheoCa khác ngày
    const d = await fx.leaveRequest({
      bacSiId: doctorId,
      batDau: '2026-12-06',
      ketThuc: '2026-12-07',
    });
    await fx.leaveRequest({
      bacSiId: doctorId,
      batDau: '2026-12-02',
      ketThuc: '2026-12-02',
      ...rejected,
    });
    await fx.leaveRequest({
      bacSiId: other.account.taiKhoanId,
      batDau: '2026-12-02',
      ketThuc: '2026-12-02',
    });
    expect(await checkLeaveOverlap(db)).toEqual([]);

    // chồng: TheoCa trong khoảng CaNgay; và biên (yêu cầu c bắt đầu đúng ngày kết thúc của d)
    const b = await fx.leaveRequest({
      bacSiId: doctorId,
      hinhThuc: 'TheoCa',
      ca: 'CaSang',
      batDau: '2026-12-03',
    });
    const c = await fx.leaveRequest({
      bacSiId: doctorId,
      batDau: '2026-12-07',
      ketThuc: '2026-12-09',
    });
    const violations = await checkLeaveOverlap(db);
    expect(
      violations.map((v) => [String(v['yeuCauA']), String(v['yeuCauB'])]),
    ).toEqual([
      [a, b],
      [d, c],
    ]);
  });

  it('hai TheoCa cùng ngày: khác ca thì không chồng, cùng ca thì chồng', async () => {
    const w = await fx.world();
    const bacSiId = w.doctor.account.taiKhoanId;
    const base = { bacSiId, hinhThuc: 'TheoCa', batDau: '2026-12-03' } as const;
    await fx.leaveRequest({ ...base, ca: 'CaSang' });
    await fx.leaveRequest({ ...base, ca: 'CaChieu' });
    expect(await checkLeaveOverlap(db)).toEqual([]);
    await fx.leaveRequest({ ...base, ca: 'CaSang' });
    expect(await checkLeaveOverlap(db)).toHaveLength(1);
  });
});

describe('assertInvariants', () => {
  it('dữ liệu sạch ⇒ không ném; một bất biến vỡ ⇒ ném lỗi nêu mã IV', async () => {
    const w = await fx.world();
    await fx.shiftWithSlots(w.doctor.profile, {
      ngay: '2026-11-10',
      ca: 'CaSang',
    });
    await expect(assertInvariants(db, TODAY)).resolves.toBeUndefined();

    const bacSiId = w.doctor.account.taiKhoanId;
    await fx.leaveRequest({
      bacSiId,
      batDau: '2026-12-01',
      ketThuc: '2026-12-03',
    });
    await fx.leaveRequest({
      bacSiId,
      batDau: '2026-12-03',
      ketThuc: '2026-12-04',
    });
    await expect(assertInvariants(db, TODAY)).rejects.toThrow(/IV-04/);
  });
});
