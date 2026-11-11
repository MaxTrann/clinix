import { toDoctorDetail, toDoctorItem } from './doctor-appointment.mapper.js';
import type {
  DoctorAppointmentDetailRow,
  DoctorAppointmentRow,
} from './doctor-appointments.repository.js';
import {
  collectKeys,
  collectStrings,
  DOCTOR_FORBIDDEN_KEY,
} from '../testing/response-keys.js';

// Task B5 — mapper của Bác sĩ (hàm thuần): danh sách trắng từng khoá (DSB-06), `ghiChuKham` luôn `null` (DSB-08), nguồn của người khám (DSB-12). Mã DSB-nn là PLAN 7.8, TRACKING 3.20.3.
const ITEM_KEYS = [
  'ca',
  'chuyenKhoa',
  'dichVu',
  'lyDoKham',
  'maLichHen',
  'nguoiKham',
  'thoiGian',
  'trangThai',
];
const EXAMINEE_KEYS = [
  'gioiTinh',
  'hoTen',
  'ngaySinh',
  'quanHe',
  'soDienThoai',
];

function row(
  overrides: Partial<DoctorAppointmentRow> = {},
): DoctorAppointmentRow {
  return {
    maLichHen: 'CLX-20261110-ABCDE',
    trangThai: 'DaXacNhan',
    thoiGian: new Date('2026-11-10T01:30:00.000Z'),
    ca: 'CaSang',
    nguoiKhamHoTen: 'Người Khám',
    quanHe: null,
    gioiTinh: 'Nam',
    ngaySinh: '1990-05-20',
    soDienThoai: '0901234567',
    dichVu: 'Khám nội',
    chuyenKhoa: 'Nội',
    lyDoKham: 'Đau đầu',
    ...overrides,
  };
}

function detailRow(
  overrides: Partial<DoctorAppointmentDetailRow> = {},
): DoctorAppointmentDetailRow {
  return {
    ...row(),
    chiNhanh: 'Chi nhánh 1',
    ngayDat: new Date('2026-11-01T02:00:00.000Z'),
    ...overrides,
  };
}

describe('toDoctorItem: dòng danh sách (DSB-06, DSB-12)', () => {
  it('DSB-06 ĐÚNG tám khoá cấp một và năm khoá con của `nguoiKham`; `thoiGian` là ISO UTC', () => {
    const item = toDoctorItem(row());
    expect(Object.keys(item).sort()).toStrictEqual(ITEM_KEYS);
    expect(Object.keys(item.nguoiKham).sort()).toStrictEqual(EXAMINEE_KEYS);
    expect(item.thoiGian).toBe('2026-11-10T01:30:00.000Z');
    expect(item.ca).toBe('CaSang');
    expect(item.trangThai).toBe('DaXacNhan');
  });

  it('DSB-12 khám cho chính mình (không `moi_quan_he`) ⇒ `quanHe = BanThan`; khám cho người thân ⇒ giá trị thô của hồ sơ', () => {
    expect(toDoctorItem(row({ quanHe: null })).nguoiKham.quanHe).toBe(
      'BanThan',
    );
    expect(toDoctorItem(row({ quanHe: 'Con' })).nguoiKham.quanHe).toBe('Con');
  });

  it('DSB-12 giới tính, ngày sinh, SĐT của người khám chuyển nguyên văn; thiếu (chưa nhập, người thân không có SĐT) là `null`, KHÔNG thay bằng chuỗi rỗng hay giá trị khác', () => {
    expect(toDoctorItem(row()).nguoiKham).toStrictEqual({
      hoTen: 'Người Khám',
      quanHe: 'BanThan',
      gioiTinh: 'Nam',
      ngaySinh: '1990-05-20',
      soDienThoai: '0901234567',
    });
    expect(
      toDoctorItem(row({ gioiTinh: null, ngaySinh: null, soDienThoai: null }))
        .nguoiKham,
    ).toMatchObject({ gioiTinh: null, ngaySinh: null, soDienThoai: null });
  });

  it('DSB-06 `lyDoKham` là chuỗi hoặc `null`', () => {
    expect(toDoctorItem(row({ lyDoKham: null })).lyDoKham).toBeNull();
    expect(toDoctorItem(row()).lyDoKham).toBe('Đau đầu');
  });

  it('DSB-06 cột thừa trên hàng thô (id, giá, người đặt, email, lý do huỷ) KHÔNG lọt vào JSON', () => {
    const noisy = row({
      ...({
        lichHenId: '4242',
        giaSnapshot: '150000.00',
        tienCoc: '50000.00',
        nguoiDatHoTen: 'Người Đặt Khác',
        email: 'x@example.test',
        lyDoHuy: 'Bệnh nhân bận',
      } as object),
    });
    const json = JSON.stringify(toDoctorItem(noisy));
    expect(json).not.toMatch(
      /4242|150000|50000|Người Đặt Khác|example\.test|Bệnh nhân bận/,
    );
  });
});

describe('toDoctorDetail: chi tiết (DSB-06, DSB-08)', () => {
  it('DSB-06 ĐÚNG mười một khoá cấp một = tám khoá của dòng cộng `ghiChuKham`, `chiNhanh`, `ngayDat`; KHÔNG `lyDoHuy`', () => {
    const detail = toDoctorDetail(detailRow());
    expect(Object.keys(detail).sort()).toStrictEqual(
      [...ITEM_KEYS, 'chiNhanh', 'ghiChuKham', 'ngayDat'].sort(),
    );
    expect(detail).not.toHaveProperty('lyDoHuy');
    expect(detail.chiNhanh).toBe('Chi nhánh 1');
    expect(detail.ngayDat).toBe('2026-11-01T02:00:00.000Z');
  });

  it('DSB-06 lịch `DaHuy` có `ly_do_huy` trên hàng thô vẫn KHÔNG có `lyDoHuy` ở JSON (Figma 692:2 không hiện lý do huỷ)', () => {
    const detail = toDoctorDetail(
      detailRow({
        trangThai: 'DaHuy',
        ...({ lyDoHuy: 'Ghi chú nội bộ của Lễ tân' } as object),
      }),
    );
    expect(JSON.stringify(detail)).not.toContain('Ghi chú nội bộ');
    expect(collectKeys(detail)).not.toContain('lyDoHuy');
  });

  it('DSB-08 `ghiChuKham` LUÔN `null` (bảng `ho_so_kham` chưa có), kể cả lịch HoanThanh: khoá luôn có để giao diện dựa vào khoá', () => {
    for (const trangThai of ['DaXacNhan', 'HoanThanh', 'DaHuy'] as const) {
      const detail = toDoctorDetail(detailRow({ trangThai }));
      expect(detail).toHaveProperty('ghiChuKham', null);
    }
  });

  it('DSB-06 chi tiết dùng CHUNG hàm của dòng: tám khoá đầu y hệt `toDoctorItem`', () => {
    const base = row({ quanHe: 'Me', soDienThoai: null });
    const { ghiChuKham, chiNhanh, ngayDat, ...rest } = toDoctorDetail(
      detailRow({ ...base }),
    );
    expect([ghiChuKham, chiNhanh, ngayDat]).toHaveLength(3);
    expect(rest).toStrictEqual(toDoctorItem(base));
  });
});

describe('regex khoá cấm riêng cho Bác sĩ (DSB-06)', () => {
  it('DSB-06 không khoá nào của dòng và chi tiết khớp regex cấm; `ngaySinh`, `gioiTinh`, `soDienThoai`, `chiNhanh`, `ngayDat`, `thoiGian` được phép', () => {
    for (const json of [toDoctorItem(row()), toDoctorDetail(detailRow())])
      for (const key of collectKeys(json))
        expect(key, key).not.toMatch(DOCTOR_FORBIDDEN_KEY);
  });

  it.each([
    'lichHenId',
    'benhNhanId',
    'khungGioId',
    'hoSoNguoiThanId',
    'email',
    'matKhauBam',
    'diaChi',
    'giaSnapshot',
    'tienCoc',
    'hanThanhToan',
    'thanhToan',
    'trangThaiThanhToan',
    'giaoDichThanhToan',
    'hoanTien',
    'lyDoHuy',
    'ly_do_huy',
    'nguoiDat',
    'thoiGianMayChu',
    'bacSi',
  ])('DSB-06 regex cấm KHỚP khoá "%s" (mỗi khoá cấm đều bị bắt)', (key) => {
    expect(key).toMatch(DOCTOR_FORBIDDEN_KEY);
  });

  it.each([
    'ChoThanhToan',
    'DaXacNhan',
    'DaTiepDon',
    'HoanThanh',
    'DaHuy',
    'VangMat',
  ])(
    'DSB-06, DSB-11 tên trạng thái "%s" (khoá của `demTheoTrangThai`) KHÔNG bị regex cấm',
    (key) => {
      expect(key).not.toMatch(DOCTOR_FORBIDDEN_KEY);
    },
  );

  it('DSB-06 quét giá trị chuỗi: không SĐT người đặt, không email trong JSON dựng từ hàng sạch', () => {
    const strings = collectStrings(toDoctorDetail(detailRow()));
    expect(strings.some((value) => value.includes('@'))).toBe(false);
  });
});
