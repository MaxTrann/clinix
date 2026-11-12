import type { DataSource, EntityManager } from 'typeorm';
import { vi } from 'vitest';
import { addMoney } from '../../pricing/money.js';
import { ExamPriceReader } from '../../pricing/exam-price.reader.js';
import { BookingSummaryReader } from './booking-summary.reader.js';
import { RefundPolicyReader } from './refund-policy.js';

// Task B7 — dựng `tomTat` từ MỘT câu SELECT cộng quy tắc phụ phí và mốc hoàn (BCK-05, phần đơn vị; TRACKING booking 3.18 B7-E). `EntityManager` giả định tuyến theo bảng được đọc; hai reader giá và
// hoàn là bản THẬT (chỉ cần `em`). Dữ liệu thật: booking-summary.reader.int-spec.ts. Mã BCK-nn là [đề xuất].
interface SummaryRow {
  dichVuKhamId: string;
  dichVu: string;
  thoiLuong: number | string;
  chuyenKhoa: string;
  bacSiHoTen: string;
  chucDanh: string;
  soNamKinhNghiem: number | string;
  chiNhanhTen: string;
  chiNhanhDiaChi: string;
  giaMacDinh: string;
  mucDatCoc: string;
  nguoiThanHoTen: string | null;
  benhNhanHoTen: string;
}

const ROW: SummaryRow = {
  dichVuKhamId: '7',
  dichVu: 'Khám nội tổng quát',
  thoiLuong: 30,
  chuyenKhoa: 'Nội',
  bacSiHoTen: 'Bác sĩ Mẫu',
  chucDanh: 'BS_CKI',
  soNamKinhNghiem: 10,
  chiNhanhTen: 'Chi nhánh 1',
  chiNhanhDiaChi: '1 Đường Mẫu',
  giaMacDinh: '150000.00',
  mucDatCoc: '0.00',
  nguoiThanHoTen: null,
  benhNhanHoTen: 'Bệnh Nhân A',
};

interface Setup {
  summary?: Partial<SummaryRow> | null;
  rules?: unknown[];
  tiers?: unknown[];
}

function build({ summary = {}, rules = [], tiers = [] }: Setup = {}) {
  const query = vi.fn((sql: string, _params?: unknown[]) => {
    if (sql.includes('FROM phu_phi_bac_si')) return Promise.resolve(rules);
    if (sql.includes('FROM moc_hoan_tien')) return Promise.resolve(tiers);
    return Promise.resolve(summary === null ? [] : [{ ...ROW, ...summary }]);
  });
  const reader = new BookingSummaryReader(
    new ExamPriceReader({} as unknown as DataSource),
    new RefundPolicyReader(),
  );
  return { reader, query, em: { query } as unknown as EntityManager };
}

const INPUT = {
  bacSiId: '5',
  thoiGian: new Date('2026-11-10T01:00:00.000Z'),
  benhNhanId: '77',
  hoSoNguoiThanId: null,
};

describe('BookingSummaryReader: từng khoá của tomTat (BCK-05, DL-24)', () => {
  it('BCK-05 đúng 11 khoá (soDuVi do service thêm sau, vì cổng ví chạy ngoài giao dịch), đúng nguồn và đúng kiểu', async () => {
    const { reader, em } = build();

    const summary = await reader.read(em, INPUT);

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
    expect(summary).toStrictEqual({
      dichVu: { ten: 'Khám nội tổng quát', thoiLuongPhut: 30 },
      chuyenKhoa: 'Nội',
      bacSi: { hoTen: 'Bác sĩ Mẫu', chucDanh: 'BS_CKI' },
      chiNhanh: { ten: 'Chi nhánh 1', diaChi: '1 Đường Mẫu' },
      thoiGian: '2026-11-10T01:00:00.000Z',
      nguoiKham: { hoTen: 'Bệnh Nhân A', laBanThan: true },
      giaDichVu: '150000.00',
      phuPhi: '0.00',
      giaApDung: '150000.00',
      tienCoc: '0.00',
      chinhSachHoan: null,
    });
  });

  it('BCK-05 MỘT câu SELECT cho tóm tắt (theo bác sĩ), chỉ đọc, tham số là chuỗi, không hàm giờ của DB', async () => {
    const { reader, em, query } = build();

    await reader.read(em, INPUT);

    const summarySql = query.mock.calls
      .map(([sql]) => sql)
      .filter((sql) => !sql.includes('phu_phi_bac_si'));
    expect(summarySql).toHaveLength(1);
    const [sql, params] =
      query.mock.calls.find(([text]) => text === summarySql[0]) ?? [];
    expect(sql).toMatch(/^\s*SELECT\b/i);
    expect(sql).not.toMatch(/\bFOR\s+(UPDATE|SHARE)\b/i);
    expect(sql).not.toMatch(
      /\b(NOW|CURDATE|CURTIME|SYSDATE|UTC_TIMESTAMP)\s*\(/i,
    );
    expect(sql).toContain('bs.tai_khoan_id = ?');
    expect(params).toContain('5');
    for (const param of params ?? [])
      expect(param === null || typeof param === 'string').toBe(true);
  });

  it('BCK-05 giá: có quy tắc phụ phí ⇒ giaApDung = giaDichVu + phuPhi, cùng công thức với `search` (ExamPriceReader.priceFor)', async () => {
    const rules = [
      {
        chucDanh: 'BS_CKI',
        soNamKinhNghiemTu: 5,
        phuPhi: '50000.00',
        apDung: 1,
      },
      {
        chucDanh: 'BS_CKI',
        soNamKinhNghiemTu: 20,
        phuPhi: '90000.00',
        apDung: 1,
      },
      {
        chucDanh: 'TS_BS',
        soNamKinhNghiemTu: 0,
        phuPhi: '70000.00',
        apDung: 1,
      },
    ];
    const { reader, em } = build({ rules });

    const summary = await reader.read(em, INPUT);
    const expected = new ExamPriceReader({} as unknown as DataSource).priceFor(
      '150000.00',
      [
        {
          chucDanh: 'BS_CKI',
          soNamKinhNghiemTu: 5,
          phuPhi: '50000.00',
          apDung: true,
        },
        {
          chucDanh: 'BS_CKI',
          soNamKinhNghiemTu: 20,
          phuPhi: '90000.00',
          apDung: true,
        },
        {
          chucDanh: 'TS_BS',
          soNamKinhNghiemTu: 0,
          phuPhi: '70000.00',
          apDung: true,
        },
      ],
      { chucDanh: 'BS_CKI', soNamKinhNghiem: 10 },
    );

    expect(summary.phuPhi).toBe('50000.00');
    expect(summary.giaApDung).toBe('200000.00');
    expect(summary.giaApDung).toBe(addMoney(summary.giaDichVu, summary.phuPhi));
    expect(summary.phuPhi).toBe(expected.phuPhi);
    expect(summary.giaApDung).toBe(expected.giaKham);
  });

  it('BCK-05 quy tắc đã tắt (apDung = 0) bị loại: phuPhi "0.00", giaApDung = giaDichVu', async () => {
    const { reader, em } = build({
      rules: [
        {
          chucDanh: 'BS_CKI',
          soNamKinhNghiemTu: 0,
          phuPhi: '99000.00',
          apDung: 0,
        },
      ],
    });

    const summary = await reader.read(em, INPUT);

    expect(summary.phuPhi).toBe('0.00');
    expect(summary.giaApDung).toBe(summary.giaDichVu);
  });

  it('BCK-05 người khám: bản thân lấy tên tài khoản; người thân lấy tên hồ sơ người thân và laBanThan = false', async () => {
    const self = build();
    const relative = build({ summary: { nguoiThanHoTen: 'Người Thân B' } });

    const ofSelf = await self.reader.read(self.em, INPUT);
    const ofRelative = await relative.reader.read(relative.em, {
      ...INPUT,
      hoSoNguoiThanId: '9',
    });

    expect(ofSelf.nguoiKham).toStrictEqual({
      hoTen: 'Bệnh Nhân A',
      laBanThan: true,
    });
    expect(ofRelative.nguoiKham).toStrictEqual({
      hoTen: 'Người Thân B',
      laBanThan: false,
    });
  });

  it('BCK-05 hồ sơ người thân vào câu SQL kèm benh_nhan_id của chủ (phạm vi chủ sở hữu trong SQL, H3)', async () => {
    const { reader, em, query } = build({ summary: { nguoiThanHoTen: 'B' } });

    await reader.read(em, { ...INPUT, hoSoNguoiThanId: '9' });

    const call = query.mock.calls.find(([sql]) =>
      sql.includes('bs.tai_khoan_id = ?'),
    );
    expect(call?.[0]).toContain('hs.benh_nhan_id = ?');
    expect(call?.[1]).toStrictEqual(expect.arrayContaining(['9', '77']));
  });

  it('BCK-05 thời lượng là SỐ (MySQL có thể trả chuỗi); tiền giữ nguyên chuỗi decimal của DB', async () => {
    const { reader, em } = build({
      summary: {
        thoiLuong: '45',
        giaMacDinh: '350000.50',
        mucDatCoc: '10000.00',
      },
    });

    const summary = await reader.read(em, INPUT);

    expect(summary.dichVu.thoiLuongPhut).toBe(45);
    expect(typeof summary.dichVu.thoiLuongPhut).toBe('number');
    expect(summary.giaDichVu).toBe('350000.50');
    expect(summary.tienCoc).toBe('10000.00');
  });

  it('BCK-05 quét JSON: không khoá nào kết thúc bằng Id, không email, SĐT hay băm', async () => {
    const { reader, em } = build({
      summary: { nguoiThanHoTen: 'Người Thân B', mucDatCoc: '50000.00' },
      tiers: [{ soGioTruocToiThieu: 24, tyLeHoan: 100 }],
    });

    const summary = await reader.read(em, { ...INPUT, hoSoNguoiThanId: '9' });
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

    expect(keys.filter((key) => key.endsWith('Id'))).toStrictEqual([]);
    const json = JSON.stringify(summary);
    expect(json).not.toMatch(/@/);
    expect(json).not.toMatch(
      /mat_khau|matKhau|hash|so_dien_thoai|soDienThoai|email/i,
    );
  });
});

describe('BookingSummaryReader: chính sách hoàn (BCK-03, BCK-04, B7-E)', () => {
  it('BCK-03 cọc 0 ⇒ chinhSachHoan null và KHÔNG đọc moc_hoan_tien', async () => {
    const { reader, em, query } = build({
      tiers: [{ soGioTruocToiThieu: 24, tyLeHoan: 100 }],
    });

    const summary = await reader.read(em, INPUT);

    expect(summary.chinhSachHoan).toBeNull();
    expect(
      query.mock.calls.some(([sql]) => sql.includes('moc_hoan_tien')),
    ).toBe(false);
  });

  it('BCK-03 cọc > 0 chưa có mốc ⇒ [] (không hoàn), khác null', async () => {
    const { reader, em } = build({
      summary: { mucDatCoc: '50000.00' },
      tiers: [],
    });

    const summary = await reader.read(em, INPUT);

    expect(summary.tienCoc).toBe('50000.00');
    expect(summary.chinhSachHoan).toStrictEqual([]);
  });

  it('BCK-03 cọc > 0 có mốc ⇒ camelCase, giảm dần dù DB trả lộn thứ tự, đọc đúng dịch vụ của bác sĩ', async () => {
    const { reader, em, query } = build({
      summary: { mucDatCoc: '50000.00', dichVuKhamId: '9007199254740993' },
      tiers: [
        { soGioTruocToiThieu: 2, tyLeHoan: 50 },
        { soGioTruocToiThieu: 24, tyLeHoan: 100 },
      ],
    });

    const summary = await reader.read(em, INPUT);

    expect(summary.chinhSachHoan).toStrictEqual([
      { soGioTruocToiThieu: 24, tyLeHoan: 100 },
      { soGioTruocToiThieu: 2, tyLeHoan: 50 },
    ]);
    const tierCall = query.mock.calls.find(([sql]) =>
      sql.includes('moc_hoan_tien'),
    );
    expect(tierCall?.[1]).toStrictEqual(['9007199254740993']);
  });
});

describe('BookingSummaryReader: dữ liệu hỏng', () => {
  it('không có hàng bác sĩ trong cùng ảnh chụp (không thể xảy ra) ⇒ ném lỗi, không trả tóm tắt rỗng', async () => {
    const { reader, em } = build({ summary: null });

    await expect(reader.read(em, INPUT)).rejects.toThrow();
  });

  it('hồ sơ người thân đã qua bước kiểm mà không đọc được tên (không thể xảy ra) ⇒ ném lỗi, không đưa tên của Bệnh nhân thay cho người thân', async () => {
    const { reader, em } = build({ summary: { nguoiThanHoTen: null } });

    await expect(
      reader.read(em, { ...INPUT, hoSoNguoiThanId: '9' }),
    ).rejects.toThrow();
  });
});

// Task B8 — `readPricing`: giá, cọc và chính sách hoàn để GHI vào `lich_hen` (TAO-09, DL-20, DL-21 phần đơn vị; TRACKING 3.21 B8-D, câu (b2)). Dùng chung `priceAndPolicy` với `read`, nên giá lúc tạo
// luôn bằng giá `checks` đã hiển thị. Mã TAO-nn là [đề xuất].
describe('BookingSummaryReader.readPricing (B8)', () => {
  const RULES = [
    { chucDanh: 'BS_CKI', soNamKinhNghiemTu: 5, phuPhi: '50000.00', apDung: 1 },
  ];

  it('TAO-09 cọc 0: giaApDung = giá dịch vụ + phụ phí, tienCoc nguyên chuỗi DB, chinhSachHoan null và KHÔNG đọc moc_hoan_tien', async () => {
    const { reader, em, query } = build({
      rules: RULES,
      tiers: [{ soGioTruocToiThieu: 24, tyLeHoan: 100 }],
    });

    const pricing = await reader.readPricing(em, { bacSiId: '5' });

    expect(pricing).toStrictEqual({
      giaApDung: '200000.00',
      tienCoc: '0.00',
      chinhSachHoan: null,
    });
    expect(
      query.mock.calls.some(([sql]) => sql.includes('moc_hoan_tien')),
    ).toBe(false);
  });

  it('DL-21 cọc > 0 chưa có mốc ⇒ [] (không hoàn gì), khác null', async () => {
    const { reader, em } = build({
      summary: { mucDatCoc: '50000.00' },
      tiers: [],
    });

    expect(
      (await reader.readPricing(em, { bacSiId: '5' })).chinhSachHoan,
    ).toStrictEqual([]);
  });

  it('DL-21 cọc > 0 có mốc ⇒ dạng SNAKE_CASE của snapshot (không phải camelCase của API), giảm dần dù DB trả lộn thứ tự, đọc đúng dịch vụ', async () => {
    const { reader, em, query } = build({
      summary: { mucDatCoc: '50000.00', dichVuKhamId: '9007199254740993' },
      tiers: [
        { soGioTruocToiThieu: 2, tyLeHoan: 50 },
        { soGioTruocToiThieu: 24, tyLeHoan: 100 },
      ],
    });

    const pricing = await reader.readPricing(em, { bacSiId: '5' });

    expect(pricing.tienCoc).toBe('50000.00');
    expect(pricing.chinhSachHoan).toStrictEqual([
      { so_gio_truoc_toi_thieu: 24, ty_le_hoan: 100 },
      { so_gio_truoc_toi_thieu: 2, ty_le_hoan: 50 },
    ]);
    const tierCall = query.mock.calls.find(([sql]) =>
      sql.includes('moc_hoan_tien'),
    );
    expect(tierCall?.[1]).toStrictEqual(['9007199254740993']);
  });

  it('TAO-09 một chỗ định nghĩa giá: giaApDung của readPricing bằng giaApDung của read cho cùng bác sĩ (checks và tạo không thể lệch nhau)', async () => {
    const { reader, em } = build({ rules: RULES });

    const summary = await reader.read(em, INPUT);
    const pricing = await reader.readPricing(em, { bacSiId: '5' });

    expect(pricing.giaApDung).toBe(summary.giaApDung);
    expect(pricing.giaApDung).toBe('200000.00');
    expect(pricing.tienCoc).toBe(summary.tienCoc);
  });

  it('DL-20 tiền giữ chuỗi decimal chính xác, không qua số thực (0.1 + 0.2 không thành 0.30000000000000004)', async () => {
    const { reader, em } = build({
      summary: { giaMacDinh: '100000.10' },
      rules: [
        { chucDanh: 'BS_CKI', soNamKinhNghiemTu: 0, phuPhi: '0.20', apDung: 1 },
      ],
    });

    expect((await reader.readPricing(em, { bacSiId: '5' })).giaApDung).toBe(
      '100000.30',
    );
  });

  it('quy tắc đã tắt (apDung = 0) bị loại: giaApDung = giá dịch vụ', async () => {
    const { reader, em } = build({
      rules: [
        {
          chucDanh: 'BS_CKI',
          soNamKinhNghiemTu: 0,
          phuPhi: '99000.00',
          apDung: 0,
        },
      ],
    });

    expect((await reader.readPricing(em, { bacSiId: '5' })).giaApDung).toBe(
      '150000.00',
    );
  });

  it('câu SELECT theo ĐÚNG bác sĩ (tham số là chuỗi id), không có tham số nào khác', async () => {
    const { reader, em, query } = build();

    await reader.readPricing(em, { bacSiId: '9007199254740993' });

    const call = query.mock.calls.find(([sql]) => sql.includes('FROM bac_si'));
    expect(call?.[0]).toContain('bs.tai_khoan_id = ?');
    expect(call?.[1]).toStrictEqual(['9007199254740993']);
  });

  it('không có hàng bác sĩ trong cùng giao dịch (không thể xảy ra) ⇒ ném lỗi, không trả giá rỗng', async () => {
    const { reader, em } = build({ summary: null });

    await expect(reader.readPricing(em, { bacSiId: '5' })).rejects.toThrow();
  });
});
