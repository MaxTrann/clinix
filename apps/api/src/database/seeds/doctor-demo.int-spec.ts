import { randomBytes } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { todayVN } from '../../common/time/time.js';
import { YeuCauNghiPhep } from '../../doctor/entities/yeu-cau-nghi-phep.entity.js';
import {
  formatCalendarDate,
  parseCalendarDate,
} from '../../scheduling/calendar-date.js';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../testing/test-database.js';
import { DEMO_DAYS, DEMO_DOCTOR_EMAILS } from './doctor-demo-data.js';
import type { SeedCommand, SeedConfig } from './seed-config.js';
import { runSeed } from './seed.service.js';

// B18 (doctor): seed doctor-demo. Phủ HD-11: idempotent, khung giờ khớp D1, không dùng trong test tự động.
describe('doctor B18 — seed doctor-demo (MySQL thật)', () => {
  let db: DataSource;
  const settings = readTestDbSettings();
  const password = `${randomBytes(16).toString('hex')}1!`;
  const config = (command: SeedCommand): SeedConfig => ({
    command,
    database: settings,
    password,
  });
  beforeAll(async () => {
    db = await createTestDataSource(settings);
  });
  beforeEach(async () => {
    await resetTables(db);
  });
  afterAll(async () => {
    await db?.destroy();
  });

  const seedPrerequisites = async () => {
    await runSeed(db, config('catalog'));
    await runSeed(db, config('dev-accounts'));
    await runSeed(db, config('search-demo'));
  };

  const count = async (sql: string, params: unknown[] = []) =>
    Number((await db.query<{ n: string }[]>(sql, params))[0]!.n);

  it('HD-11a tạo ca 14 ngày từ ngày mai cho bác sĩ demo và khung giờ khớp thời lượng dịch vụ', async () => {
    await seedPrerequisites();
    const result = await runSeed(db, config('doctor-demo'));
    expect(result.created).toBeGreaterThan(0);

    const tomorrow = formatCalendarDate(parseCalendarDate(todayVN())! + 1);
    const last = formatCalendarDate(parseCalendarDate(todayVN())! + DEMO_DAYS);
    const range = await db.query<{ tu: string; den: string; bacSi: string }[]>(
      `SELECT DATE_FORMAT(MIN(ngay), '%Y-%m-%d') AS tu, DATE_FORMAT(MAX(ngay), '%Y-%m-%d') AS den,
              COUNT(DISTINCT bac_si_id) AS bacSi FROM lich_lam_viec`,
    );
    expect(range[0]!.tu >= tomorrow && range[0]!.den <= last).toBe(true);
    // 8 bác sĩ search-demo đang hoạt động + doctor@example.invalid (bác sĩ chờ kích hoạt không có ca).
    expect(Number(range[0]!.bacSi)).toBe(DEMO_DOCTOR_EMAILS.length);

    // Mỗi ca có đúng số ô bằng (khoảng ca / thời lượng): đối chiếu với 30 phút của "Khám chuyên khoa" ở ca sáng 08–12.
    const sample = await db.query<{ ca: string; n: string; lich: string }[]>(
      `SELECT l.ca AS ca, COUNT(k.khung_gio_id) AS n, l.lich_lam_viec_id AS lich
         FROM lich_lam_viec l JOIN khung_gio k ON k.lich_lam_viec_id = l.lich_lam_viec_id
         JOIN bac_si b ON b.tai_khoan_id = l.bac_si_id
         JOIN dich_vu_kham dv ON dv.dich_vu_kham_id = b.dich_vu_kham_id
        WHERE dv.thoi_luong = 30 AND l.ca = 'CaSang' GROUP BY l.lich_lam_viec_id, l.ca LIMIT 1`,
    );
    expect(Number(sample[0]!.n)).toBe(8);
    expect(
      await count(
        `SELECT COUNT(*) AS n FROM khung_gio WHERE trang_thai <> 'ConTrong'`,
      ),
    ).toBe(0);
  });

  it('HD-11b chạy lại không tạo thêm và không đổi dữ liệu', async () => {
    await seedPrerequisites();
    const first = await runSeed(db, config('doctor-demo'));
    const shifts = await count('SELECT COUNT(*) AS n FROM lich_lam_viec');
    const slots = await count('SELECT COUNT(*) AS n FROM khung_gio');
    const second = await runSeed(db, config('doctor-demo'));
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(first.created + first.skipped);
    expect(await count('SELECT COUNT(*) AS n FROM lich_lam_viec')).toBe(shifts);
    expect(await count('SELECT COUNT(*) AS n FROM khung_gio')).toBe(slots);
    expect(await db.getRepository(YeuCauNghiPhep).count()).toBe(2);
  });

  it('HD-11c có một yêu cầu nghỉ ChoDuyet và một DaDuyet (có người xử lý), ngày nghỉ rơi vào ca thật', async () => {
    await seedPrerequisites();
    await runSeed(db, config('doctor-demo'));
    const leaves = await db.getRepository(YeuCauNghiPhep).find();
    expect(leaves.map((l) => l.trangThai).sort()).toEqual([
      'ChoDuyet',
      'DaDuyet',
    ]);
    const approved = leaves.find((l) => l.trangThai === 'DaDuyet')!;
    expect(approved.nguoiXuLyId).not.toBeNull();
    expect(approved.thoiDiemXuLy).not.toBeNull();
    const pending = leaves.find((l) => l.trangThai === 'ChoDuyet')!;
    expect(pending.nguoiXuLyId).toBeNull();
    for (const leave of leaves) {
      expect(
        await count(
          `SELECT COUNT(*) AS n FROM lich_lam_viec
            WHERE bac_si_id = ? AND ngay = ? AND (? IS NULL OR ca = ?)`,
          [leave.bacSiId, leave.ngayBatDau, leave.ca, leave.ca],
        ),
      ).toBeGreaterThan(0);
    }
  });

  it('HD-11d không ghi đè ca đã có: ô đã đặt giữ nguyên trạng thái', async () => {
    await seedPrerequisites();
    await runSeed(db, config('doctor-demo'));
    await db.query(
      `UPDATE khung_gio SET trang_thai = 'DaDat' ORDER BY khung_gio_id LIMIT 1`,
    );
    await runSeed(db, config('doctor-demo'));
    expect(
      await count(
        `SELECT COUNT(*) AS n FROM khung_gio WHERE trang_thai = 'DaDat'`,
      ),
    ).toBe(1);
  });

  it('HD-11e thiếu bác sĩ demo thì từ chối SEED_DOCTORS_REQUIRED và không ghi gì', async () => {
    await runSeed(db, config('catalog'));
    await expect(runSeed(db, config('doctor-demo'))).rejects.toMatchObject({
      code: 'SEED_DOCTORS_REQUIRED',
    });
    expect(await count('SELECT COUNT(*) AS n FROM lich_lam_viec')).toBe(0);
  });

  it('HD-11f thiếu tài khoản Admin của dev-accounts thì từ chối và rollback toàn bộ', async () => {
    await runSeed(db, config('catalog'));
    await runSeed(db, config('search-demo'));
    // Có bác sĩ search-demo (bacsi01 là mẫu DaDuyet) nhưng chưa có admin.system.
    await expect(runSeed(db, config('doctor-demo'))).rejects.toMatchObject({
      code: 'SEED_DEV_ACCOUNTS_REQUIRED',
    });
    expect(await count('SELECT COUNT(*) AS n FROM lich_lam_viec')).toBe(0);
    expect(await db.getRepository(YeuCauNghiPhep).count()).toBe(0);
  });
});
