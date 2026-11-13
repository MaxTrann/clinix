import { describe, expect, it } from 'vitest';
import { UnexpectedResponseError } from '../../../shared/api/errors';
import {
  makeCheckResult,
  makeCreatedDone,
  makeCreatedResult,
} from '../testing/fake-booking-api';
import {
  parseCheckConfirmation,
  parseCheckSummary,
  parseCreatedAppointment,
} from './booking-readers';

// booking F5. XNR-01…XNR-03 là [đề xuất] (PLAN booking mục 7.40): bộ đọc `checks` đủ 12 khoá của Bước 5 và bộ đọc 201 của `POST /booking/appointments`.
// Mọi số tiền phải là chuỗi decimal đúng dạng và đi NGUYÊN VĂN (không `Number`); sai hình ⇒ `UnexpectedResponseError`.
const TIER_24_100 = { soGioTruocToiThieu: 24, tyLeHoan: 100 };
const TIER_2_50 = { soGioTruocToiThieu: 2, tyLeHoan: 50 };
const TIER_0_0 = { soGioTruocToiThieu: 0, tyLeHoan: 0 };

describe('booking F5 — bộ đọc `checks` đủ 12 khoá (XNR-01, XNR-02)', () => {
  it('XNR-01 WZ-04 đọc đủ 12 khoá; khoá thừa của API không lọt ra; Bước 4 vẫn chỉ đọc ba khoá (BRD-03 không đổi)', () => {
    const raw = makeCheckResult({
      email: 'a@example.com',
      benhNhanId: '1',
      chinhSachHoan: [TIER_24_100, TIER_2_50, TIER_0_0],
      soDuVi: '350000.00',
    });
    const result = parseCheckConfirmation(raw);
    expect(Object.keys(result).sort()).toEqual([
      'bacSi',
      'chiNhanh',
      'chinhSachHoan',
      'chuyenKhoa',
      'dichVu',
      'giaApDung',
      'giaDichVu',
      'nguoiKham',
      'phuPhi',
      'soDuVi',
      'thoiGian',
      'tienCoc',
    ]);
    expect(result).toEqual({
      dichVu: 'Tim mạch',
      chuyenKhoa: 'Tim mạch',
      bacSi: { hoTen: 'Nguyễn Minh Anh', chucDanh: 'ThS_BS' },
      chiNhanh: {
        ten: 'CLINIX Chi nhánh Quận 3',
        diaChi: '123 Nguyễn Thị Minh Khai',
      },
      thoiGian: '2026-10-20T02:00:00.000Z',
      nguoiKham: { hoTen: 'Nguyễn Văn A', laBanThan: true },
      giaDichVu: '300000.00',
      phuPhi: '0.00',
      giaApDung: '300000.00',
      tienCoc: '100000.00',
      chinhSachHoan: [TIER_24_100, TIER_2_50, TIER_0_0],
      soDuVi: '350000.00',
    });
    // Bộ đọc của Bước 4 không đổi: ba khoá, không giá
    expect(Object.keys(parseCheckSummary(raw)).sort()).toEqual([
      'bacSi',
      'dichVu',
      'thoiGian',
    ]);
  });

  it('XNR-01 mọi số tiền giữ NGUYÊN CHUỖI (không qua Number): "0.10", số lớn hơn 2^53', () => {
    const result = parseCheckConfirmation(
      makeCheckResult({
        giaDichVu: '9007199254740993.10',
        phuPhi: '0.10',
        giaApDung: '9007199254740993.20',
        tienCoc: '9007199254740993.00',
        soDuVi: '0.10',
      }),
    );
    expect(result.giaDichVu).toBe('9007199254740993.10');
    expect(result.phuPhi).toBe('0.10');
    expect(result.giaApDung).toBe('9007199254740993.20');
    expect(result.tienCoc).toBe('9007199254740993.00');
    expect(result.soDuVi).toBe('0.10');
  });

  it('XNR-01 `soDuVi` là `null` thì giữ `null`, "0.00" thì giữ "0.00" (hai ý nghĩa khác nhau); người thân: `laBanThan` false', () => {
    expect(
      parseCheckConfirmation(makeCheckResult({ soDuVi: null })).soDuVi,
    ).toBeNull();
    expect(
      parseCheckConfirmation(makeCheckResult({ soDuVi: '0.00' })).soDuVi,
    ).toBe('0.00');
    expect(
      parseCheckConfirmation(
        makeCheckResult({
          nguoiKham: { hoTen: 'Nguyễn Thị Bích', laBanThan: false },
        }),
      ).nguoiKham,
    ).toEqual({ hoTen: 'Nguyễn Thị Bích', laBanThan: false });
  });

  it('XNR-01 `chinhSachHoan` đủ ba dạng: null (cọc 0), mảng rỗng (cọc > 0 chưa có mốc) và mảng mốc', () => {
    expect(
      parseCheckConfirmation(makeCheckResult({ chinhSachHoan: null }))
        .chinhSachHoan,
    ).toBeNull();
    expect(
      parseCheckConfirmation(makeCheckResult({ chinhSachHoan: [] }))
        .chinhSachHoan,
    ).toEqual([]);
    expect(
      parseCheckConfirmation(
        makeCheckResult({ chinhSachHoan: [TIER_24_100, TIER_0_0] }),
      ).chinhSachHoan,
    ).toEqual([TIER_24_100, TIER_0_0]);
  });

  it.each<[string, Record<string, unknown>]>([
    ['thiếu khoá `soDuVi` (luôn có mặt)', { soDuVi: undefined }],
    ['`soDuVi` là số', { soDuVi: 350000 }],
    ['`soDuVi` sai dạng', { soDuVi: '350.000đ' }],
    ['`giaApDung` là số', { giaApDung: 300000 }],
    ['`giaApDung` có dấu phân cách', { giaApDung: '300,000.00' }],
    ['`tienCoc` âm', { tienCoc: '-1.00' }],
    ['`phuPhi` thiếu', { phuPhi: undefined }],
    ['`giaDichVu` rỗng', { giaDichVu: '' }],
    ['`laBanThan` là chuỗi', { nguoiKham: { hoTen: 'A', laBanThan: 'true' } }],
    ['`nguoiKham.hoTen` rỗng', { nguoiKham: { hoTen: '', laBanThan: true } }],
    ['`chiNhanh` là null', { chiNhanh: null }],
    ['`chuyenKhoa` rỗng', { chuyenKhoa: '' }],
    ['`chinhSachHoan` không phải mảng', { chinhSachHoan: {} }],
    [
      'mốc có `tyLeHoan` ngoài 0 đến 100',
      { chinhSachHoan: [{ soGioTruocToiThieu: 24, tyLeHoan: 101 }] },
    ],
    [
      'mốc có số giờ âm',
      { chinhSachHoan: [{ soGioTruocToiThieu: -1, tyLeHoan: 50 }] },
    ],
    [
      'mốc có số giờ không nguyên',
      { chinhSachHoan: [{ soGioTruocToiThieu: 1.5, tyLeHoan: 50 }] },
    ],
    ['mốc không giảm dần', { chinhSachHoan: [TIER_2_50, TIER_24_100] }],
    [
      'hai mốc cùng số giờ',
      {
        chinhSachHoan: [TIER_24_100, { soGioTruocToiThieu: 24, tyLeHoan: 50 }],
      },
    ],
  ])(
    'XNR-02 WZ-04 phản hồi sai hình dạng ⇒ UnexpectedResponseError: %s',
    (_name, override) => {
      expect(() => parseCheckConfirmation(makeCheckResult(override))).toThrow(
        UnexpectedResponseError,
      );
    },
  );

  it('XNR-02 thân không có `tomTat` hay không phải đối tượng ⇒ UnexpectedResponseError', () => {
    for (const raw of [null, 'x', [], {}, { tomTat: null }, { tomTat: 5 }]) {
      expect(() => parseCheckConfirmation(raw)).toThrow(
        UnexpectedResponseError,
      );
    }
  });
});

describe('booking F5 — bộ đọc 201 của tạo lịch hẹn (XNR-03)', () => {
  it('XNR-03 WZ-05 đúng 7 khoá, cọc > 0: `ChoThanhToan`, có hạn thanh toán, `canThanhToan` true', () => {
    const result = parseCreatedAppointment({
      ...makeCreatedResult(),
      lichHenId: '9',
      email: 'a@example.com',
    });
    expect(Object.keys(result).sort()).toEqual([
      'canThanhToan',
      'giaApDung',
      'hanThanhToan',
      'maLichHen',
      'thoiGianMayChu',
      'tienCoc',
      'trangThai',
    ]);
    expect(result).toEqual({
      maLichHen: 'CLX-20261019-7K3M9',
      trangThai: 'ChoThanhToan',
      hanThanhToan: '2026-10-19T03:15:00.000Z',
      giaApDung: '300000.00',
      tienCoc: '100000.00',
      canThanhToan: true,
      thoiGianMayChu: '2026-10-19T03:00:00.000Z',
    });
  });

  it('XNR-03 cọc 0đ: `DaXacNhan`, `hanThanhToan` là null, `canThanhToan` false; số tiền giữ nguyên chuỗi', () => {
    const result = parseCreatedAppointment(
      makeCreatedDone({ giaApDung: '9007199254740993.10' }),
    );
    expect(result.trangThai).toBe('DaXacNhan');
    expect(result.hanThanhToan).toBeNull();
    expect(result.canThanhToan).toBe(false);
    expect(result.giaApDung).toBe('9007199254740993.10');
    expect(result.tienCoc).toBe('0.00');
  });

  it.each<[string, Record<string, unknown>]>([
    ['`trangThai` ngoài hai giá trị', { trangThai: 'DaHuy' }],
    ['`trangThai` vắng', { trangThai: undefined }],
    [
      '`canThanhToan` true nhưng `DaXacNhan`',
      { trangThai: 'DaXacNhan', canThanhToan: true },
    ],
    ['`canThanhToan` false nhưng `ChoThanhToan`', { canThanhToan: false }],
    ['`canThanhToan` là chuỗi', { canThanhToan: 'true' }],
    ['`canThanhToan` vắng', { canThanhToan: undefined }],
    ['`maLichHen` rỗng', { maLichHen: '' }],
    ['`maLichHen` có dấu gạch chéo', { maLichHen: 'CLX/../x' }],
    ['`maLichHen` có khoảng trắng', { maLichHen: 'CLX 1' }],
    ['`maLichHen` không phải chuỗi', { maLichHen: 123 }],
    ['`hanThanhToan` không phải ISO', { hanThanhToan: 'mai' }],
    ['`hanThanhToan` vắng', { hanThanhToan: undefined }],
    ['`giaApDung` là số', { giaApDung: 300000 }],
    ['`tienCoc` sai dạng', { tienCoc: '100.000đ' }],
    ['`thoiGianMayChu` không phải ISO', { thoiGianMayChu: '' }],
  ])(
    'XNR-03 WZ-13 201 sai hình dạng ⇒ UnexpectedResponseError (nơi gọi coi là "chưa rõ"): %s',
    (_name, override) => {
      expect(() =>
        parseCreatedAppointment(makeCreatedResult(override)),
      ).toThrow(UnexpectedResponseError);
    },
  );

  it('XNR-03 thân không phải đối tượng ⇒ UnexpectedResponseError', () => {
    for (const raw of [null, '', 'OK', [], 7]) {
      expect(() => parseCreatedAppointment(raw)).toThrow(
        UnexpectedResponseError,
      );
    }
  });
});
