import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { DoctorFixtures } from '../../doctor/testing/doctor-fixtures.js';
import { BranchHoursReader } from '../branch-hours/branch-hours.reader.js';
import { LeaveReader } from '../leave/leave.reader.js';
import { AvailableSlotsReader } from './available-slots.reader.js';

// Doctor B6 trên MySQL 8.4 THẬT: AV-01…AV-13, AV-15, AV-16, HD-02, HD-12 (AV-14 và luật thuần ở slot-status.rules.spec.ts).
let db: DataSource;
let fx: DoctorFixtures;
let reader: AvailableSlotsReader;
useIntegrationHooks((d) => {
  db = d;
  fx = new DoctorFixtures(d);
  reader = new AvailableSlotsReader(
    d,
    new BranchHoursReader(),
    new LeaveReader(),
  );
});

const NGAY = '2026-12-07'; // Thứ Hai
const NOW = new Date('2026-12-01T00:00:00+07:00'); // trước mọi khung giờ của test
const handled = (admin: string) => ({
  nguoiXuLyId: admin,
  thoiDiemXuLy: '2026-12-01 09:00:00',
});

/** Bác sĩ có một ca sáng (8 ô 30 phút) vào NGAY. */
async function doctorWithMorning() {
  const w = await fx.world();
  const { shift, slotIds } = await fx.shiftWithSlots(w.doctor.profile, {
    ngay: NGAY,
    ca: 'CaSang',
  });
  return { w, id: w.doctor.account.taiKhoanId, shift, slotIds };
}

const setStatus = (
  id: string,
  trangThai: string,
  giuChoDen: string | null = null,
) =>
  db.query(
    'UPDATE khung_gio SET trang_thai = ?, giu_cho_den = ? WHERE khung_gio_id = ?',
    [trangThai, giuChoDen, id],
  );

describe('AvailableSlotsReader trên MySQL thật', () => {
  it('AV-01 trạng thái từng ô: ConTrong, DaDat, DangGiuCho còn hạn, DangGiuCho hết hạn', async () => {
    const { id, slotIds } = await doctorWithMorning();
    await setStatus(slotIds[1] as string, 'DaDat');
    await setStatus(slotIds[2] as string, 'DangGiuCho', '2026-12-06 10:00:00');
    await setStatus(slotIds[3] as string, 'DangGiuCho', '2026-11-30 10:00:00');
    const day = await reader.list({ bacSiId: id, ngay: NGAY, now: NOW });
    expect(day.khungGio.slice(0, 4).map((s) => s.trangThai)).toEqual([
      'ConTrong',
      'DaDat',
      'DangGiuCho',
      'ConTrong',
    ]);
  });

  it('AV-01 ô đã quá giờ (đồng hồ giả) là HetHan, ô sau đó còn trống', async () => {
    const { id } = await doctorWithMorning();
    const day = await reader.list({
      bacSiId: id,
      ngay: NGAY,
      now: new Date(`${NGAY}T08:45:00+07:00`),
    });
    expect(day.khungGio.slice(0, 3).map((s) => s.trangThai)).toEqual([
      'HetHan',
      'HetHan',
      'ConTrong',
    ]);
  });

  it('AV-02 nghỉ ChoDuyet phủ ô: bị loại, ngày là NghiPhep', async () => {
    const { id } = await doctorWithMorning();
    await fx.leaveRequest({ bacSiId: id, batDau: NGAY });
    const day = await reader.list({ bacSiId: id, ngay: NGAY, now: NOW });
    expect(day.khungGio).toEqual([]);
    expect(day.trangThaiNgay).toBe('NghiPhep');
  });

  it('AV-03/AV-04 DaDuyet loại ô; TuChoi không ảnh hưởng', async () => {
    const { w, id } = await doctorWithMorning();
    const admin = w.systemAdmin.account.taiKhoanId;
    const approved = await fx.leaveRequest({
      bacSiId: id,
      batDau: NGAY,
      trangThai: 'DaDuyet',
      ...handled(admin),
    });
    expect(
      (await reader.list({ bacSiId: id, ngay: NGAY, now: NOW })).khungGio,
    ).toEqual([]);
    await db.query(
      'UPDATE yeu_cau_nghi_phep SET trang_thai = ?, nguoi_xu_ly_id = ?, thoi_diem_xu_ly = ? WHERE yeu_cau_nghi_phep_id = ?',
      ['TuChoi', admin, '2026-12-01 09:00:00', approved],
    );
    const day = await reader.list({ bacSiId: id, ngay: NGAY, now: NOW });
    expect(day.khungGio).toHaveLength(8);
    expect(day.trangThaiNgay).toBe('CoLich');
  });

  it('AV-05 TheoCa CaSang: chỉ ca sáng bị loại, ca chiều còn', async () => {
    const { w, id } = await doctorWithMorning();
    await fx.shiftWithSlots(w.doctor.profile, { ngay: NGAY, ca: 'CaChieu' });
    await fx.leaveRequest({
      bacSiId: id,
      hinhThuc: 'TheoCa',
      ca: 'CaSang',
      batDau: NGAY,
    });
    const day = await reader.list({ bacSiId: id, ngay: NGAY, now: NOW });
    expect(new Set(day.khungGio.map((s) => s.ca))).toEqual(
      new Set(['CaChieu']),
    );
    expect(day.trangThaiNgay).toBe('CoLich');
  });

  it('AV-06 CaNgay nhiều ngày: ngày giữa và hai biên bị loại, ngoài khoảng còn', async () => {
    const { w, id } = await doctorWithMorning();
    for (const ngay of ['2026-12-06', '2026-12-08', '2026-12-09'])
      await fx.shiftWithSlots(w.doctor.profile, { ngay, ca: 'CaSang' });
    await fx.leaveRequest({
      bacSiId: id,
      batDau: '2026-12-06',
      ketThuc: '2026-12-08',
    });
    const count = async (ngay: string) =>
      (await reader.list({ bacSiId: id, ngay, now: NOW })).khungGio.length;
    expect([
      await count('2026-12-06'),
      await count(NGAY),
      await count('2026-12-08'),
      await count('2026-12-09'),
    ]).toEqual([0, 0, 0, 8]);
  });

  it('AV-07 lịch hoạt động thu hẹp sau khi sinh: ô ngoài giờ hiện hành bị ẩn', async () => {
    const { w, id } = await doctorWithMorning();
    await db.query(
      "UPDATE chi_nhanh_lich_hoat_dong SET gio_ket_thuc_sang = '10:00:00' WHERE chi_nhanh_id = ? AND thu_trong_tuan = 1",
      [w.branch.chiNhanhId],
    );
    const day = await reader.list({ bacSiId: id, ngay: NGAY, now: NOW });
    expect(day.khungGio).toHaveLength(4); // 08:00, 08:30, 09:00, 09:30 (kết thúc ≤ 10:00)
  });

  it('AV-08/AV-09 trạng thái ngày: KhongCoLich, ChiNhanhNghi (nghỉ và chưa khai báo) kèm thuNghi', async () => {
    const w = await fx.world();
    const id = w.doctor.account.taiKhoanId;
    const at = () => reader.list({ bacSiId: id, ngay: NGAY, now: NOW });
    expect(await at()).toMatchObject({
      trangThaiNgay: 'KhongCoLich',
      khungGio: [],
    });
    await db.query(
      // chk_lich_hoat_dong_ngay: ngày nghỉ thì cả bốn cột giờ phải để trống.
      `UPDATE chi_nhanh_lich_hoat_dong
          SET hoat_dong = 0, gio_bat_dau_sang = NULL, gio_ket_thuc_sang = NULL, gio_bat_dau_chieu = NULL, gio_ket_thuc_chieu = NULL
        WHERE chi_nhanh_id = ? AND thu_trong_tuan = 1`,
      [w.branch.chiNhanhId],
    );
    expect(await at()).toMatchObject({
      trangThaiNgay: 'ChiNhanhNghi',
      thuNghi: 1,
    });
    await db.query(
      'DELETE FROM chi_nhanh_lich_hoat_dong WHERE chi_nhanh_id = ? AND thu_trong_tuan = 1',
      [w.branch.chiNhanhId],
    );
    expect(await at()).toMatchObject({
      trangThaiNgay: 'ChiNhanhNghi',
      thuNghi: 1,
    });
  });

  it('AV-10 khungGioId là chuỗi duy nhất; ketThuc = batDau + thời lượng; giờ VN ra đúng UTC (M4)', async () => {
    const { id, slotIds } = await doctorWithMorning();
    const { khungGio } = await reader.list({
      bacSiId: id,
      ngay: NGAY,
      now: NOW,
    });
    expect(khungGio.map((s) => s.khungGioId)).toEqual(slotIds);
    expect(new Set(khungGio.map((s) => s.khungGioId)).size).toBe(8);
    expect(khungGio[0]).toMatchObject({
      batDau: '2026-12-07T01:00:00.000Z',
      ketThuc: '2026-12-07T01:30:00.000Z',
      ca: 'CaSang',
    });
  });

  it('AV-11/HD-12 listMany bằng list từng người và đủ 4 trangThaiNgay', async () => {
    const { w, id } = await doctorWithMorning();
    const resting = await fx.admin.doctor(w.branch);
    await fx.shiftWithSlots(resting.profile, { ngay: NGAY, ca: 'CaSang' });
    await fx.leaveRequest({
      bacSiId: resting.account.taiKhoanId,
      batDau: NGAY,
    });
    const idle = await fx.admin.doctor(w.branch);
    const closedBranch = await fx.admin.branch();
    await fx.admin.weeklySchedule(closedBranch.chiNhanhId, {
      hoatDong: false,
      gioBatDauSang: null,
      gioKetThucSang: null,
      gioBatDauChieu: null,
      gioKetThucChieu: null,
    });
    const offBranch = await fx.admin.doctor(closedBranch);
    const ids = [
      id,
      resting.account.taiKhoanId,
      idle.account.taiKhoanId,
      offBranch.account.taiKhoanId,
    ];

    const many = await reader.listMany({ bacSiIds: ids, ngay: NGAY, now: NOW });
    expect(many.map((d) => d.trangThaiNgay)).toEqual([
      'CoLich',
      'NghiPhep',
      'KhongCoLich',
      'ChiNhanhNghi',
    ]);
    for (const one of many)
      expect(
        await reader.list({ bacSiId: one.bacSiId, ngay: NGAY, now: NOW }),
      ).toEqual(one);
  });

  it('AV-12 listMany 20 bác sĩ chỉ dùng ≤ 4 truy vấn', async () => {
    const w = await fx.world();
    const ids = [w.doctor.account.taiKhoanId];
    for (let i = 0; i < 19; i += 1)
      ids.push((await fx.admin.doctor(w.branch)).account.taiKhoanId);
    await fx.shiftWithSlots(w.doctor.profile, { ngay: NGAY, ca: 'CaSang' });
    const spy = vi.spyOn(db.manager, 'query');
    await reader.listMany({ bacSiIds: ids, ngay: NGAY, now: NOW });
    expect(spy.mock.calls.length).toBeLessThanOrEqual(4);
    spy.mockRestore();
  });

  it('AV-13/HD-02 chỉ đọc; chạy trong em của người gọi: thấy dữ liệu chưa commit, không mở giao dịch riêng', async () => {
    const { id } = await doctorWithMorning();
    const before = await db.query('SELECT COUNT(*) AS n FROM khung_gio');
    await reader.list({ bacSiId: id, ngay: NGAY, now: NOW });
    expect(await db.query('SELECT COUNT(*) AS n FROM khung_gio')).toEqual(
      before,
    );

    const w = await fx.world();
    await expect(
      db.transaction(async (em) => {
        await new DoctorFixtures(em).shiftWithSlots(w.doctor.profile, {
          ngay: NGAY,
          ca: 'CaSang',
        });
        const inside = await reader.list(
          { bacSiId: w.doctor.account.taiKhoanId, ngay: NGAY, now: NOW },
          em,
        );
        expect(inside.khungGio).toHaveLength(8);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(
      (
        await reader.list({
          bacSiId: w.doctor.account.taiKhoanId,
          ngay: NGAY,
          now: NOW,
        })
      ).khungGio,
    ).toEqual([]);
  });

  it('AV-15 bác sĩ không có ca hoặc không tồn tại: rỗng, không ném', async () => {
    const w = await fx.world();
    expect(
      await reader.listMany({ bacSiIds: [], ngay: NGAY, now: NOW }),
    ).toEqual([]);
    expect(
      await reader.list({ bacSiId: '999999999', ngay: NGAY, now: NOW }),
    ).toMatchObject({ trangThaiNgay: 'KhongCoLich', khungGio: [] });
    expect(
      await reader.list({
        bacSiId: w.doctor.account.taiKhoanId,
        ngay: NGAY,
        now: NOW,
      }),
    ).toMatchObject({ khungGio: [] });
  });

  it('AV-16 ca mang chi nhánh khác chi nhánh hiện tại của bác sĩ: dùng giờ của chi nhánh trên ca', async () => {
    const { id, shift } = await doctorWithMorning();
    const other = await fx.admin.branch();
    await fx.admin.weeklySchedule(other.chiNhanhId, {
      gioBatDauSang: '09:00:00',
    });
    await db.query(
      'UPDATE lich_lam_viec SET chi_nhanh_id = ? WHERE lich_lam_viec_id = ?',
      [other.chiNhanhId, shift.lichLamViecId],
    );
    const day = await reader.list({ bacSiId: id, ngay: NGAY, now: NOW });
    expect(day.khungGio).toHaveLength(6); // 09:00 … 11:30; 08:00 và 08:30 nằm ngoài giờ chi nhánh trên ca
    expect(day.khungGio[0]?.batDau).toBe('2026-12-07T02:00:00.000Z');
  });
});
