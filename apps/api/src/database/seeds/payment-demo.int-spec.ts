import { randomBytes } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { assertWalletInvariants } from '../../wallet/testing/wallet-invariants.js';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../testing/test-database.js';
import {
  PAYMENT_DEMO_GATEWAY_CODE,
  PAYMENT_DEMO_PATIENT_EMAIL,
  PAYMENT_DEMO_SERVICES,
} from './payment-demo-data.js';
import type { SeedCommand, SeedConfig } from './seed-config.js';
import { runSeed } from './seed.service.js';

// payment B18 — seed payment-demo trên MySQL 8.4 THẬT (PLAN payment Q7, H10): MGT-13 (idempotent: chạy hai lần không trùng) và các ca biên: không đè cấu hình đã có, thiếu điều kiện ⇒ lỗi cố định
// và không ghi gì, bất biến ví IVT giữ. Test tự động KHÁC không dùng seed này (PLAN 5 "Dữ liệu mẫu"). Dữ liệu giả.
describe('payment B18 — seed payment-demo (MySQL thật)', () => {
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
  };

  /** Cọc và mốc (giờ giảm dần) của hai dịch vụ mẫu, theo thứ tự trong `PAYMENT_DEMO_SERVICES`. */
  const policies = async () => {
    const result = [];
    for (const service of PAYMENT_DEMO_SERVICES) {
      const [row] = await db.query<{ id: string; coc: string }[]>(
        `SELECT CAST(s.dich_vu_kham_id AS CHAR) AS id, CAST(s.muc_dat_coc AS CHAR) AS coc FROM dich_vu_kham s
           JOIN nhom_dich_vu g ON g.nhom_dich_vu_id = s.nhom_dich_vu_id WHERE s.ten = ? AND g.ten = ?`,
        [service.name, service.group],
      );
      const tiers = await db.query<{ gio: number; tyLe: number }[]>(
        'SELECT so_gio_truoc_toi_thieu AS gio, ty_le_hoan AS tyLe FROM moc_hoan_tien WHERE dich_vu_kham_id = ? ORDER BY so_gio_truoc_toi_thieu DESC',
        [row!.id],
      );
      result.push({ id: row!.id, coc: row!.coc, moc: tiers });
    }
    return result;
  };

  const patientWallet = async () =>
    (
      await db.query<{ soDu: string; dangGiu: string }[]>(
        `SELECT CAST(v.so_du AS CHAR) AS soDu, CAST(v.so_tien_dang_giu AS CHAR) AS dangGiu FROM vi_noi_bo v
           JOIN tai_khoan tk ON tk.tai_khoan_id = v.benh_nhan_id WHERE tk.email = ?`,
        [PAYMENT_DEMO_PATIENT_EMAIL],
      )
    )[0];

  const count = async (sql: string, params: unknown[] = []) =>
    Number((await db.query<{ n: string }[]>(sql, params))[0]!.n);

  /** Ảnh chụp mọi bảng seed này có thể ghi, để so "không đổi một hàng". */
  const snapshot = async () => ({
    policies: await policies().catch(() => null),
    wallet: await patientWallet(),
    payments: await count('SELECT COUNT(*) AS n FROM giao_dich_thanh_toan'),
    ledger: await count('SELECT COUNT(*) AS n FROM giao_dich_vi'),
    tiers: await count('SELECT COUNT(*) AS n FROM moc_hoan_tien'),
    notices: await count('SELECT COUNT(*) AS n FROM thong_bao'),
  });

  const EXPECTED_TIERS = [
    { gio: 24, tyLe: 100 },
    { gio: 2, tyLe: 50 },
    { gio: 0, tyLe: 0 },
  ];

  it('MGT-13 lần đầu: hai dịch vụ cọc 100.000đ kèm mốc 24 → 100, 2 → 50, 0 → 0; ví của patient@example.invalid 500.000đ qua MỘT lần nạp VNPay ThanhCong; không thông báo; IVT giữ', async () => {
    await seedPrerequisites();
    const notices = await count('SELECT COUNT(*) AS n FROM thong_bao');

    expect(await runSeed(db, config('payment-demo'))).toEqual({
      created: 3,
      skipped: 0,
    });

    expect(await policies()).toEqual([
      expect.objectContaining({ coc: '100000.00', moc: EXPECTED_TIERS }),
      expect.objectContaining({ coc: '100000.00', moc: EXPECTED_TIERS }),
    ]);
    // Dịch vụ thứ ba của catalog (Tư vấn từ xa) không bị chạm
    expect(
      await count(
        'SELECT COUNT(*) AS n FROM dich_vu_kham WHERE muc_dat_coc > 0',
      ),
    ).toBe(2);
    expect(await patientWallet()).toEqual({
      soDu: '500000.00',
      dangGiu: '0.00',
    });
    expect(
      await db.query(
        `SELECT loai, phuong_thuc AS phuongThuc, CAST(so_tien AS CHAR) AS soTien, trang_thai AS trangThai, trang_thai_doi_soat AS doiSoat, lich_hen_id AS lichHenId
           FROM giao_dich_thanh_toan WHERE ma_giao_dich_cong = ?`,
        [PAYMENT_DEMO_GATEWAY_CODE],
      ),
    ).toEqual([
      {
        loai: 'NapVi',
        phuongThuc: 'VNPay',
        soTien: '500000.00',
        trangThai: 'ThanhCong',
        doiSoat: 'KhongCan',
        lichHenId: null,
      },
    ]);
    expect(
      await db.query(
        `SELECT loai, CAST(so_tien AS CHAR) AS soTien, CAST(so_du_sau AS CHAR) AS soDuSau FROM giao_dich_vi`,
      ),
    ).toEqual([{ loai: 'Nap', soTien: '500000.00', soDuSau: '500000.00' }]);
    expect(await count('SELECT COUNT(*) AS n FROM thong_bao')).toBe(notices);
    await assertWalletInvariants(db);
  });

  it('MGT-13 ★ chạy hai lần không trùng: lần hai bỏ qua cả ba việc, không đổi một hàng nào (không nạp lần hai)', async () => {
    await seedPrerequisites();
    await runSeed(db, config('payment-demo'));
    const before = await snapshot();

    expect(await runSeed(db, config('payment-demo'))).toEqual({
      created: 0,
      skipped: 3,
    });

    expect(await snapshot()).toEqual(before);
    await assertWalletInvariants(db);
  });

  it('không đè cấu hình đã có: dịch vụ đã có cọc (Quản trị viên sửa) hay đã có mốc thì giữ nguyên; dịch vụ còn lại vẫn được gắn', async () => {
    await seedPrerequisites();
    const [first, second] = await policies();
    // Dịch vụ 1: Quản trị viên đã đặt cọc 50.000đ, không mốc. Dịch vụ 2: cọc 0đ nhưng đã có một mốc
    await db.query(
      'UPDATE dich_vu_kham SET muc_dat_coc = 50000 WHERE dich_vu_kham_id = ?',
      [first!.id],
    );
    await db.query(
      'INSERT INTO moc_hoan_tien (dich_vu_kham_id, so_gio_truoc_toi_thieu, ty_le_hoan) VALUES (?, 12, 80)',
      [second!.id],
    );

    expect(await runSeed(db, config('payment-demo'))).toEqual({
      created: 1,
      skipped: 2,
    });

    expect(await policies()).toEqual([
      expect.objectContaining({ coc: '50000.00', moc: [] }),
      expect.objectContaining({ coc: '0.00', moc: [{ gio: 12, tyLe: 80 }] }),
    ]);
    // Phần ví vẫn chạy
    expect((await patientWallet())!.soDu).toBe('500000.00');
  });

  it('chạy lại sau khi ví đã được dùng thử (đang giữ tiền cho yêu cầu rút): khoá là mã cổng, không phải số dư, nên không nạp thêm và không đụng số đang giữ', async () => {
    await seedPrerequisites();
    await runSeed(db, config('payment-demo'));
    // Giả lập ví đã đổi sau lần seed đầu (giữ 100.000đ); chạy lại vẫn không nạp thêm
    await db.query(
      `UPDATE vi_noi_bo v JOIN tai_khoan tk ON tk.tai_khoan_id = v.benh_nhan_id SET v.so_tien_dang_giu = 100000 WHERE tk.email = ?`,
      [PAYMENT_DEMO_PATIENT_EMAIL],
    );
    await runSeed(db, config('payment-demo'));
    expect(await patientWallet()).toEqual({
      soDu: '500000.00',
      dangGiu: '100000.00',
    });
    expect(await count('SELECT COUNT(*) AS n FROM giao_dich_vi')).toBe(1);
  });

  it.each([
    ['chưa chạy catalog', 'SEED_CATALOG_REQUIRED', false],
    ['chưa chạy dev-accounts', 'SEED_DEV_ACCOUNTS_REQUIRED', true],
  ] as const)(
    '%s ⇒ %s, không ghi gì (cả giao dịch hoàn tác)',
    async (_name, code, withCatalog) => {
      if (withCatalog) await runSeed(db, config('catalog'));
      const before = await snapshot();

      await expect(runSeed(db, config('payment-demo'))).rejects.toMatchObject({
        code,
      });

      expect(await snapshot()).toEqual(before);
    },
  );
});
