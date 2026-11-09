import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import {
  DoctorFixtures,
  type LeaveRequestInput,
} from '../testing/doctor-fixtures.js';

// Doctor P1 — ràng buộc của bảng yeu_cau_nghi_phep trên MySQL 8.4 THẬT (MG-02, MG-03, MG-04).
let db: DataSource;
let fx: DoctorFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new DoctorFixtures(d);
});

// Dòng hợp lệ (CaNgay, một ngày, đang chờ duyệt) lấy từ DoctorFixtures; từng ca test ghi đè đúng một chỗ.
const insert = (
  bacSiId: string,
  overrides: Omit<LeaveRequestInput, 'bacSiId'> = {},
) => fx.leaveRequest({ bacSiId, ...overrides });

async function setup() {
  const branch = await fx.admin.branch();
  const doctor = await fx.admin.doctor(branch);
  const admin = await fx.admin.admin();
  return {
    doctorId: doctor.account.taiKhoanId,
    adminId: admin.account.taiKhoanId,
  };
}

describe('yeu_cau_nghi_phep trên MySQL thật', () => {
  it('đường đúng: nghỉ nhiều ngày cả ngày, nghỉ một ca, đã duyệt đủ người/thời điểm; ngày đọc bằng DATE_FORMAT không lệch múi giờ', async () => {
    const { doctorId, adminId } = await setup();
    await insert(doctorId, { batDau: '2026-12-01', ketThuc: '2026-12-05' });
    await insert(doctorId, { hinhThuc: 'TheoCa', ca: 'CaChieu' });
    await insert(doctorId, {
      trangThai: 'DaDuyet',
      nguoiXuLyId: adminId,
      thoiDiemXuLy: '2026-11-20 08:00:00',
    });
    // DATE_FORMAT để kết quả không phụ thuộc múi giờ của máy chạy test (CI chạy UTC, máy dev chạy UTC+7)
    const rows: { batDau: string; ketThuc: string; trangThai: string }[] =
      await db.query(
        `SELECT DATE_FORMAT(ngay_bat_dau, '%Y-%m-%d') AS batDau, DATE_FORMAT(ngay_ket_thuc, '%Y-%m-%d') AS ketThuc, trang_thai AS trangThai
         FROM yeu_cau_nghi_phep ORDER BY yeu_cau_nghi_phep_id`,
      );
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      batDau: '2026-12-01',
      ketThuc: '2026-12-05',
      trangThai: 'ChoDuyet',
    });
  });

  it('MG-02 chk_nghi_phep_hinh_thuc: DB từ chối CaNgay có ca, TheoCa không ca, TheoCa nhiều ngày, CaNgay bắt đầu > kết thúc', async () => {
    const { doctorId } = await setup();
    await expect(insert(doctorId, { ca: 'CaSang' })).rejects.toThrow(
      /chk_nghi_phep_hinh_thuc/,
    );
    await expect(insert(doctorId, { hinhThuc: 'TheoCa' })).rejects.toThrow(
      /chk_nghi_phep_hinh_thuc/,
    );
    await expect(
      insert(doctorId, {
        hinhThuc: 'TheoCa',
        ca: 'CaSang',
        batDau: '2026-12-01',
        ketThuc: '2026-12-02',
      }),
    ).rejects.toThrow(/chk_nghi_phep_hinh_thuc/);
    await expect(
      insert(doctorId, { batDau: '2026-12-05', ketThuc: '2026-12-01' }),
    ).rejects.toThrow(/chk_nghi_phep_hinh_thuc/);
  });

  it('MG-03 chk_nghi_phep_xu_ly: DB từ chối ChoDuyet có người xử lý, DaDuyet thiếu thời điểm, TuChoi thiếu người', async () => {
    const { doctorId, adminId } = await setup();
    await expect(insert(doctorId, { nguoiXuLyId: adminId })).rejects.toThrow(
      /chk_nghi_phep_xu_ly/,
    );
    await expect(
      insert(doctorId, { trangThai: 'DaDuyet', nguoiXuLyId: adminId }),
    ).rejects.toThrow(/chk_nghi_phep_xu_ly/);
    await expect(
      insert(doctorId, {
        trangThai: 'TuChoi',
        thoiDiemXuLy: '2026-11-20 08:00:00',
      }),
    ).rejects.toThrow(/chk_nghi_phep_xu_ly/);
  });

  it('MG-04 khoá ngoại: bac_si_id và nguoi_xu_ly_id phải tồn tại; chỉ mục yeu_cau_nghi_phep_index_8 đúng cột, đúng thứ tự', async () => {
    const { doctorId } = await setup();
    await expect(insert('999999')).rejects.toThrow(/foreign key/i);
    await expect(
      insert(doctorId, {
        trangThai: 'TuChoi',
        nguoiXuLyId: '999999',
        thoiDiemXuLy: '2026-11-20 08:00:00',
      }),
    ).rejects.toThrow(/foreign key/i);

    const columns: { column: string }[] = await db.query(
      `SELECT column_name AS \`column\` FROM information_schema.statistics
       WHERE table_schema = DATABASE() AND table_name = 'yeu_cau_nghi_phep' AND index_name = 'yeu_cau_nghi_phep_index_8'
       ORDER BY seq_in_index`,
    );
    expect(columns.map((c) => c.column)).toEqual([
      'bac_si_id',
      'ngay_bat_dau',
      'trang_thai',
    ]);
  });
});
