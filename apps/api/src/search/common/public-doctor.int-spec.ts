import type { DataSource } from 'typeorm';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../../database/testing/test-database.js';
import { SearchFixtures } from '../testing/search-fixtures.js';
import {
  PUBLIC_DOCTOR_CONDITION,
  PUBLIC_DOCTOR_FROM,
} from './public-doctor.sql.js';
import { runReadOnly } from '../../common/transaction/read-only-tx.js';

// P1 — hằng điều kiện công khai và giao dịch chỉ đọc trên MySQL thật. Phủ phần khung của AN-01…AN-03; AN-* đầy đủ ở B2/B5.
let db: DataSource;
let fixtures: SearchFixtures;
beforeAll(async () => {
  db = await createTestDataSource(readTestDbSettings());
  fixtures = new SearchFixtures(db);
});
beforeEach(async () => {
  await resetTables(db);
});
afterAll(async () => {
  await db?.destroy();
});

const publicDoctorIds = async (): Promise<string[]> => {
  const rows = await db.query<{ id: string }[]>(
    `SELECT CAST(b.tai_khoan_id AS CHAR) AS id FROM ${PUBLIC_DOCTOR_FROM}
     WHERE ${PUBLIC_DOCTOR_CONDITION} ORDER BY b.tai_khoan_id`,
  );
  return rows.map((row) => row.id);
};

describe('P1 — PUBLIC_DOCTOR_CONDITION', () => {
  it('AN-01/02/03: chỉ bác sĩ hoạt động, chuyên khoa hoạt động, còn dịch vụ ở chi nhánh mới hiện', async () => {
    const branch = await fixtures.branchWithCoordinates();
    const visible = await fixtures.publicDoctor(branch);
    await fixtures.pendingDoctor(branch);
    await fixtures.suspendedDoctor(branch);
    await fixtures.doctorOfInactiveSpecialty(branch);
    await fixtures.doctorWithRemovedService(branch);

    expect(await publicDoctorIds()).toEqual([visible.account.taiKhoanId]);
  });

  it('AN-04: DB không có bác sĩ nào ⇒ rỗng, không lỗi', async () => {
    expect(await publicDoctorIds()).toEqual([]);
  });

  it('bác sĩ chưa có lịch làm việc vẫn hiện (Q13)', async () => {
    const branch = await fixtures.branchWithoutCoordinates();
    const doctor = await fixtures.publicDoctor(branch);
    expect(await publicDoctorIds()).toEqual([doctor.account.taiKhoanId]);
  });
});

describe('P1 — fixture của search', () => {
  it('lịch tuần thiếu thứ: chỉ còn đúng các thứ được yêu cầu', async () => {
    const branch = await fixtures.branchWithCoordinates();
    await fixtures.partialWeeklySchedule(branch.chiNhanhId, [1, 2, 3, 5]);
    const rows = await db.query<{ thu: number }[]>(
      'SELECT thu_trong_tuan AS thu FROM chi_nhanh_lich_hoat_dong WHERE chi_nhanh_id = ? ORDER BY thu_trong_tuan',
      [branch.chiNhanhId],
    );
    expect(rows.map((row) => Number(row.thu))).toEqual([1, 2, 3, 5]);
  });

  it('chi nhánh có và không có toạ độ', async () => {
    const withCoords = await fixtures.branchWithCoordinates();
    const without = await fixtures.branchWithoutCoordinates();
    expect(withCoords.toaDoLat).not.toBeNull();
    expect(without.toaDoLat).toBeNull();
    expect(without.toaDoLng).toBeNull();
  });

  it('quy tắc phụ phí (kể cả mốc đã tắt) được lưu', async () => {
    await fixtures.surchargeRule('BS_CKI', 0, '50000.00');
    await fixtures.surchargeRule('BS_CKI', 5, '100000.00', false);
    const [{ total }] = await db.query<{ total: string }[]>(
      'SELECT COUNT(*) AS total FROM phu_phi_bac_si',
    );
    expect(Number(total)).toBe(2);
  });
});

describe('P1 — runReadOnly (H6)', () => {
  it('đọc được và trả đúng kết quả của callback', async () => {
    const branch = await fixtures.branchWithCoordinates();
    await fixtures.publicDoctor(branch);
    const total = await runReadOnly(db, async (manager) => {
      const [row] = await manager.query<{ total: string }[]>(
        `SELECT COUNT(*) AS total FROM ${PUBLIC_DOCTOR_FROM} WHERE ${PUBLIC_DOCTOR_CONDITION}`,
      );
      return Number(row?.total);
    });
    expect(total).toBe(1);
  });

  it('câu ghi bị MySQL từ chối và không để lại dữ liệu', async () => {
    await expect(
      runReadOnly(db, (manager) =>
        manager.query(
          "INSERT INTO chuyen_khoa (ten) VALUES ('khong-duoc-ghi')",
        ),
      ),
    ).rejects.toThrow();
    const [{ total }] = await db.query<{ total: string }[]>(
      'SELECT COUNT(*) AS total FROM chuyen_khoa',
    );
    expect(Number(total)).toBe(0);
  });

  it('sau khi chạy, kết nối trả về pool và không còn ở chế độ chỉ đọc', async () => {
    await runReadOnly(db, async () => undefined);
    await db.query("INSERT INTO chuyen_khoa (ten) VALUES ('ghi-binh-thuong')");
    const [{ total }] = await db.query<{ total: string }[]>(
      'SELECT COUNT(*) AS total FROM chuyen_khoa',
    );
    expect(Number(total)).toBe(1);
  });
});
