import {
  mapHistoryRow,
  type HistoryRow,
} from '../system-config-history.mapper.js';
import { CONFIG_KEYS, CONFIG_PARAMS } from '../system-config-params.js';

// Mapper thuần của tab "Lịch sử thay đổi" (admin B6; TRACKING 9A.4 mục 3): CHB6-01…07. Không DB, không đồng hồ.
const AT = new Date(Date.UTC(2026, 10, 18, 3, 15, 3));

const row = (changes: unknown, overrides: Partial<HistoryRow> = {}) =>
  ({
    id: '57',
    thoiDiem: AT,
    hoTen: 'Nguyễn Văn A',
    changes,
    ...overrides,
  }) satisfies HistoryRow;

// Đủ 12 cột của nhật ký lần tạo đầu: giá trị hợp lệ theo bảng miền của B5
const FULL_AFTER = {
  thoi_gian_giu_cho: 15,
  thoi_diem_nhac_lich: [72, 24, 2],
  so_lich_hen_toi_da_moi_ho_so: 3,
  so_lan_tu_doi_lich_toi_da: 2,
  check_in_truoc_phut: 30,
  check_in_sau_phut: 15,
  thoi_han_phan_hoi_loi_moi: 60,
  so_muc_cho_toi_da: 2,
  nguong_no_show: 3,
  so_ngay_bao_truoc_doi_gio_lam: 3,
  trong_so_w1: 0.6,
  trong_so_w2: 0.4,
};

describe('B6 CH-19 — mapHistoryRow', () => {
  it('CHB6-01: một tham số: khoá camelCase từ tên cột, truoc và sau là số, kèm người, lý do, thời điểm ISO UTC', () => {
    const item = mapHistoryRow(
      row({
        truoc: { thoi_gian_giu_cho: 15 },
        sau: { thoi_gian_giu_cho: 20 },
        ly_do: 'Tăng giờ giữ chỗ',
      }),
    );
    expect(item).toStrictEqual({
      id: '57',
      thoiDiem: '2026-11-18T03:15:03.000Z',
      nguoiThucHien: 'Nguyễn Văn A',
      lyDo: 'Tăng giờ giữ chỗ',
      thayDoi: [{ khoa: 'thoiGianGiuCho', truoc: 15, sau: 20 }],
    });
  });

  it('CHB6-02: nhiều tham số: thứ tự theo CONFIG_KEYS (thứ tự biểu mẫu) dù khoá JSON đảo lộn', () => {
    // MySQL chuẩn hoá thứ tự khoá JSON (không giữ thứ tự ghi), nên thứ tự đầu vào cố ý ngược với CONFIG_KEYS
    const scrambled = [
      'trong_so_w2',
      'so_ngay_bao_truoc_doi_gio_lam',
      'thoi_gian_giu_cho',
      'trong_so_w1',
      'nguong_no_show',
    ];
    const truoc = Object.fromEntries(scrambled.map((column) => [column, 1]));
    const sau = Object.fromEntries(scrambled.map((column) => [column, 2]));
    const item = mapHistoryRow(row({ truoc, sau, ly_do: 'Đổi nhiều' }));
    const expected = CONFIG_KEYS.filter((key) =>
      scrambled.includes(CONFIG_PARAMS[key].column),
    );
    expect(item.thayDoi.map((change) => change.khoa)).toStrictEqual(expected);
    expect(item.thayDoi).toHaveLength(5);
  });

  it('CHB6-03 (CH-11): tạo lần đầu: truoc là null ở từng mục, đủ 12 mục, sau là giá trị thật', () => {
    const truoc = Object.fromEntries(
      Object.keys(FULL_AFTER).map((column) => [column, null]),
    );
    const item = mapHistoryRow(
      row({ truoc, sau: FULL_AFTER, ly_do: 'Khởi tạo cấu hình' }),
    );
    expect(item.thayDoi).toHaveLength(12);
    expect(item.thayDoi.map((change) => change.khoa)).toStrictEqual([
      ...CONFIG_KEYS,
    ]);
    expect(item.thayDoi.every((change) => change.truoc === null)).toBe(true);
    expect(item.thayDoi[0]).toStrictEqual({
      khoa: 'thoiGianGiuCho',
      truoc: null,
      sau: 15,
    });
  });

  it('CHB6-04 (CH-18): nhắc lịch giữ là mảng số, trọng số là số (không chuỗi); mảng trả ra là bản sao', () => {
    const before = [72, 24, 2];
    const item = mapHistoryRow(
      row({
        truoc: { thoi_diem_nhac_lich: before, trong_so_w1: 0.6 },
        sau: { thoi_diem_nhac_lich: [48, 12], trong_so_w1: 0.7 },
        ly_do: 'Đổi mốc nhắc và trọng số',
      }),
    );
    expect(item.thayDoi).toStrictEqual([
      { khoa: 'thoiDiemNhacLich', truoc: [72, 24, 2], sau: [48, 12] },
      { khoa: 'trongSoW1', truoc: 0.6, sau: 0.7 },
    ]);
    const first = item.thayDoi[0];
    expect(first?.truoc).not.toBe(before);
    expect(typeof item.thayDoi[1]?.sau).toBe('number');
  });

  it('CHB6-05: khoá lạ (mat_khau_bam, email, …) và giá trị sai kiểu bị bỏ khỏi thayDoi, không lọt ra ngoài', () => {
    const item = mapHistoryRow(
      row({
        truoc: {
          thoi_gian_giu_cho: 15,
          mat_khau_bam: 'x',
          email: 'a@b.vn',
          check_in_truoc_phut: '30',
          check_in_sau_phut: 15,
          nguong_no_show: 3,
          so_muc_cho_toi_da: { a: 1 },
          thoi_diem_nhac_lich: [1, '2'],
          so_lan_tu_doi_lich_toi_da: true,
          // chỉ có ở một phía: bỏ
          trong_so_w1: 0.6,
        },
        sau: {
          thoi_gian_giu_cho: 20,
          mat_khau_bam: 'y',
          email: 'c@d.vn',
          check_in_truoc_phut: 31,
          check_in_sau_phut: '16',
          nguong_no_show: null,
          so_muc_cho_toi_da: 2,
          thoi_diem_nhac_lich: [1, 2],
          so_lan_tu_doi_lich_toi_da: 1,
        },
        ly_do: 'Thử khoá lạ',
      }),
    );
    // chỉ còn tham số hợp lệ ở CẢ HAI phía
    expect(item.thayDoi).toStrictEqual([
      { khoa: 'thoiGianGiuCho', truoc: 15, sau: 20 },
    ]);
    const json = JSON.stringify(item);
    for (const leaked of ['mat_khau_bam', 'email', 'a@b.vn', 'c@d.vn'])
      expect(json).not.toContain(leaked);
  });

  it('CHB6-05b: truoc null được giữ (lần tạo đầu) nhưng sau null thì bỏ khoá', () => {
    const item = mapHistoryRow(
      row({
        truoc: { thoi_gian_giu_cho: null, nguong_no_show: null },
        sau: { thoi_gian_giu_cho: 15, nguong_no_show: null },
        ly_do: 'Biên null',
      }),
    );
    expect(item.thayDoi).toStrictEqual([
      { khoa: 'thoiGianGiuCho', truoc: null, sau: 15 },
    ]);
  });

  it.each([
    ['null', null],
    ['mảng', []],
    ['chuỗi', 'lỗi'],
    ['số', 7],
    ['object rỗng', {}],
    ['truoc mảng, sau object', { truoc: [], sau: {}, ly_do: 'x' }],
    ['thiếu sau, ly_do là số', { truoc: { thoi_gian_giu_cho: 1 }, ly_do: 5 }],
    [
      'truoc là chuỗi',
      { truoc: 'x', sau: { thoi_gian_giu_cho: 1 }, ly_do: 'x' },
    ],
  ])(
    'CHB6-06: JSON sai hình dạng (%s) ⇒ thayDoi rỗng, không ném, vẫn giữ id, người và thời điểm',
    (_label, changes) => {
      const item = mapHistoryRow(row(changes));
      expect(item.thayDoi).toStrictEqual([]);
      expect(item.id).toBe('57');
      expect(item.nguoiThucHien).toBe('Nguyễn Văn A');
      expect(item.thoiDiem).toBe('2026-11-18T03:15:03.000Z');
      // ly_do không phải chuỗi thì ''; riêng ca có ly_do chuỗi hợp lệ thì giữ
      expect(item.lyDo).toBe(
        typeof (changes as { ly_do?: unknown } | null)?.ly_do === 'string'
          ? (changes as { ly_do: string }).ly_do
          : '',
      );
    },
  );

  it('CHB6-07: hợp đồng khoá chặt: mục đúng 5 khoá, thay đổi đúng 3 khoá; trường thừa của hàng đầu vào KHÔNG lọt ra', () => {
    const dirty = {
      ...row({
        truoc: { thoi_gian_giu_cho: 15 },
        sau: { thoi_gian_giu_cho: 20 },
        ly_do: 'Khoá chặt',
      }),
      email: 'nguoi.thuc.hien@example.test',
      taiKhoanId: '9',
      matKhauBam: 'bam-gia',
      soDienThoai: '0900000000',
    } as HistoryRow;
    const item = mapHistoryRow(dirty);
    expect(Object.keys(item).sort()).toStrictEqual([
      'id',
      'lyDo',
      'nguoiThucHien',
      'thayDoi',
      'thoiDiem',
    ]);
    expect(Object.keys(item.thayDoi[0] ?? {}).sort()).toStrictEqual([
      'khoa',
      'sau',
      'truoc',
    ]);
    const json = JSON.stringify(item);
    for (const leaked of [
      'email',
      'example.test',
      'taiKhoanId',
      'matKhauBam',
      'bam-gia',
      'soDienThoai',
      '0900000000',
    ])
      expect(json).not.toContain(leaked);
    expect(item.thoiDiem).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });

  it('CHB6-07b: lý do là chữ tự do: giữ NGUYÊN VĂN (không cắt khoảng trắng, không đổi HTML hay Unicode)', () => {
    const reason = '  <b>Tăng</b> "giữ chỗ" & thử 😀 ';
    const item = mapHistoryRow(
      row({
        truoc: { thoi_gian_giu_cho: 15 },
        sau: { thoi_gian_giu_cho: 20 },
        ly_do: reason,
      }),
    );
    expect(item.lyDo).toBe(reason);
  });
});
