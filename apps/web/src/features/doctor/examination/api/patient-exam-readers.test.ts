import { describe, expect, it } from 'vitest';
import { UnexpectedResponseError } from '../../../../shared/api/errors';
import { parseExamDetail, parseExamListPage } from './patient-exam-readers';

// doctor-exam F5: bộ đọc CHẶT hai phản hồi của Bệnh nhân. WXH-10 (danh sách: bảy khoá mỗi dòng, 12 khoá tháng, `nguoiKham[]`), WXH-11 (chi tiết: bảy khoá F5 đọc, `hoSoKham` null hoặc sáu khoá, `danhGia` và `coTheDanhGia` bị bỏ),
// XHS-02 phần web (khoá nội dung hồ sơ lọt vào dòng danh sách bị bỏ), XHS-14 phần web (chữ rỗng được nhận). Hình dạng theo `patient-exam-records.dto.ts` và `patient-exam-detail.dto.ts` của api (B4, B5). Dữ liệu giả.
const ITEM_KEYS = [
  'bacSi',
  'chuyenKhoa',
  'coHoSoKham',
  'daDanhGia',
  'maLichHen',
  'nguoiKham',
  'thoiGian',
];
const MONTH_COUNTS = Object.fromEntries(
  Array.from({ length: 12 }, (_, index) => [
    String(index + 1),
    [0, 0, 0, 0, 1, 5, 0, 0, 0, 2, 0, 0][index],
  ]),
);

function item(overrides: Record<string, unknown> = {}) {
  return {
    maLichHen: 'CLX-20261018-001',
    thoiGian: '2026-10-18T07:00:00.000Z',
    chuyenKhoa: 'Nhi khoa',
    bacSi: { hoTen: 'Lê Thảo Vy', chucDanh: 'BS' },
    nguoiKham: { hoTen: 'Bùi Minh Khoa', quanHe: 'Con' },
    coHoSoKham: false,
    daDanhGia: false,
    ...overrides,
  };
}

function page(overrides: Record<string, unknown> = {}) {
  return {
    items: [item()],
    total: 1,
    page: 1,
    pageSize: 50,
    demTheoThang: MONTH_COUNTS,
    nguoiKham: [
      { id: null, hoTen: 'Nguyễn Văn A', quanHe: null },
      { id: '501', hoTen: 'Bùi Minh Khoa', quanHe: 'Con' },
    ],
    ...overrides,
  };
}

describe('doctor-exam F5 — bộ đọc danh sách (WXH-10)', () => {
  it('WXH-10 phản hồi đúng ⇒ đủ trường; 12 tháng thành mảng 12 phần tử (chỉ số 0 là tháng 1)', () => {
    const result = parseExamListPage(page());
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(item());
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
    expect(result.demTheoThang).toEqual([0, 0, 0, 0, 1, 5, 0, 0, 0, 2, 0, 0]);
    expect(result.nguoiKham).toEqual([
      { id: null, hoTen: 'Nguyễn Văn A', quanHe: null },
      { id: '501', hoTen: 'Bùi Minh Khoa', quanHe: 'Con' },
    ]);
  });

  it('WXH-10 danh sách rỗng và người khám bản thân (`quanHe: null`) được nhận', () => {
    const result = parseExamListPage(
      page({
        items: [item({ nguoiKham: { hoTen: 'Nguyễn Văn A', quanHe: null } })],
      }),
    );
    expect(result.items[0].nguoiKham.quanHe).toBeNull();
    expect(parseExamListPage(page({ items: [], total: 0 })).items).toEqual([]);
    expect(parseExamListPage(page({ nguoiKham: [] })).nguoiKham).toEqual([]);
  });

  it('WXH-10 mỗi dòng ra ĐÚNG bảy khoá, `bacSi` và `nguoiKham` đúng hai khoá', () => {
    const [row] = parseExamListPage(page()).items;
    expect(Object.keys(row).sort()).toEqual(ITEM_KEYS);
    expect(Object.keys(row.bacSi).sort()).toEqual(['chucDanh', 'hoTen']);
    expect(Object.keys(row.nguoiKham).sort()).toEqual(['hoTen', 'quanHe']);
  });

  it('XHS-02 khoá nội dung hồ sơ và định danh nội bộ lọt vào dòng bị BỎ (khoá và chuỗi), kể cả ở bacSi và nguoiKham', () => {
    const leakedText = 'Bệnh nhân khai đau ngực bên trái';
    const dirty = item({
      trieuChung: leakedText,
      chanDoanSoBo: 'bí mật chẩn đoán',
      huongXuLy: 'bí mật lời khuyên',
      ghiChuKham: { trieuChung: leakedText },
      hoSoKham: { trieuChung: leakedText },
      ngayTaiKhamDuKien: '2026-12-01',
      capNhatLanCuoi: '2026-10-18T07:00:00.000Z',
      lichHenId: '999',
      benhNhanId: '888',
      bacSi: { hoTen: 'Lê Thảo Vy', chucDanh: 'BS', soDienThoai: '0900000000' },
      nguoiKham: { hoTen: 'Bùi Minh Khoa', quanHe: 'Con', email: 'x@y.z' },
    });
    const result = parseExamListPage(
      page({
        items: [dirty],
        khoaLa: 'x',
        demTheoThang: { ...MONTH_COUNTS, '13': 7 },
      }),
    );
    expect(Object.keys(result.items[0]).sort()).toEqual(ITEM_KEYS);
    expect(Object.keys(result).sort()).toEqual([
      'demTheoThang',
      'items',
      'nguoiKham',
      'page',
      'pageSize',
      'total',
    ]);
    expect(result.demTheoThang).toHaveLength(12);
    const text = JSON.stringify(result);
    for (const leaked of [
      leakedText,
      'bí mật',
      '0900000000',
      'x@y.z',
      '999',
      '888',
    ]) {
      expect(text).not.toContain(leaked);
    }
  });

  it.each([
    ['thân null', null],
    ['thân không có', undefined],
    ['thân là mảng', []],
    ['thân là chuỗi', 'items'],
    ['thiếu items', page({ items: undefined })],
    ['items null', page({ items: null })],
    ['items là đối tượng', page({ items: {} })],
    ['total là chuỗi', page({ total: '1' })],
    ['total âm', page({ total: -1 })],
    ['total thập phân', page({ total: 1.5 })],
    ['total null', page({ total: null })],
    ['thiếu page', page({ page: undefined })],
    ['pageSize là chuỗi', page({ pageSize: '50' })],
    ['thiếu demTheoThang', page({ demTheoThang: undefined })],
    [
      'demTheoThang là mảng',
      page({ demTheoThang: [0, 0, 0, 0, 1, 5, 0, 0, 0, 2, 0, 0] }),
    ],
    [
      'thiếu khoá tháng 7',
      page({ demTheoThang: { ...MONTH_COUNTS, '7': undefined } }),
    ],
    [
      'tháng là chuỗi "3"',
      page({ demTheoThang: { ...MONTH_COUNTS, '3': '3' } }),
    ],
    ['tháng âm', page({ demTheoThang: { ...MONTH_COUNTS, '3': -1 } })],
    ['tháng thập phân', page({ demTheoThang: { ...MONTH_COUNTS, '3': 1.5 } })],
    ['tháng null', page({ demTheoThang: { ...MONTH_COUNTS, '12': null } })],
    ['thiếu nguoiKham', page({ nguoiKham: undefined })],
    ['nguoiKham không phải mảng', page({ nguoiKham: {} })],
    [
      'lựa chọn có id là số',
      page({ nguoiKham: [{ id: 5, hoTen: 'A', quanHe: null }] }),
    ],
    ['lựa chọn thiếu hoTen', page({ nguoiKham: [{ id: null, quanHe: null }] })],
    ['lựa chọn thiếu quanHe', page({ nguoiKham: [{ id: null, hoTen: 'A' }] })],
  ])(
    'WXH-10 phản hồi sai hình dạng (%s) ⇒ UnexpectedResponseError',
    (_name, body) => {
      expect(() => parseExamListPage(body)).toThrow(UnexpectedResponseError);
    },
  );

  it.each([
    ['dòng null', null],
    ['thiếu maLichHen', item({ maLichHen: undefined })],
    ['maLichHen rỗng', item({ maLichHen: '' })],
    ['maLichHen là số', item({ maLichHen: 5 })],
    ['thiếu thoiGian', item({ thoiGian: undefined })],
    ['thoiGian không phải ISO', item({ thoiGian: '18/10/2026 14:00' })],
    ['thoiGian là số', item({ thoiGian: 1792306800000 })],
    [
      'thoiGian ISO nhưng không có thật',
      item({ thoiGian: '2026-13-45T10:00:00Z' }),
    ],
    ['thiếu chuyenKhoa', item({ chuyenKhoa: undefined })],
    ['thiếu bacSi', item({ bacSi: undefined })],
    ['bacSi.chucDanh là số', item({ bacSi: { hoTen: 'A', chucDanh: 1 } })],
    ['thiếu nguoiKham', item({ nguoiKham: undefined })],
    ['nguoiKham thiếu quanHe', item({ nguoiKham: { hoTen: 'A' } })],
    ['nguoiKham.quanHe là số', item({ nguoiKham: { hoTen: 'A', quanHe: 5 } })],
    ['coHoSoKham "true"', item({ coHoSoKham: 'true' })],
    ['coHoSoKham 1', item({ coHoSoKham: 1 })],
    ['coHoSoKham null', item({ coHoSoKham: null })],
    ['thiếu coHoSoKham', item({ coHoSoKham: undefined })],
    ['coHoSoKham là mảng', item({ coHoSoKham: [] })],
    ['coHoSoKham là đối tượng', item({ coHoSoKham: {} })],
    ['daDanhGia "false"', item({ daDanhGia: 'false' })],
    ['daDanhGia 0', item({ daDanhGia: 0 })],
    ['thiếu daDanhGia', item({ daDanhGia: undefined })],
  ])(
    'WXH-10 dòng sai hình dạng (%s) ⇒ UnexpectedResponseError',
    (_name, row) => {
      expect(() => parseExamListPage(page({ items: [row] }))).toThrow(
        UnexpectedResponseError,
      );
    },
  );

  it('WXH-10 MỘT dòng sai giữa các dòng đúng làm CẢ danh sách không dùng được (không vẽ dữ liệu dở dang)', () => {
    expect(() =>
      parseExamListPage(
        page({
          items: [item(), item({ coHoSoKham: 'true' }), item()],
          total: 3,
        }),
      ),
    ).toThrow(UnexpectedResponseError);
  });
});

const NOTE = {
  trieuChung: 'Đau ngực',
  chanDoanSoBo: 'Ghi nhận ban đầu',
  huongXuLy: 'Nghỉ ngơi',
  ngayTaiKhamDuKien: '2026-07-10',
  capNhatLanCuoi: '2026-06-10T10:30:00.000Z',
  capNhatBoi: 'Nguyễn Minh Anh',
};

function detail(overrides: Record<string, unknown> = {}) {
  return {
    maLichHen: 'CLX-20260610-001',
    thoiGian: '2026-06-10T02:00:00.000Z',
    chuyenKhoa: 'Tim mạch',
    chiNhanh: 'CLINIX Chi nhánh Quận 3',
    bacSi: { hoTen: 'Nguyễn Minh Anh', chucDanh: 'ThS_BS' },
    nguoiKham: { hoTen: 'Nguyễn Văn A', quanHe: null },
    hoSoKham: NOTE,
    danhGia: {
      soSao: 5,
      nhanXet: 'Tốt',
      thoiDiemTao: '2026-06-11T01:00:00.000Z',
    },
    coTheDanhGia: false,
    ...overrides,
  };
}

describe('doctor-exam F5 — bộ đọc chi tiết (WXH-11)', () => {
  it('WXH-11 phản hồi đúng ⇒ bảy khoá F5 đọc; `hoSoKham` đúng sáu khoá; `danhGia` và `coTheDanhGia` BỊ BỎ', () => {
    const result = parseExamDetail(detail());
    expect(Object.keys(result).sort()).toEqual([
      'bacSi',
      'chiNhanh',
      'chuyenKhoa',
      'hoSoKham',
      'maLichHen',
      'nguoiKham',
      'thoiGian',
    ]);
    expect(result.hoSoKham).toEqual(NOTE);
    expect(Object.keys(result.hoSoKham ?? {}).sort()).toEqual([
      'capNhatBoi',
      'capNhatLanCuoi',
      'chanDoanSoBo',
      'huongXuLy',
      'ngayTaiKhamDuKien',
      'trieuChung',
    ]);
    expect(JSON.stringify(result)).not.toContain('soSao');
  });

  it('WXH-11 chưa có hồ sơ (`hoSoKham: null`) và không có ngày tái khám (`null`) được nhận', () => {
    expect(parseExamDetail(detail({ hoSoKham: null })).hoSoKham).toBeNull();
    expect(
      parseExamDetail(
        detail({ hoSoKham: { ...NOTE, ngayTaiKhamDuKien: null } }),
      ).hoSoKham?.ngayTaiKhamDuKien,
    ).toBeNull();
  });

  it('XHS-14 chữ rỗng (cột NULL ở DB) được nhận, không lỗi', () => {
    const note = {
      ...NOTE,
      trieuChung: '',
      chanDoanSoBo: '',
      huongXuLy: '',
      capNhatBoi: '',
    };
    expect(parseExamDetail(detail({ hoSoKham: note })).hoSoKham).toEqual(note);
  });

  it('WXH-11 nội dung NGUYÊN VĂN: HTML, thực thể, emoji, xuống dòng, khoảng trắng đầu cuối không đổi một ký tự', () => {
    const text = '  <script>alert(1)</script> &amp; 😀\r\nDòng hai  ';
    const result = parseExamDetail(
      detail({ hoSoKham: { ...NOTE, trieuChung: text } }),
    );
    expect(result.hoSoKham?.trieuChung).toBe(text);
  });

  it('WXH-11 khoá lạ ở mọi tầng bị bỏ', () => {
    const result = parseExamDetail(
      detail({
        lichHenId: '9',
        bacSi: { hoTen: 'A', chucDanh: 'BS', soDienThoai: '09' },
        hoSoKham: { ...NOTE, ghiChuNoiBo: 'x' },
      }),
    );
    expect(JSON.stringify(result)).not.toContain('lichHenId');
    expect(JSON.stringify(result)).not.toContain('soDienThoai');
    expect(JSON.stringify(result)).not.toContain('ghiChuNoiBo');
  });

  it.each([
    ['thân null', null],
    ['thân là mảng', []],
    ['thiếu maLichHen', detail({ maLichHen: undefined })],
    ['maLichHen rỗng', detail({ maLichHen: '' })],
    ['thoiGian không phải ISO', detail({ thoiGian: '10/06/2026' })],
    ['thiếu chuyenKhoa', detail({ chuyenKhoa: undefined })],
    ['chiNhanh là số', detail({ chiNhanh: 3 })],
    ['thiếu chiNhanh', detail({ chiNhanh: undefined })],
    ['thiếu bacSi', detail({ bacSi: undefined })],
    ['thiếu nguoiKham', detail({ nguoiKham: undefined })],
    ['hoSoKham vắng (không phải null)', detail({ hoSoKham: undefined })],
    ['hoSoKham là mảng', detail({ hoSoKham: [] })],
    ['hoSoKham là chuỗi', detail({ hoSoKham: 'x' })],
    [
      'hồ sơ thiếu trieuChung',
      detail({ hoSoKham: { ...NOTE, trieuChung: undefined } }),
    ],
    [
      'hồ sơ có huongXuLy là số',
      detail({ hoSoKham: { ...NOTE, huongXuLy: 5 } }),
    ],
    [
      'hồ sơ thiếu ngayTaiKhamDuKien',
      detail({ hoSoKham: { ...NOTE, ngayTaiKhamDuKien: undefined } }),
    ],
    [
      'ngày tái khám sai dạng',
      detail({ hoSoKham: { ...NOTE, ngayTaiKhamDuKien: '2026-7-10' } }),
    ],
    [
      'ngày tái khám có giờ',
      detail({
        hoSoKham: { ...NOTE, ngayTaiKhamDuKien: '2026-07-10T00:00:00Z' },
      }),
    ],
    [
      'capNhatLanCuoi không phải ISO',
      detail({ hoSoKham: { ...NOTE, capNhatLanCuoi: '10/06/2026 17:30' } }),
    ],
    [
      'hồ sơ thiếu capNhatBoi',
      detail({ hoSoKham: { ...NOTE, capNhatBoi: undefined } }),
    ],
  ])(
    'WXH-11 phản hồi sai hình dạng (%s) ⇒ UnexpectedResponseError',
    (_name, body) => {
      expect(() => parseExamDetail(body)).toThrow(UnexpectedResponseError);
    },
  );
});
