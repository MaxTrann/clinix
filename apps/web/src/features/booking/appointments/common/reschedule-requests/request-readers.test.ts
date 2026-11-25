import { describe, expect, it } from 'vitest';
import { UnexpectedResponseError } from '../../../../../shared/api/errors';
import {
  makeHandledDetail,
  makeRequestDetail,
  makeRequestRow,
} from '../../../testing/reschedule-requests-fixtures';
import {
  parseRequestDetail,
  parseRequestPage,
  parseRequestRow,
} from './request-readers';

// reschedule F4, WXD-21…WXD-36 (`[đề xuất]`; PLAN reschedule 7.11): bộ đọc NGHIÊM của danh sách và chi tiết yêu cầu (hợp đồng THẬT của B8, TRACKING mục 7 khối B8). Thiếu khoá hay sai kiểu ⇒
// `UnexpectedResponseError` (cả trang báo "phản hồi không dùng được"); khoá THỪA không bị từ chối nhưng KHÔNG được chép (đúng nếp F1, F2, B7).

type Json = Record<string, unknown>;

// Bản sao với khoá ở đường dẫn `a.b` bị bỏ
function without(source: object, path: string): Json {
  const copy = structuredClone(source) as Json;
  const parts = path.split('.');
  let target: Json = copy;
  for (const part of parts.slice(0, -1)) target = target[part] as Json;
  delete target[parts[parts.length - 1]];
  return copy;
}

// Bản sao với giá trị ở đường dẫn `a.b` bị thay
function withValue(source: object, path: string, value: unknown): Json {
  const copy = structuredClone(source) as Json;
  const parts = path.split('.');
  let target: Json = copy;
  for (const part of parts.slice(0, -1)) target = target[part] as Json;
  target[parts[parts.length - 1]] = value;
  return copy;
}

const ROW_KEYS = [
  'yeuCauId',
  'trangThai',
  'thoiDiemTao',
  'maLichHen',
  'nguoiKham',
  'nguoiKham.hoTen',
  'nguoiKham.laNguoiThan',
  'bacSi',
  'bacSi.hoTen',
  'chiNhanh',
  'chiNhanh.id',
  'chiNhanh.ten',
  'thoiGianCu',
  'thoiGianMongMuon',
  'soLanDaTuDoi',
] as const;

const DETAIL_ONLY_KEYS = [
  'soLanToiDa',
  'lyDoYeuCau',
  'trangThaiLichGoc',
  'coTheDuyet',
  'lyDoKhongDuyet',
  'khungGioMongMuon',
  'khungGioMongMuon.khungGioId',
  'khungGioMongMuon.trangThai',
  'ghiChuXuLy',
  'thoiDiemXuLy',
  'nguoiXuLy',
] as const;

describe('bộ đọc dòng danh sách yêu cầu (B8)', () => {
  it('WXD-21 dòng đúng hợp đồng: ĐÚNG mười khoá, giữ nguyên giá trị', () => {
    const row = makeRequestRow();
    const parsed = parseRequestRow(row);
    expect(parsed).toEqual(row);
    expect(Object.keys(parsed).sort()).toEqual(
      [
        'yeuCauId',
        'trangThai',
        'thoiDiemTao',
        'maLichHen',
        'nguoiKham',
        'bacSi',
        'chiNhanh',
        'thoiGianCu',
        'thoiGianMongMuon',
        'soLanDaTuDoi',
      ].sort(),
    );
  });

  it.each(ROW_KEYS)('WXD-22 thiếu khoá `%s` ⇒ không dùng được', (path) => {
    expect(() => parseRequestRow(without(makeRequestRow(), path))).toThrow(
      UnexpectedResponseError,
    );
  });

  it.each([
    ['yeuCauId', 101],
    ['yeuCauId', null],
    ['trangThai', 'DaXoa'],
    ['trangThai', 1],
    ['thoiDiemTao', 1_700_000_000_000],
    ['maLichHen', ''],
    ['maLichHen', 7],
    ['nguoiKham.hoTen', null],
    ['nguoiKham.laNguoiThan', 'false'],
    ['nguoiKham.laNguoiThan', 0],
    ['bacSi.hoTen', 5],
    ['chiNhanh.id', 3],
    ['chiNhanh.ten', null],
    ['thoiGianCu', '20/11/2026'],
    ['thoiGianMongMuon', null],
    ['soLanDaTuDoi', '2'],
    ['soLanDaTuDoi', -1],
    ['soLanDaTuDoi', 1.5],
    ['nguoiKham', 'Nguyễn Văn A'],
    ['bacSi', null],
    ['chiNhanh', []],
  ] as const)('WXD-23 `%s` = %j sai kiểu ⇒ không dùng được', (path, value) => {
    expect(() =>
      parseRequestRow(withValue(makeRequestRow(), path, value)),
    ).toThrow(UnexpectedResponseError);
  });

  it('WXD-24 khoá THỪA (SĐT, email, id lịch) không bị từ chối và KHÔNG được chép, ở dòng lẫn khoá lồng', () => {
    const noisy = {
      ...makeRequestRow(),
      soDienThoai: '0900000000',
      email: 'a@example.test',
      lichHenId: '77',
      nguoiKham: {
        ...makeRequestRow().nguoiKham,
        soDienThoai: '0911111111',
      },
      chiNhanh: { ...makeRequestRow().chiNhanh, diaChi: 'Số 9 Đường Giả' },
    };
    const parsed = parseRequestRow(noisy);
    expect(parsed).toEqual(makeRequestRow());
    expect(JSON.stringify(parsed)).not.toMatch(
      /0900000000|0911111111|a@example|lichHenId|Đường Giả/,
    );
  });

  it('WXD-25 id lớn hơn 2^53 giữ NGUYÊN chuỗi (yeuCauId và chiNhanh.id), không qua Number', () => {
    const big = '9007199254740993';
    const parsed = parseRequestRow(
      makeRequestRow({
        yeuCauId: big,
        chiNhanh: { id: big, ten: 'Chi nhánh' },
      }),
    );
    expect(parsed.yeuCauId).toBe(big);
    expect(parsed.chiNhanh.id).toBe(big);
    expect(String(Number(big))).not.toBe(big);
  });

  it.each(['0', '012', '-5', '1.5', '1e3', ' 7', '7 ', 'abc', ''])(
    'WXD-26 id %j không phải id BIGINT dạng chuỗi ⇒ không dùng được',
    (id) => {
      expect(() => parseRequestRow(makeRequestRow({ yeuCauId: id }))).toThrow(
        UnexpectedResponseError,
      );
    },
  );

  it.each([
    '2026-11-20',
    '2026-11-20T09:00',
    '2026-11-20T09:00:00',
    '2026-11-20T09:00:00.000',
    'không phải giờ',
    '2026-13-45T00:00:00.000Z',
  ])(
    'WXD-27 mốc giờ %j thiếu múi giờ hay sai dạng ⇒ không dùng được (không bao giờ hiểu theo múi giờ máy)',
    (value) => {
      expect(() =>
        parseRequestRow(makeRequestRow({ thoiGianCu: value })),
      ).toThrow(UnexpectedResponseError);
      expect(() =>
        parseRequestRow(makeRequestRow({ thoiDiemTao: value })),
      ).toThrow(UnexpectedResponseError);
      expect(() =>
        parseRequestRow(makeRequestRow({ thoiGianMongMuon: value })),
      ).toThrow(UnexpectedResponseError);
    },
  );

  it('WXD-27 mốc giờ có `Z` hay độ lệch `+07:00` đều dùng được', () => {
    expect(
      parseRequestRow(
        makeRequestRow({ thoiGianCu: '2026-11-20T09:00:00+07:00' }),
      ).thoiGianCu,
    ).toBe('2026-11-20T09:00:00+07:00');
    expect(
      parseRequestRow(makeRequestRow({ thoiGianCu: '2026-11-20T02:00:00Z' }))
        .thoiGianCu,
    ).toBe('2026-11-20T02:00:00Z');
  });
});

describe('bộ đọc trang danh sách yêu cầu (B8)', () => {
  const page = { items: [makeRequestRow()], total: 1, page: 1, pageSize: 20 };

  it('WXD-28 trang đúng hợp đồng; `total` lớn và `items` rỗng đều dùng được', () => {
    expect(parseRequestPage(page)).toEqual(page);
    const huge = { ...page, total: 2_000_000_000, page: 5 };
    expect(parseRequestPage(huge).total).toBe(2_000_000_000);
    expect(parseRequestPage({ ...page, items: [], total: 0 })).toEqual({
      ...page,
      items: [],
      total: 0,
    });
  });

  it.each(['items', 'total', 'page', 'pageSize'])(
    'WXD-28 thiếu khoá `%s` của trang ⇒ không dùng được',
    (key) => {
      expect(() => parseRequestPage(without(page, key))).toThrow(
        UnexpectedResponseError,
      );
    },
  );

  it.each([
    ['items', {}],
    ['items', null],
    ['total', -1],
    ['total', '1'],
    ['total', 1.5],
    ['page', 0],
    ['pageSize', 0],
    ['pageSize', null],
  ] as const)('WXD-28 trang với `%s` = %j ⇒ không dùng được', (key, value) => {
    expect(() => parseRequestPage({ ...page, [key]: value })).toThrow(
      UnexpectedResponseError,
    );
  });

  it('WXD-28 MỘT dòng hỏng làm cả trang không dùng được (không vẽ dữ liệu dở)', () => {
    const broken = {
      ...page,
      items: [
        makeRequestRow(),
        without(makeRequestRow({ yeuCauId: '102' }), 'bacSi'),
      ],
      total: 2,
    };
    expect(() => parseRequestPage(broken)).toThrow(UnexpectedResponseError);
  });

  it.each([null, undefined, [], 'trang', 7])(
    'WXD-35 thân %j không phải đối tượng ⇒ không dùng được',
    (body) => {
      expect(() => parseRequestPage(body)).toThrow(UnexpectedResponseError);
      expect(() => parseRequestDetail(body)).toThrow(UnexpectedResponseError);
      expect(() => parseRequestRow(body)).toThrow(UnexpectedResponseError);
    },
  );
});

describe('bộ đọc chi tiết một yêu cầu (B8)', () => {
  it('WXD-29 chi tiết đúng hợp đồng: ĐÚNG mười chín khoá', () => {
    const detail = makeRequestDetail();
    const parsed = parseRequestDetail(detail);
    expect(parsed).toEqual(detail);
    expect(Object.keys(parsed)).toHaveLength(19);
  });

  it.each([...ROW_KEYS, ...DETAIL_ONLY_KEYS])(
    'WXD-30 chi tiết thiếu khoá `%s` ⇒ không dùng được',
    (path) => {
      expect(() =>
        parseRequestDetail(without(makeRequestDetail(), path)),
      ).toThrow(UnexpectedResponseError);
    },
  );

  it('WXD-30 khoá thừa của chi tiết không được chép', () => {
    const parsed = parseRequestDetail({
      ...makeRequestDetail(),
      lichHenId: '9',
      benhNhanId: '4',
      nguoiXuLyId: '8',
      soDienThoai: '0900000000',
    });
    expect(Object.keys(parsed)).toHaveLength(19);
    expect(JSON.stringify(parsed)).not.toMatch(
      /lichHenId|benhNhanId|nguoiXuLyId|0900000000/,
    );
  });

  it('WXD-31 `soLanToiDa` là số nguyên không âm hoặc `null` (chưa cấu hình); `0` hợp lệ', () => {
    expect(
      parseRequestDetail(makeRequestDetail({ soLanToiDa: null })).soLanToiDa,
    ).toBeNull();
    expect(
      parseRequestDetail(makeRequestDetail({ soLanToiDa: 0 })).soLanToiDa,
    ).toBe(0);
    for (const bad of [-1, 1.5, '2', undefined]) {
      expect(() =>
        parseRequestDetail(withValue(makeRequestDetail(), 'soLanToiDa', bad)),
      ).toThrow(UnexpectedResponseError);
    }
  });

  it('WXD-32 `coTheDuyet` và `lyDoKhongDuyet` đi đôi: duyệt được ⇔ `null`; lệch ⇒ không dùng được', () => {
    expect(
      parseRequestDetail(
        makeRequestDetail({ coTheDuyet: true, lyDoKhongDuyet: null }),
      ),
    ).toMatchObject({ coTheDuyet: true, lyDoKhongDuyet: null });
    expect(
      parseRequestDetail(
        makeRequestDetail({
          coTheDuyet: false,
          lyDoKhongDuyet: 'LICH_HEN_DA_QUA_GIO',
        }),
      ),
    ).toMatchObject({
      coTheDuyet: false,
      lyDoKhongDuyet: 'LICH_HEN_DA_QUA_GIO',
    });
    expect(() =>
      parseRequestDetail(
        makeRequestDetail({
          coTheDuyet: true,
          lyDoKhongDuyet: 'LICH_HEN_DA_QUA_GIO',
        }),
      ),
    ).toThrow(UnexpectedResponseError);
    expect(() =>
      parseRequestDetail(
        makeRequestDetail({ coTheDuyet: false, lyDoKhongDuyet: null }),
      ),
    ).toThrow(UnexpectedResponseError);
    expect(() =>
      parseRequestDetail(withValue(makeRequestDetail(), 'coTheDuyet', 'true')),
    ).toThrow(UnexpectedResponseError);
    expect(() =>
      parseRequestDetail(
        makeRequestDetail({
          coTheDuyet: false,
          lyDoKhongDuyet: 5 as unknown as string,
        }),
      ),
    ).toThrow(UnexpectedResponseError);
  });

  it('WXD-32 mã `lyDoKhongDuyet` LẠ vẫn đọc được (web sẽ dùng câu chung, không in mã thô)', () => {
    expect(
      parseRequestDetail(
        makeRequestDetail({
          coTheDuyet: false,
          lyDoKhongDuyet: 'MA_MOI_CUA_TUONG_LAI',
        }),
      ).lyDoKhongDuyet,
    ).toBe('MA_MOI_CUA_TUONG_LAI');
  });

  it.each(['ConTrong', 'DangGiuCho', 'DaDat', 'HetHan'] as const)(
    'WXD-33 trạng thái khung giờ mong muốn `%s` đọc được',
    (trangThai) => {
      expect(
        parseRequestDetail(
          makeRequestDetail({
            khungGioMongMuon: { khungGioId: '555', trangThai },
          }),
        ).khungGioMongMuon.trangThai,
      ).toBe(trangThai);
    },
  );

  it.each([
    ['khungGioMongMuon.trangThai', 'DaHuy'],
    ['khungGioMongMuon.trangThai', null],
    ['khungGioMongMuon.khungGioId', 555],
    ['khungGioMongMuon.khungGioId', '0'],
    ['khungGioMongMuon', null],
    ['trangThaiLichGoc', null],
    ['lyDoYeuCau', null],
    ['lyDoYeuCau', 12],
  ] as const)('WXD-33 `%s` = %j ⇒ không dùng được', (path, value) => {
    expect(() =>
      parseRequestDetail(withValue(makeRequestDetail(), path, value)),
    ).toThrow(UnexpectedResponseError);
  });

  it('WXD-33 id khung giờ mong muốn lớn hơn 2^53 giữ nguyên chuỗi', () => {
    const big = '9007199254740993';
    expect(
      parseRequestDetail(
        makeRequestDetail({
          khungGioMongMuon: { khungGioId: big, trangThai: 'ConTrong' },
        }),
      ).khungGioMongMuon.khungGioId,
    ).toBe(big);
  });

  it('WXD-34 ba khoá xử lý: `null` cả ba khi còn chờ; có giá trị khi đã xử lý', () => {
    expect(parseRequestDetail(makeRequestDetail())).toMatchObject({
      ghiChuXuLy: null,
      thoiDiemXuLy: null,
      nguoiXuLy: null,
    });
    expect(parseRequestDetail(makeHandledDetail('DaDuyet'))).toMatchObject({
      trangThai: 'DaDuyet',
      ghiChuXuLy: 'Đã liên hệ bệnh nhân.\nXác nhận lịch mới.',
      thoiDiemXuLy: '2026-11-06T03:00:00.000Z',
      nguoiXuLy: { hoTen: 'Trần Thị Lễ Tân' },
    });
  });

  it.each([
    ['nguoiXuLy', {}],
    ['nguoiXuLy', { hoTen: 5 }],
    ['nguoiXuLy', 'Trần Thị Lễ Tân'],
    ['thoiDiemXuLy', '2026-11-06'],
    ['thoiDiemXuLy', '2026-11-06T10:00:00'],
    ['ghiChuXuLy', 7],
  ] as const)('WXD-34 `%s` = %j ⇒ không dùng được', (path, value) => {
    expect(() =>
      parseRequestDetail(withValue(makeHandledDetail('TuChoi'), path, value)),
    ).toThrow(UnexpectedResponseError);
  });

  it('WXD-36 lý do và ghi chú giữ NGUYÊN chữ (HTML, xuống dòng, khoảng trắng hai đầu): không làm sạch, không cắt', () => {
    const html = '  <img src=x onerror=alert(1)>\n<b>đậm</b>  ';
    const parsed = parseRequestDetail(
      makeHandledDetail('TuChoi', { lyDoYeuCau: html, ghiChuXuLy: html }),
    );
    expect(parsed.lyDoYeuCau).toBe(html);
    expect(parsed.ghiChuXuLy).toBe(html);
  });
});
