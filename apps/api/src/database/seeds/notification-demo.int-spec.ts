import { randomBytes } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import { NOTIFICATION_CATALOG } from '../../notification/catalog/notification-catalog.js';
import {
  createReminderService,
  sweepAt,
} from '../../notification/testing/reminder-fixtures.js';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../testing/test-database.js';
import {
  NOTIFICATION_DEMO_ACCOUNTS,
  NOTIFICATION_DEMO_PER_ACCOUNT,
  NOTIFICATION_DEMO_PREFIX,
  reminderDemoCode,
} from './notification-demo-data.js';
import { NotificationDemoRepository } from './notification-demo.repository.js';
import type { SeedCommand, SeedConfig } from './seed-config.js';
import { seedTransaction } from './seed-runner.js';
import { runSeed } from './seed.service.js';

// notification X3 — seed notification-demo trên MySQL 8.4 THẬT (PLAN notification 5.12 "Dữ liệu mẫu"): NDS-01 (đủ dòng mỗi tài khoản, trộn đọc, mã đúng người nhận, không dòng thư; một lịch DaXacNhan cách
// giờ hẹn 2 giờ 5 phút đến 3 giờ 5 phút), NDS-02 (chạy lại không nhân đôi), NDS-03 đến NDS-05 (thiếu điều kiện ⇒ mã lỗi cố định, KHÔNG ghi gì), NDS-06 (job nhắc lịch THẬT gửi đúng một thư cho lịch mẫu).
// Mã ca NDS-xx là `[đề xuất]` của X3 (PLAN không có mã riêng cho seed). Đồng hồ cố định truyền vào repository: 07:00 Thứ Tư 18/11/2026 giờ Việt Nam. Dữ liệu giả; test tự động KHÁC không dùng seed này.
const NOW = new Date('2026-11-18T00:00:00.000Z');
const CODE = reminderDemoCode('20261118');

describe('notification X3 — seed notification-demo (MySQL thật)', () => {
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

  const prerequisites = async () => {
    await runSeed(db, config('catalog'));
    await runSeed(db, config('dev-accounts'));
    await runSeed(db, config('config-dev'));
  };
  const seed = (now: Date = NOW) =>
    seedTransaction(db, async (manager) => {
      const demo = new NotificationDemoRepository(manager, now);
      await demo.run();
      return demo.counts;
    });
  const count = async (sql: string, params: unknown[] = []) =>
    Number((await db.query<{ n: string }[]>(sql, params))[0]!.n);
  const snapshot = async () => ({
    thongBao: await count('SELECT COUNT(*) AS n FROM thong_bao'),
    email: await count('SELECT COUNT(*) AS n FROM email_thong_bao'),
    lichHen: await count('SELECT COUNT(*) AS n FROM lich_hen'),
    ca: await count('SELECT COUNT(*) AS n FROM lich_lam_viec'),
    khungGio: await count('SELECT COUNT(*) AS n FROM khung_gio'),
  });
  const failureOf = async (promise: Promise<unknown>): Promise<string> =>
    promise.then(
      () => 'không lỗi',
      (error: unknown) => (error as { code?: string }).code ?? String(error),
    );

  it('NDS-01 mỗi tài khoản dev đủ 25 thông báo mẫu (9 đã đọc), mã đúng người nhận theo danh mục, không dòng thư; một lịch DaXacNhan mới, giờ hẹn trong [07:00 + 2:05, 07:00 + 3:05], khung giờ DaDat; created = 6; Lễ tân KHÔNG có thông báo mẫu (danh mục chưa có sự kiện nào gửi Lễ tân)', async () => {
    await prerequisites();
    const before = await snapshot();

    expect(await seed()).toEqual({ created: 6, skipped: 0 });

    for (const account of NOTIFICATION_DEMO_ACCOUNTS) {
      const rows = await db.query<
        { loai: string; daDoc: number; noiDung: string }[]
      >(
        `SELECT t.loai_su_kien AS loai, t.trang_thai_doc AS daDoc, t.noi_dung AS noiDung
           FROM thong_bao t JOIN tai_khoan tk ON tk.tai_khoan_id = t.tai_khoan_id
          WHERE tk.email = ?`,
        [account.email],
      );
      expect(rows, account.email).toHaveLength(NOTIFICATION_DEMO_PER_ACCOUNT);
      expect(rows.filter((r) => Number(r.daDoc) === 1)).toHaveLength(9);
      for (const row of rows) {
        expect(row.noiDung.startsWith(NOTIFICATION_DEMO_PREFIX)).toBe(true);
        const entry = NOTIFICATION_CATALOG.find((e) => e.ma === row.loai);
        expect(entry?.nguoiNhan, row.loai).toContain(account.vaiTro);
      }
    }
    expect(
      await count(
        `SELECT COUNT(*) AS n FROM thong_bao t JOIN tai_khoan tk ON tk.tai_khoan_id = t.tai_khoan_id WHERE tk.email = 'receptionist@example.invalid'`,
      ),
    ).toBe(0);
    const after = await snapshot();
    expect(after.thongBao - before.thongBao).toBe(
      NOTIFICATION_DEMO_ACCOUNTS.length * NOTIFICATION_DEMO_PER_ACCOUNT,
    );
    expect(after.email).toBe(before.email);
    expect(after.lichHen - before.lichHen).toBe(1);
    expect(after.ca - before.ca).toBe(1);

    const [lich] = await db.query<
      { trangThai: string; thoiGian: string; slot: string; slotAt: string }[]
    >(
      `SELECT l.trang_thai AS trangThai, DATE_FORMAT(l.thoi_gian, '%Y-%m-%d %H:%i:%s') AS thoiGian,
              k.trang_thai AS slot, DATE_FORMAT(k.ngay_gio, '%Y-%m-%d %H:%i:%s') AS slotAt
         FROM lich_hen l JOIN khung_gio k ON k.khung_gio_id = l.khung_gio_id WHERE l.ma_lich_hen = ?`,
      [CODE],
    );
    expect(lich).toMatchObject({ trangThai: 'DaXacNhan', slot: 'DaDat' });
    expect(lich!.slotAt).toBe(lich!.thoiGian);
    expect(lich!.thoiGian >= '2026-11-18 09:05:00').toBe(true);
    expect(lich!.thoiGian <= '2026-11-18 10:05:00').toBe(true);
  });

  it('NDS-02 chạy lại cùng ngày: không thêm dòng nào; created = 0, skipped = 5 (bốn tài khoản đã đủ, lịch mẫu đã có)', async () => {
    await prerequisites();
    await seed();
    const before = await snapshot();
    expect(await seed()).toEqual({ created: 0, skipped: 5 });
    expect(await snapshot()).toEqual(before);
  });

  it('NDS-03 chưa chạy dev-accounts ⇒ SEED_DEV_ACCOUNTS_REQUIRED, không ghi gì', async () => {
    await runSeed(db, config('catalog'));
    await runSeed(db, config('config-dev'));
    const before = await snapshot();
    expect(await failureOf(seed())).toBe('SEED_DEV_ACCOUNTS_REQUIRED');
    expect(await snapshot()).toEqual(before);
  });

  it('NDS-04 cấu hình không có mốc 2 giờ ⇒ SEED_REMINDER_CONFIG_REQUIRED, seed KHÔNG tự sửa cấu hình, không ghi gì', async () => {
    await prerequisites();
    await db.query(
      'UPDATE cau_hinh_he_thong SET thoi_diem_nhac_lich = ? WHERE id = 1',
      [JSON.stringify([72, 24])],
    );
    const before = await snapshot();
    expect(await failureOf(seed())).toBe('SEED_REMINDER_CONFIG_REQUIRED');
    expect(await snapshot()).toEqual(before);
  });

  it('NDS-05 chạy lúc 22:00 (không còn khung giờ nào trong 2:05 đến 3:05 tới) ⇒ SEED_REMINDER_SLOT_UNAVAILABLE và hoàn tác CẢ thông báo mẫu đã ghi trong cùng giao dịch', async () => {
    await prerequisites();
    const before = await snapshot();
    expect(await failureOf(seed(new Date('2026-11-18T15:00:00.000Z')))).toBe(
      'SEED_REMINDER_SLOT_UNAVAILABLE',
    );
    expect(await snapshot()).toEqual(before);
  });

  it('NDS-06 job nhắc lịch THẬT (FakeMailService) ở đúng mốc 2 giờ của lịch mẫu: đúng MỘT thư tới bệnh nhân dev; trước mốc thì không thư', async () => {
    await prerequisites();
    await seed();
    const [lich] = await db.query<{ thoiGian: string }[]>(
      `SELECT DATE_FORMAT(thoi_gian, '%Y-%m-%dT%H:%i:%s+07:00') AS thoiGian FROM lich_hen WHERE ma_lich_hen = ?`,
      [CODE],
    );
    const due = new Date(new Date(lich!.thoiGian).getTime() - 2 * 3_600_000);
    const mail = new FakeMailService();
    const { service } = createReminderService(db, mail);

    await sweepAt(service, new Date(due.getTime() - 60_000));
    expect(mail.sent).toHaveLength(0);
    await sweepAt(service, due);
    expect(mail.sent.map((m) => m.to)).toEqual(['patient@example.invalid']);
  });
});
