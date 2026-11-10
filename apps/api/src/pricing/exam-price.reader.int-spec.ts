import type { DataSource } from 'typeorm';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../database/testing/test-database.js';
import { computeExamPrice, computeSurcharge } from './surcharge.calculator.js';
import { SearchFixtures } from '../search/testing/search-fixtures.js';
import { ExamPriceReader } from './exam-price.reader.js';

// B4 — TBS-08: giá áp dụng đọc từ MySQL thật, so TRỰC TIẾP với hàm chung (không tự tính lại).
let db: DataSource;
let fixtures: SearchFixtures;
let reader: ExamPriceReader;
beforeAll(async () => {
  db = await createTestDataSource(readTestDbSettings());
  fixtures = new SearchFixtures(db);
  reader = new ExamPriceReader(db);
});
beforeEach(async () => {
  await resetTables(db);
});
afterAll(async () => {
  await db?.destroy();
});

describe('B4 — ExamPriceReader', () => {
  it('TBS-08a: chưa có quy tắc nào ⇒ phụ phí 0.00, giá = giá mặc định', async () => {
    const rules = await reader.loadRules();
    expect(rules).toEqual([]);
    expect(
      reader.priceFor('200000.00', rules, {
        chucDanh: 'BS_CKII',
        soNamKinhNghiem: 10,
      }),
    ).toEqual({ phuPhi: '0.00', giaKham: '200000.00' });
  });

  it('TBS-08b: đọc đủ kiểu dữ liệu (decimal ⇒ chuỗi, ap_dung ⇒ boolean, mốc ⇒ number)', async () => {
    await fixtures.surchargeRule('BS_CKII', 5, '150000.00');
    await fixtures.surchargeRule('BS_CKII', 10, '300000.00', false);
    const rules = await reader.loadRules();
    const byMilestone = new Map(rules.map((r) => [r.soNamKinhNghiemTu, r]));
    expect(byMilestone.get(5)).toMatchObject({
      chucDanh: 'BS_CKII',
      phuPhi: '150000.00',
      apDung: true,
    });
    expect(byMilestone.get(10)).toMatchObject({
      phuPhi: '300000.00',
      apDung: false,
    });
  });

  it('TBS-08c: đúng chức danh, mốc cao tắt thì rơi xuống mốc thấp, khác chức danh bị bỏ — khớp hàm chung', async () => {
    await fixtures.surchargeRule('BS_CKII', 0, '50000.00');
    await fixtures.surchargeRule('BS_CKII', 5, '150000.00');
    await fixtures.surchargeRule('BS_CKII', 10, '300000.00', false);
    await fixtures.surchargeRule('GS_TS_BS', 0, '900000.00');
    const rules = await reader.loadRules();

    const cases = [
      { chucDanh: 'BS_CKII', soNamKinhNghiem: 12, phuPhi: '150000.00' }, // mốc 10 đã tắt ⇒ rơi mốc 5
      { chucDanh: 'BS_CKII', soNamKinhNghiem: 0, phuPhi: '50000.00' }, // 0 năm khớp mốc 0
      { chucDanh: 'BS_CKII', soNamKinhNghiem: 5, phuPhi: '150000.00' }, // biên đóng
      { chucDanh: 'BS_CKI', soNamKinhNghiem: 20, phuPhi: '0.00' }, // chức danh không có quy tắc
    ] as const;
    for (const { phuPhi, ...doctor } of cases) {
      const price = reader.priceFor('200000.00', rules, doctor);
      expect(price.phuPhi).toBe(phuPhi);
      // So trực tiếp với hàm chung, không tự cộng lại.
      expect(price.phuPhi).toBe(computeSurcharge(rules, doctor));
      expect(price.giaKham).toBe(computeExamPrice('200000.00', rules, doctor));
    }
  });
});
