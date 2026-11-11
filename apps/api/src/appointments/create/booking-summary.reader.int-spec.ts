import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { addMoney } from '../../pricing/money.js';
import { ExamPriceReader } from '../../pricing/exam-price.reader.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { BookingSummaryReader } from './booking-summary.reader.js';
import { RefundPolicyReader } from './refund-policy.js';

// Task B7 — BCK-05 (TRACKING booking 3.18.3): `BookingSummaryReader` trên MySQL 8.4 THẬT: từng khoá và kiểu của `tomTat`, `giaApDung` có và không quy tắc phụ phí và bằng `giaDichVu + phuPhi`, bằng giá mà
// `ExamPriceReader` (cùng hàm với thẻ bác sĩ của `search`) trả cho cùng bác sĩ, chi nhánh HIỆN TẠI của bác sĩ, người khám (bản thân, người thân), mốc hoàn trên `moc_hoan_tien` thật, và quét JSON không lộ id
// nội bộ, email, SĐT hay băm. So với HTTP thật của `search`: booking-checks.e2e-spec.ts. Dữ liệu giả.
let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

const prices = new ExamPriceReader({} as unknown as DataSource);
const reader = new BookingSummaryReader(prices, new RefundPolicyReader());

async function world() {
  const w = await fx.world();
  const patientId = w.patient.account.taiKhoanId;
  const input = (hoSoNguoiThanId: string | null = null) => ({
    bacSiId: w.doctor.account.taiKhoanId,
    thoiGian: new Date('2026-11-10T01:00:00.000Z'),
    benhNhanId: patientId,
    hoSoNguoiThanId,
  });
  const dichVuKhamId = w.doctor.profile.dichVuKhamId;
  const read = (hoSoNguoiThanId: string | null = null) =>
    db.transaction('READ COMMITTED', (em) =>
      reader.read(em, input(hoSoNguoiThanId)),
    );
  return { ...w, patientId, dichVuKhamId, read };
}

const setDeposit = (dichVuKhamId: string, tienCoc: string) =>
  db.query(
    'UPDATE dich_vu_kham SET muc_dat_coc = ? WHERE dich_vu_kham_id = ?',
    [tienCoc, dichVuKhamId],
  );

describe('BookingSummaryReader trên MySQL thật (BCK-05)', () => {
  it('BCK-05 đủ 11 khoá, đúng nguồn và đúng kiểu (bản thân, không cọc, không phụ phí)', async () => {
    const w = await world();

    const summary = await w.read();

    expect(Object.keys(summary).sort()).toStrictEqual(
      [
        'bacSi',
        'chiNhanh',
        'chinhSachHoan',
        'chuyenKhoa',
        'dichVu',
        'giaApDung',
        'giaDichVu',
        'nguoiKham',
        'phuPhi',
        'thoiGian',
        'tienCoc',
      ].sort(),
    );
    expect(summary.dichVu.thoiLuongPhut).toBe(30);
    expect(typeof summary.dichVu.ten).toBe('string');
    expect(summary.bacSi).toStrictEqual({
      hoTen: w.doctor.account.hoTen,
      chucDanh: 'BS',
    });
    expect(summary.chiNhanh).toStrictEqual({
      ten: w.branch.ten,
      diaChi: w.branch.diaChi,
    });
    expect(summary.thoiGian).toBe('2026-11-10T01:00:00.000Z');
    expect(summary.nguoiKham).toStrictEqual({
      hoTen: w.patient.account.hoTen,
      laBanThan: true,
    });
    expect(summary.giaDichVu).toBe('100000.00');
    expect(summary.phuPhi).toBe('0.00');
    expect(summary.giaApDung).toBe('100000.00');
    expect(summary.tienCoc).toBe('0.00');
    expect(summary.chinhSachHoan).toBeNull();
  });

  it('BCK-05 có quy tắc phụ phí ⇒ giaApDung = giaDichVu + phuPhi và bằng giá ExamPriceReader (cùng hàm với thẻ bác sĩ của search) cho cùng bác sĩ', async () => {
    const w = await world();
    await db.query(
      "INSERT INTO phu_phi_bac_si (chuc_danh, so_nam_kinh_nghiem_tu, phu_phi, ap_dung) VALUES ('BS', 0, '50000.00', 1)",
    );

    const summary = await w.read();
    const rules = await prices.loadRules(db.manager);
    const expected = prices.priceFor(summary.giaDichVu, rules, {
      chucDanh: 'BS',
      soNamKinhNghiem: 0,
    });

    expect(summary.phuPhi).toBe('50000.00');
    expect(summary.giaApDung).toBe('150000.00');
    expect(summary.giaApDung).toBe(addMoney(summary.giaDichVu, summary.phuPhi));
    expect(summary.phuPhi).toBe(expected.phuPhi);
    expect(summary.giaApDung).toBe(expected.giaKham);
  });

  it('BCK-05 quy tắc đã tắt (ap_dung = 0) hoặc của chức danh khác ⇒ không phụ phí', async () => {
    const w = await world();
    await db.query(
      "INSERT INTO phu_phi_bac_si (chuc_danh, so_nam_kinh_nghiem_tu, phu_phi, ap_dung) VALUES ('BS', 0, '70000.00', 0), ('TS_BS', 0, '90000.00', 1)",
    );

    const summary = await w.read();

    expect(summary.phuPhi).toBe('0.00');
    expect(summary.giaApDung).toBe(summary.giaDichVu);
  });

  it('BCK-05 bác sĩ đổi chi nhánh ⇒ chiNhanh là chi nhánh HIỆN TẠI của bác sĩ (D12), không phải chi nhánh ghi trên ca', async () => {
    const w = await world();
    const moved = await fx.admin.branch({ ten: 'Chi nhánh chuyển đến' });
    await db.query(
      'UPDATE bac_si SET chi_nhanh_id = ? WHERE tai_khoan_id = ?',
      [moved.chiNhanhId, w.doctor.account.taiKhoanId],
    );

    const summary = await w.read();

    expect(summary.chiNhanh.ten).toBe('Chi nhánh chuyển đến');
    expect(summary.chiNhanh.ten).not.toBe(w.branch.ten);
  });

  it('BCK-05 người khám: bản thân lấy tên tài khoản; người thân lấy tên hồ sơ người thân và laBanThan = false', async () => {
    const w = await world();
    const relativeId = await fx.relative(w.patientId, {
      hoTen: 'Người Thân Tóm Tắt',
    });

    const self = await w.read();
    const relative = await w.read(relativeId);

    expect(self.nguoiKham).toStrictEqual({
      hoTen: w.patient.account.hoTen,
      laBanThan: true,
    });
    expect(relative.nguoiKham).toStrictEqual({
      hoTen: 'Người Thân Tóm Tắt',
      laBanThan: false,
    });
  });

  it('BCK-05 hồ sơ người thân của NGƯỜI KHÁC không bao giờ lộ tên (phạm vi chủ sở hữu trong SQL): reader ném lỗi thay vì trả tên', async () => {
    const w = await world();
    const other = await fx.admin.patient();
    const othersRelative = await fx.relative(other.account.taiKhoanId, {
      hoTen: 'Tên Không Được Lộ',
    });

    await expect(w.read(othersRelative)).rejects.toThrow();
  });

  it('BCK-05 chinhSachHoan trên moc_hoan_tien thật: cọc 0 ⇒ null (dù có mốc); cọc > 0 chưa mốc ⇒ []; có mốc ⇒ giảm dần camelCase', async () => {
    const w = await world();
    await db.query(
      'INSERT INTO moc_hoan_tien (dich_vu_kham_id, so_gio_truoc_toi_thieu, ty_le_hoan) VALUES (?, 2, 50), (?, 24, 100)',
      [w.dichVuKhamId, w.dichVuKhamId],
    );

    expect((await w.read()).chinhSachHoan).toBeNull();

    await setDeposit(w.dichVuKhamId, '50000.00');
    const withTiers = await w.read();
    expect(withTiers.tienCoc).toBe('50000.00');
    expect(withTiers.chinhSachHoan).toStrictEqual([
      { soGioTruocToiThieu: 24, tyLeHoan: 100 },
      { soGioTruocToiThieu: 2, tyLeHoan: 50 },
    ]);

    await db.query('DELETE FROM moc_hoan_tien WHERE dich_vu_kham_id = ?', [
      w.dichVuKhamId,
    ]);
    expect((await w.read()).chinhSachHoan).toStrictEqual([]);
  });

  it('BCK-05 quét JSON: không khoá nào kết thúc bằng Id, không email, SĐT, băm mật khẩu hay mã lịch hẹn', async () => {
    const w = await world();
    const relativeId = await fx.relative(w.patientId, {
      hoTen: 'Người Thân Quét',
    });
    await setDeposit(w.dichVuKhamId, '50000.00');
    await db.query(
      'INSERT INTO moc_hoan_tien (dich_vu_kham_id, so_gio_truoc_toi_thieu, ty_le_hoan) VALUES (?, 24, 100)',
      [w.dichVuKhamId],
    );

    const summary = await w.read(relativeId);
    const keys: string[] = [];
    const walk = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (typeof value === 'object' && value !== null)
        for (const [key, child] of Object.entries(value)) {
          keys.push(key);
          walk(child);
        }
    };
    walk(summary);
    const json = JSON.stringify(summary);

    expect(keys.filter((key) => key.endsWith('Id'))).toStrictEqual([]);
    expect(json).not.toContain(w.doctor.account.email);
    expect(json).not.toContain(w.patient.account.email);
    expect(json).not.toMatch(/@/);
    expect(json).not.toMatch(/matKhau|mat_khau|hash|argon|soDienThoai|CLX-/i);
  });
});
