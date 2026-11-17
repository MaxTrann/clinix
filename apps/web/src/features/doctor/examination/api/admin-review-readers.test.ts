import { describe, expect, it } from 'vitest';
import { UnexpectedResponseError } from '../../../../shared/api/errors';
import {
  parseAdminReviewDetail,
  parseAdminReviewPage,
} from './admin-review-readers';

// doctor-exam F7: WKD-11 (bộ đọc danh sách chặt) và WKD-12 (bộ đọc chi tiết, `danhGiaId` BIGINT dạng chuỗi, `lyDoAn` chỉ khi đã ẩn). Dữ liệu giả.
type Json = Record<string, unknown>;

const row = (overrides: Json = {}): Json => ({
  danhGiaId: '41',
  bacSi: { bacSiId: '11', hoTen: 'Nguyễn Minh Anh' },
  chiNhanh: { chiNhanhId: '1', ten: 'CLINIX Chi nhánh Quận 3' },
  nguoiDanhGia: { hoTen: 'Vũ Thị F' },
  soSao: 4,
  nhanXet: 'Tốt',
  thoiDiemTao: '2026-05-28T03:00:00.000Z',
  biAn: false,
  ...overrides,
});

const page = (overrides: Json = {}): Json => ({
  items: [row()],
  total: 1,
  page: 1,
  pageSize: 20,
  demTheoTrangThai: { HienThi: 1, DaAn: 0 },
  ...overrides,
});

const detail = (overrides: Json = {}): Json => ({
  ...row(),
  maLichHen: 'CLX-20260611-00006',
  thoiGianKham: '2026-06-11T02:30:00.000Z',
  ...overrides,
});

const rejects = (run: () => unknown) =>
  expect(run).toThrow(UnexpectedResponseError);

describe('doctor-exam F7 — bộ đọc danh sách Admin (WKD-11)', () => {
  it('WKD-11 phản hồi đúng: chép đủ tám khoá của dòng, số đếm và `demTheoTrangThai`', () => {
    expect(parseAdminReviewPage(page())).toEqual({
      items: [
        {
          danhGiaId: '41',
          bacSi: { bacSiId: '11', hoTen: 'Nguyễn Minh Anh' },
          chiNhanh: { chiNhanhId: '1', ten: 'CLINIX Chi nhánh Quận 3' },
          nguoiDanhGia: { hoTen: 'Vũ Thị F' },
          soSao: 4,
          nhanXet: 'Tốt',
          thoiDiemTao: '2026-05-28T03:00:00.000Z',
          biAn: false,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      demTheoTrangThai: { HienThi: 1, DaAn: 0 },
    });
  });

  it('WKD-11 khoá thừa bị BỎ ở mọi cấp (lyDoAn, maLichHen, benhNhanId, hàng, trang)', () => {
    const parsed = parseAdminReviewPage(
      page({
        extra: 1,
        items: [
          row({
            lyDoAn: 'x',
            maLichHen: 'CLX-1',
            benhNhanId: '9',
            bacSi: { bacSiId: '11', hoTen: 'A', soDienThoai: '0901' },
          }),
        ],
        demTheoTrangThai: { HienThi: 1, DaAn: 0, Khac: 3 },
      }),
    );
    expect(Object.keys(parsed).sort()).toEqual(
      ['demTheoTrangThai', 'items', 'page', 'pageSize', 'total'].sort(),
    );
    expect(Object.keys(parsed.items[0]).sort()).toEqual(
      [
        'bacSi',
        'biAn',
        'chiNhanh',
        'danhGiaId',
        'nguoiDanhGia',
        'nhanXet',
        'soSao',
        'thoiDiemTao',
      ].sort(),
    );
    expect(parsed.items[0].bacSi).toEqual({ bacSiId: '11', hoTen: 'A' });
    expect(Object.keys(parsed.demTheoTrangThai).sort()).toEqual([
      'DaAn',
      'HienThi',
    ]);
  });

  it('WKD-11 danh sách rỗng hợp lệ; nhận xét `null` và tên người đặt rỗng được nhận (L9)', () => {
    expect(parseAdminReviewPage(page({ items: [], total: 0 })).items).toEqual(
      [],
    );
    const parsed = parseAdminReviewPage(
      page({
        items: [row({ nhanXet: null, nguoiDanhGia: { hoTen: '' } })],
      }),
    );
    expect(parsed.items[0].nhanXet).toBeNull();
    expect(parsed.items[0].nguoiDanhGia.hoTen).toBe('');
  });

  it.each([
    ['không phải đối tượng', null],
    ['mảng', []],
    ['chuỗi', 'x'],
  ])('WKD-11 thân %s ⇒ không dùng được', (_name, body) => {
    rejects(() => parseAdminReviewPage(body));
  });

  it.each([
    ['thiếu items', (p: Json) => delete p.items],
    ['items không phải mảng', (p: Json) => (p.items = {})],
    ['thiếu total', (p: Json) => delete p.total],
    ['total là chuỗi "3"', (p: Json) => (p.total = '3')],
    ['total âm', (p: Json) => (p.total = -1)],
    ['total thập phân', (p: Json) => (p.total = 1.5)],
    ['page null', (p: Json) => (p.page = null)],
    ['pageSize là chuỗi', (p: Json) => (p.pageSize = '20')],
    ['thiếu demTheoTrangThai', (p: Json) => delete p.demTheoTrangThai],
    ['demTheoTrangThai null', (p: Json) => (p.demTheoTrangThai = null)],
    ['thiếu khoá HienThi', (p: Json) => (p.demTheoTrangThai = { DaAn: 0 })],
    ['thiếu khoá DaAn', (p: Json) => (p.demTheoTrangThai = { HienThi: 1 })],
    [
      'HienThi âm',
      (p: Json) => (p.demTheoTrangThai = { HienThi: -1, DaAn: 0 }),
    ],
    [
      'DaAn là chuỗi',
      (p: Json) => (p.demTheoTrangThai = { HienThi: 1, DaAn: '0' }),
    ],
    [
      'HienThi thập phân',
      (p: Json) => (p.demTheoTrangThai = { HienThi: 1.5, DaAn: 0 }),
    ],
  ])('WKD-11 %s ⇒ UnexpectedResponseError', (_name, mutate) => {
    const body = page();
    mutate(body);
    rejects(() => parseAdminReviewPage(body));
  });

  it.each([
    ['thiếu danhGiaId', (r: Json) => delete r.danhGiaId],
    ['danhGiaId là số', (r: Json) => (r.danhGiaId = 41)],
    ['danhGiaId rỗng', (r: Json) => (r.danhGiaId = '')],
    ['danhGiaId không phải chữ số', (r: Json) => (r.danhGiaId = '4a')],
    ['danhGiaId âm', (r: Json) => (r.danhGiaId = '-4')],
    ['thiếu bacSi', (r: Json) => delete r.bacSi],
    ['bacSi null', (r: Json) => (r.bacSi = null)],
    ['bacSiId là số', (r: Json) => (r.bacSi = { bacSiId: 11, hoTen: 'A' })],
    ['thiếu hoTen bác sĩ', (r: Json) => (r.bacSi = { bacSiId: '11' })],
    ['thiếu chiNhanh', (r: Json) => delete r.chiNhanh],
    [
      'chiNhanhId không phải chữ số',
      (r: Json) => (r.chiNhanh = { chiNhanhId: 'q3', ten: 'T' }),
    ],
    ['thiếu ten chi nhánh', (r: Json) => (r.chiNhanh = { chiNhanhId: '1' })],
    ['thiếu nguoiDanhGia', (r: Json) => delete r.nguoiDanhGia],
    [
      'nguoiDanhGia.hoTen là null',
      (r: Json) => (r.nguoiDanhGia = { hoTen: null }),
    ],
    ['soSao 0', (r: Json) => (r.soSao = 0)],
    ['soSao 6', (r: Json) => (r.soSao = 6)],
    ['soSao 3,5', (r: Json) => (r.soSao = 3.5)],
    ['soSao "5"', (r: Json) => (r.soSao = '5')],
    ['soSao null', (r: Json) => (r.soSao = null)],
    ['thiếu nhanXet', (r: Json) => delete r.nhanXet],
    ['nhanXet là số', (r: Json) => (r.nhanXet = 5)],
    ['thoiDiemTao không phải ISO', (r: Json) => (r.thoiDiemTao = '28/05/2026')],
    ['thoiDiemTao là số', (r: Json) => (r.thoiDiemTao = 1_780_000_000)],
    ['biAn là "true"', (r: Json) => (r.biAn = 'true')],
    ['biAn là 1', (r: Json) => (r.biAn = 1)],
    ['biAn null', (r: Json) => (r.biAn = null)],
    ['thiếu biAn', (r: Json) => delete r.biAn],
    [
      'dòng rỗng (mọi khoá thiếu)',
      (r: Json) => Object.keys(r).forEach((k) => delete r[k]),
    ],
  ])('WKD-11 dòng: %s ⇒ UnexpectedResponseError', (_name, mutate) => {
    const bad = row();
    mutate(bad);
    rejects(() => parseAdminReviewPage(page({ items: [bad] })));
  });

  it('WKD-11 MỘT dòng sai trong nhiều dòng làm cả trang không dùng được', () => {
    rejects(() =>
      parseAdminReviewPage(
        page({ items: [row(), row({ danhGiaId: '42' }), row({ soSao: 9 })] }),
      ),
    );
  });
});

describe('doctor-exam F7 — bộ đọc chi tiết Admin (WKD-12)', () => {
  it('WKD-12 chưa ẩn: đủ khoá, `lyDoAn` là null khi khoá vắng', () => {
    const parsed = parseAdminReviewDetail(detail());
    expect(parsed).toMatchObject({
      danhGiaId: '41',
      maLichHen: 'CLX-20260611-00006',
      thoiGianKham: '2026-06-11T02:30:00.000Z',
      biAn: false,
      lyDoAn: null,
    });
    expect(Object.keys(parsed).sort()).toEqual(
      [
        'bacSi',
        'biAn',
        'chiNhanh',
        'danhGiaId',
        'lyDoAn',
        'maLichHen',
        'nguoiDanhGia',
        'nhanXet',
        'soSao',
        'thoiDiemTao',
        'thoiGianKham',
      ].sort(),
    );
  });

  it('WKD-12 đã ẩn: nhận `lyDoAn` (kể cả nhiều dòng); đã ẩn mà khoá vắng cũng được nhận', () => {
    expect(
      parseAdminReviewDetail(
        detail({ biAn: true, lyDoAn: 'Nội dung\nxúc phạm' }),
      ).lyDoAn,
    ).toBe('Nội dung\nxúc phạm');
    expect(parseAdminReviewDetail(detail({ biAn: true })).lyDoAn).toBeNull();
  });

  it.each([
    ['có `lyDoAn` khi chưa ẩn', { biAn: false, lyDoAn: 'x' }],
    [
      '`lyDoAn` null khi đã ẩn (khoá phải VẮNG, không phải null)',
      { biAn: true, lyDoAn: null },
    ],
    ['`lyDoAn` là số', { biAn: true, lyDoAn: 5 }],
    ['thiếu maLichHen', { maLichHen: undefined }],
    ['maLichHen rỗng', { maLichHen: '' }],
    ['maLichHen là số', { maLichHen: 5 }],
    ['thiếu thoiGianKham', { thoiGianKham: undefined }],
    ['thoiGianKham không phải ISO', { thoiGianKham: '2026-06-11 09:30' }],
  ])('WKD-12 %s ⇒ UnexpectedResponseError', (_name, overrides) => {
    const body = detail(overrides);
    for (const key of Object.keys(body)) {
      if (body[key] === undefined) delete body[key];
    }
    rejects(() => parseAdminReviewDetail(body));
  });

  it('WKD-12 `danhGiaId` lớn hơn 2^53 giữ NGUYÊN chữ số (không qua Number)', () => {
    const id = '9007199254740993';
    expect(Number(id).toString()).not.toBe(id);
    const parsed = parseAdminReviewDetail(detail({ danhGiaId: id }));
    expect(parsed.danhGiaId).toBe(id);
    expect(
      parseAdminReviewPage(page({ items: [row({ danhGiaId: id })] })).items[0]
        .danhGiaId,
    ).toBe(id);
  });

  it('WKD-12 dòng của chi tiết cũng chặt như danh sách (soSao 6, biAn "true") và thân sai kiểu', () => {
    rejects(() => parseAdminReviewDetail(detail({ soSao: 6 })));
    rejects(() => parseAdminReviewDetail(detail({ biAn: 'true' })));
    rejects(() => parseAdminReviewDetail(null));
    rejects(() => parseAdminReviewDetail([]));
  });
});
