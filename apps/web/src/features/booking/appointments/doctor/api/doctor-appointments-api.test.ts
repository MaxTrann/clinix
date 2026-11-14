import { describe, expect, it } from 'vitest';
import { UnexpectedResponseError } from '../../../../../shared/api/errors';
import {
  makeDoctorAppointment,
  makeDoctorDetail,
} from '../../../testing/fake-doctor-api';
import { parseDoctorAppointmentDetail } from './doctor-appointment-detail-api';
import {
  buildDoctorListQuery,
  parseDoctorAppointment,
  parseDoctorAppointmentPage,
} from './doctor-appointments-api';

// booking F11: bộ đọc và bộ dựng query của API Bác sĩ. Mã DAL-01, DAL-03, DAD-02 là [đề xuất] (PLAN booking mục 7.44). Phản hồi 200 sai hình dạng cùng loại với HTML 502 (không dùng được): ném
// `UnexpectedResponseError`; khoá thừa của API không được chép theo, nên giá, cọc, email, người đặt, tên bác sĩ không bao giờ lên màn hình (BSI-02).
const COUNTS = {
  ChoThanhToan: 1,
  DaXacNhan: 2,
  DaTiepDon: 1,
  HoanThanh: 2,
  DaHuy: 0,
  VangMat: 0,
};

// Khoá mà B5 KHÔNG trả (Q33, H10): nếu bộ đọc chép khoá thừa thì chúng lọt ra
const EXTRA = {
  giaSnapshot: '300000.00',
  tienCoc: '100000.00',
  email: 'nguyenvana@email.com',
  bacSi: 'ThS.BS Nguyễn Minh Anh',
  nguoiDat: { hoTen: 'Người đặt', soDienThoai: '0988888888' },
  thanhToan: { daThu: '100000.00' },
  lyDoHuy: 'Bận việc',
  lichHenId: '9007199254740993',
};

const EIGHT_KEYS = [
  'ca',
  'chuyenKhoa',
  'dichVu',
  'lyDoKham',
  'maLichHen',
  'nguoiKham',
  'thoiGian',
  'trangThai',
];

describe('booking F11 — bộ đọc dòng và trang của Bác sĩ', () => {
  it('DAL-03 dòng có đúng tám khoá, người khám đúng năm khoá; khoá thừa (giá, cọc, email, người đặt, tên bác sĩ, id…) bị bỏ', () => {
    const row = parseDoctorAppointment({
      ...makeDoctorAppointment(),
      ...EXTRA,
    });
    expect(Object.keys(row).sort()).toEqual(EIGHT_KEYS);
    expect(Object.keys(row.nguoiKham).sort()).toEqual([
      'gioiTinh',
      'hoTen',
      'ngaySinh',
      'quanHe',
      'soDienThoai',
    ]);
    const text = JSON.stringify(row);
    for (const leaked of [
      '300000',
      '100000',
      'email',
      'Nguyễn Minh Anh',
      '0988888888',
      'Bận việc',
      '9007199254740993',
    ]) {
      expect(text).not.toContain(leaked);
    }
  });

  it('DAL-03 ba khoá của người khám có thể null (người thân không có SĐT: KHÔNG thay bằng SĐT người đặt); lý do khám null', () => {
    const row = parseDoctorAppointment({
      ...makeDoctorAppointment({
        lyDoKham: null,
        nguoiKham: {
          hoTen: 'Vũ Thị Lan',
          quanHe: 'Me',
          gioiTinh: null,
          ngaySinh: null,
          soDienThoai: null,
        },
      }),
      ...EXTRA,
    });
    expect(row.nguoiKham).toEqual({
      hoTen: 'Vũ Thị Lan',
      quanHe: 'Me',
      gioiTinh: null,
      ngaySinh: null,
      soDienThoai: null,
    });
    expect(row.lyDoKham).toBeNull();
  });

  it.each(EIGHT_KEYS)(
    'DAL-03 thiếu khoá %s ⇒ phản hồi không dùng được',
    (key) => {
      const row: Record<string, unknown> = { ...makeDoctorAppointment() };
      delete row[key];
      expect(() => parseDoctorAppointment(row)).toThrow(
        UnexpectedResponseError,
      );
    },
  );

  it.each([
    ['maLichHen rỗng', { maLichHen: '' }],
    ['thoiGian không phải ngày', { thoiGian: 'không phải ngày' }],
    ['ca là số', { ca: 1 }],
    ['nguoiKham là chuỗi', { nguoiKham: 'Nguyễn Văn A' }],
    ['lyDoKham là số', { lyDoKham: 5 }],
    [
      'ngaySinh sai dạng',
      {
        nguoiKham: {
          hoTen: 'A',
          quanHe: 'BanThan',
          gioiTinh: null,
          ngaySinh: '15/05/1990',
          soDienThoai: null,
        },
      },
    ],
    [
      'thiếu soDienThoai (undefined, không phải null)',
      {
        nguoiKham: {
          hoTen: 'A',
          quanHe: 'BanThan',
          gioiTinh: null,
          ngaySinh: null,
        },
      },
    ],
  ])('DAL-03 sai kiểu: %s ⇒ phản hồi không dùng được', (_label, patch) => {
    expect(() =>
      parseDoctorAppointment({ ...makeDoctorAppointment(), ...patch }),
    ).toThrow(UnexpectedResponseError);
  });

  it('DAL-03 trang: đủ năm khoá, `demTheoTrangThai` đủ sáu khoá (khoá thừa DaDoiLich bị bỏ); thiếu khoá hay sai kiểu ⇒ không dùng được', () => {
    const page = parseDoctorAppointmentPage({
      items: [makeDoctorAppointment()],
      total: 6,
      page: 1,
      pageSize: 20,
      demTheoTrangThai: { ...COUNTS, DaDoiLich: 4 },
    });
    expect(Object.keys(page).sort()).toEqual([
      'demTheoTrangThai',
      'items',
      'page',
      'pageSize',
      'total',
    ]);
    expect(page.demTheoTrangThai).toEqual(COUNTS);

    const bad = (patch: Record<string, unknown>) =>
      parseDoctorAppointmentPage({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
        demTheoTrangThai: COUNTS,
        ...patch,
      });
    expect(() => bad({ items: 'không phải mảng' })).toThrow(
      UnexpectedResponseError,
    );
    expect(() => bad({ total: -1 })).toThrow(UnexpectedResponseError);
    expect(() => bad({ page: 0 })).toThrow(UnexpectedResponseError);
    expect(() => bad({ pageSize: 0 })).toThrow(UnexpectedResponseError);
    expect(() =>
      bad({ demTheoTrangThai: { ...COUNTS, VangMat: undefined } }),
    ).toThrow(UnexpectedResponseError);
    expect(() => bad({ demTheoTrangThai: undefined })).toThrow(
      UnexpectedResponseError,
    );
  });
});

describe('booking F11 — bộ dựng query của Bác sĩ', () => {
  it('DAL-01 chỉ `page` khi chưa lọc; bộ lọc rỗng hay chưa chọn KHÔNG được gửi (`q=` rỗng là 400 của B5)', () => {
    expect(buildDoctorListQuery({ page: 1 })).toEqual({ page: 1 });
    expect(
      buildDoctorListQuery({
        page: 3,
        trangThai: undefined,
        ca: undefined,
        tuNgay: '',
        denNgay: '',
        q: '',
        sapXep: undefined,
      }),
    ).toEqual({ page: 3 });
  });

  it('DAL-01 gửi đúng các khoá B5 nhận, giá trị giữ nguyên chuỗi; KHÔNG BAO GIỜ có bacSiId, chiNhanhId, chuyenKhoaId, pageSize dù nơi gọi lỡ đưa vào', () => {
    const query = buildDoctorListQuery({
      page: 2,
      trangThai: 'DaTiepDon',
      ca: 'CaChieu',
      tuNgay: '2026-10-12',
      denNgay: '2026-10-18',
      q: 'Lan',
      sapXep: 'CuNhat',
      // Khoá lạ (ép kiểu): bộ dựng chỉ đọc danh sách khoá đã khai
      ...({
        bacSiId: '5',
        chiNhanhId: '3',
        chuyenKhoaId: '1',
        pageSize: 100,
      } as object),
    });
    expect(query).toEqual({
      page: 2,
      trangThai: 'DaTiepDon',
      ca: 'CaChieu',
      tuNgay: '2026-10-12',
      denNgay: '2026-10-18',
      q: 'Lan',
      sapXep: 'CuNhat',
    });
  });
});

const ELEVEN_KEYS = [...EIGHT_KEYS, 'chiNhanh', 'ghiChuKham', 'ngayDat'].sort();

describe('booking F11 — bộ đọc chi tiết của Bác sĩ', () => {
  it('DAD-02 chi tiết có đúng mười một khoá, `ghiChuKham` là null; khoá thừa (giá, cọc, email, lý do hủy, tên bác sĩ) bị bỏ', () => {
    const detail = parseDoctorAppointmentDetail({
      ...makeDoctorDetail(),
      ...EXTRA,
    });
    expect(Object.keys(detail).sort()).toEqual(ELEVEN_KEYS);
    expect(detail.ghiChuKham).toBeNull();
    expect(detail.chiNhanh).toBe('CLINIX Chi nhánh Quận 3');
    expect(detail.ngayDat).toBe('2026-10-16T03:00:00.000Z');
    const text = JSON.stringify(detail);
    for (const leaked of [
      '300000',
      '100000',
      'email',
      'Bận việc',
      '0988888888',
    ]) {
      expect(text).not.toContain(leaked);
    }
  });

  it('DAD-02 `ghiChuKham` khác null ⇒ phản hồi không dùng được (hợp đồng đã đổi: việc của `doctor`, sửa bộ đọc MỘT chỗ); thiếu khoá cũng vậy', () => {
    for (const ghiChuKham of [
      'Triệu chứng: đau ngực',
      { trieuChung: 'x' },
      '',
      0,
    ]) {
      expect(() =>
        parseDoctorAppointmentDetail({ ...makeDoctorDetail(), ghiChuKham }),
      ).toThrow(UnexpectedResponseError);
    }
    const missing: Record<string, unknown> = { ...makeDoctorDetail() };
    delete missing.ghiChuKham;
    expect(() => parseDoctorAppointmentDetail(missing)).toThrow(
      UnexpectedResponseError,
    );
  });

  it.each(['chiNhanh', 'ngayDat', 'maLichHen', 'nguoiKham'])(
    'DAD-02 thiếu khoá %s ⇒ phản hồi không dùng được',
    (key) => {
      const detail: Record<string, unknown> = { ...makeDoctorDetail() };
      delete detail[key];
      expect(() => parseDoctorAppointmentDetail(detail)).toThrow(
        UnexpectedResponseError,
      );
    },
  );

  it('DAD-02 ngayDat sai dạng, chiNhanh sai kiểu, thân không phải đối tượng ⇒ không dùng được', () => {
    expect(() =>
      parseDoctorAppointmentDetail({
        ...makeDoctorDetail(),
        ngayDat: '16/10/2026',
      }),
    ).toThrow(UnexpectedResponseError);
    expect(() =>
      parseDoctorAppointmentDetail({ ...makeDoctorDetail(), chiNhanh: 3 }),
    ).toThrow(UnexpectedResponseError);
    expect(() => parseDoctorAppointmentDetail(null)).toThrow(
      UnexpectedResponseError,
    );
    expect(() => parseDoctorAppointmentDetail([])).toThrow(
      UnexpectedResponseError,
    );
  });
});
