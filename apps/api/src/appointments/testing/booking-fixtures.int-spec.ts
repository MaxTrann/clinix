import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import {
  PUBLIC_DOCTOR_CONDITION,
  PUBLIC_DOCTOR_FROM,
} from '../../search/common/public-doctor.sql.js';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import {
  BOOKABLE_DAY,
  BOOKING_T0,
  BookingFixtures,
} from './booking-fixtures.js';
import { assertBookingInvariants } from './invariants.js';

// Task P2 — BHT-01, BHT-02 (PLAN booking 7.19; TRACKING 3.6 P2-F) trên MySQL 8.4 THẬT. Đồng hồ ứng dụng giả = BOOKING_T0 (02/11/2026 08:00 giờ Việt Nam).
let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

const count = async (
  table: string,
  where = '1 = 1',
  params: unknown[] = [],
) => {
  const rows: { n: string }[] = await db.query(
    `SELECT CAST(COUNT(*) AS CHAR) AS n FROM ${table} WHERE ${where}`,
    params,
  );
  return Number(rows[0]?.n);
};

const slotRows = (shiftId: string) =>
  db.query<{ gio: string; trangThai: string; giuChoDen: string | null }[]>(
    `SELECT DATE_FORMAT(ngay_gio, '%Y-%m-%d %H:%i:%s') AS gio, trang_thai AS trangThai,
            DATE_FORMAT(giu_cho_den, '%Y-%m-%d %H:%i:%s') AS giuChoDen
       FROM khung_gio WHERE lich_lam_viec_id = ? ORDER BY ngay_gio`,
    [shiftId],
  );

describe('BHT-01 BookingFixtures.world', () => {
  it('dựng đủ thế giới đặt được và dùng lại DoctorFixtures, AdminFixtures (không tạo hai lần)', async () => {
    const w = await fx.world();
    expect(fx.doctor.admin).toBe(fx.admin);

    // đúng một của mỗi thứ chính: không dựng chi nhánh, bác sĩ, Bệnh nhân hai lần
    expect(await count('chi_nhanh')).toBe(1);
    expect(await count('bac_si')).toBe(1);
    expect(await count('benh_nhan')).toBe(1);
    expect(await count('le_tan')).toBe(1);
    expect(await count('quan_tri_vien')).toBe(2);
    expect(await count('chi_nhanh_lich_hoat_dong', 'hoat_dong = true')).toBe(7);

    // bác sĩ đủ điều kiện công khai (cùng hằng với search và booking B6), ca cùng chi nhánh với bác sĩ
    expect(
      await count(
        PUBLIC_DOCTOR_FROM,
        `${PUBLIC_DOCTOR_CONDITION} AND b.tai_khoan_id = ?`,
        [w.doctor.account.taiKhoanId],
      ),
    ).toBe(1);
    expect(w.shift.chiNhanhId).toBe(w.doctor.profile.chiNhanhId);
    expect(w.shift.bacSiId).toBe(w.doctor.account.taiKhoanId);

    // khung giờ: 8 ô 30 phút của ca sáng, đều `ConTrong`, không giữ chỗ, đều SAU đồng hồ giả
    const slots = await slotRows(w.shift.lichLamViecId);
    expect(w.slotIds).toHaveLength(8);
    expect(slots).toHaveLength(8);
    expect(slots[0]?.gio).toBe(`${BOOKABLE_DAY} 08:00:00`);
    expect(slots.at(-1)?.gio).toBe(`${BOOKABLE_DAY} 11:30:00`);
    expect(
      slots.every((s) => s.trangThai === 'ConTrong' && s.giuChoDen === null),
    ).toBe(true);
    expect(
      slots.every(
        (s) => new Date(`${s.gio.replace(' ', 'T')}+07:00`) > BOOKING_T0,
      ),
    ).toBe(true);

    // cấu hình, Bệnh nhân kèm ví, hồ sơ người thân hiệu lực và đã ngừng
    expect(w.config.id).toBe(1);
    expect(await count('cau_hinh_he_thong')).toBe(1);
    expect(w.config.soLichHenToiDaMoiHoSo).toBe(3);
    expect(
      await count('vi_noi_bo', 'benh_nhan_id = ?', [
        w.patient.account.taiKhoanId,
      ]),
    ).toBe(1);
    const relatives: { id: string; active: number }[] = await db.query(
      `SELECT CAST(ho_so_nguoi_than_id AS CHAR) AS id, trang_thai_hieu_luc AS active
         FROM ho_so_nguoi_than WHERE benh_nhan_id = ? ORDER BY ho_so_nguoi_than_id`,
      [w.patient.account.taiKhoanId],
    );
    expect(relatives).toEqual([
      { id: w.relativeId, active: 1 },
      { id: w.stoppedRelativeId, active: 0 },
    ]);
  });

  it('ca chiều và ngày tuỳ chọn; systemConfig gọi lại thì cập nhật đúng một dòng; patients(n) dựng n người khác nhau, mỗi người một ví', async () => {
    const w = await fx.world({ ngay: '2026-11-11', ca: 'CaChieu' });
    const slots = await slotRows(w.shift.lichLamViecId);
    expect(slots[0]?.gio).toBe('2026-11-11 13:00:00');
    expect(slots.at(-1)?.gio).toBe('2026-11-11 16:30:00');

    await fx.systemConfig({ soLichHenToiDaMoiHoSo: 1, nguongNoShow: 2 });
    expect(await count('cau_hinh_he_thong')).toBe(1);
    const rows: { toiDa: number; nguong: number }[] = await db.query(
      'SELECT so_lich_hen_toi_da_moi_ho_so AS toiDa, nguong_no_show AS nguong FROM cau_hinh_he_thong',
    );
    expect(rows).toEqual([{ toiDa: 1, nguong: 2 }]);

    const many = await fx.patients(3);
    const ids = new Set(many.map((p) => p.account.taiKhoanId));
    expect(ids.size).toBe(3);
    expect(await count('vi_noi_bo')).toBe(4); // 3 mới + 1 của world
  });
});

describe('BHT-02 appointmentIn: lịch hẹn và khung giờ nhất quán cho bảy trạng thái', () => {
  // [trạng thái lịch, trạng thái khung giờ, giu_cho_den, có giữ khung giờ (cột sinh khác NULL)]
  const EXPECTED: [TrangThaiLichHen, string, string | null, boolean][] = [
    ['ChoThanhToan', 'DangGiuCho', '2026-11-02 08:15:00', true],
    ['DaXacNhan', 'DaDat', null, true],
    ['DaTiepDon', 'DaDat', null, true],
    ['HoanThanh', 'DaDat', null, true],
    ['VangMat', 'DaDat', null, true],
    ['DaHuy', 'ConTrong', null, false],
    ['DaDoiLich', 'ConTrong', null, false],
  ];

  it('mỗi trạng thái đặt khung giờ đúng (DangGiuCho kèm giu_cho_den = han_thanh_toan; DaDat; ConTrong) và cột sinh khung_gio_dang_giu khớp', async () => {
    const w = await fx.world();
    const patientId = w.patient.account.taiKhoanId;
    for (const [
      index,
      [trangThai, slotStatus, giu, holds],
    ] of EXPECTED.entries()) {
      const khungGioId = w.slotIds[index]!;
      const appointment = await fx.appointmentIn(trangThai, {
        doctor: w.doctor.profile,
        khungGioId,
        patientId,
      });
      expect(await fx.slotState(khungGioId)).toEqual({
        trangThai: slotStatus,
        giuChoDen: giu,
      });
      const rows: {
        han: string | null;
        huy: string | null;
        giu: string | null;
        trangThai: string;
      }[] = await db.query(
        `SELECT DATE_FORMAT(han_thanh_toan, '%Y-%m-%d %H:%i:%s') AS han,
                DATE_FORMAT(thoi_diem_huy, '%Y-%m-%d %H:%i:%s') AS huy,
                CAST(khung_gio_dang_giu AS CHAR) AS giu, trang_thai AS trangThai
           FROM lich_hen WHERE lich_hen_id = ?`,
        [appointment.lichHenId],
      );
      const row = rows[0]!;
      expect(row.trangThai).toBe(trangThai);
      // chỉ lịch chờ thanh toán có hạn; chỉ lịch huỷ có thời điểm huỷ
      expect(row.han).toBe(trangThai === 'ChoThanhToan' ? giu : null);
      expect(row.huy !== null).toBe(trangThai === 'DaHuy');
      expect(row.giu).toBe(holds ? khungGioId : null);
    }
    // bảy trạng thái cùng tồn tại mà năm bất biến vẫn đúng: fixture không gây INV đỏ giả
    await expect(assertBookingInvariants(db)).resolves.toBeUndefined();
  });

  it('nhận hanThanhToan, tienCocSnapshot, chinhSachHoanSnapshot, hồ sơ người thân và mã lịch hẹn; hạn tuỳ chọn khớp giu_cho_den', async () => {
    const w = await fx.world();
    const khungGioId = w.slotIds[0]!;
    const policy = [
      { so_gio_truoc_toi_thieu: 24, ty_le_hoan: 100 },
      { so_gio_truoc_toi_thieu: 2, ty_le_hoan: 50 },
    ];
    const appointment = await fx.appointmentIn('ChoThanhToan', {
      doctor: w.doctor.profile,
      khungGioId,
      patientId: w.patient.account.taiKhoanId,
      hoSoNguoiThanId: w.relativeId,
      hanThanhToan: new Date('2026-11-02T01:30:00.000Z'),
      tienCocSnapshot: '50000.00',
      chinhSachHoanSnapshot: { moc: policy },
      maLichHen: 'CLX-20261102-ABCDE',
    });
    expect(await fx.slotState(khungGioId)).toEqual({
      trangThai: 'DangGiuCho',
      giuChoDen: '2026-11-02 08:30:00',
    });
    const rows: {
      ma: string;
      hoSo: string;
      coc: string;
      policy: { moc: unknown };
    }[] = await db.query(
      `SELECT ma_lich_hen AS ma, CAST(ho_so_nguoi_than_id AS CHAR) AS hoSo,
              CAST(tien_coc_snapshot AS CHAR) AS coc, chinh_sach_hoan_snapshot AS policy
         FROM lich_hen WHERE lich_hen_id = ?`,
      [appointment.lichHenId],
    );
    const row = rows[0]!;
    expect(row.ma).toBe('CLX-20261102-ABCDE');
    expect(row.hoSo).toBe(w.relativeId);
    expect(row.coc).toBe('50000.00');
    // cột JSON: driver có thể trả đối tượng hay chuỗi (M7 của X1 sẽ đo); ở đây chỉ cần dữ liệu khớp
    const stored =
      typeof row.policy === 'string'
        ? (JSON.parse(row.policy) as { moc: unknown })
        : row.policy;
    expect(stored).toEqual({ moc: policy });
  });

  it('slotState báo lỗi rõ khi không có khung giờ', async () => {
    await expect(fx.slotState('999999')).rejects.toThrow(/Không có khung giờ/);
  });
});
