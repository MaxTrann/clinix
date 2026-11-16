import 'reflect-metadata';
import { toDoctorDetail, toDoctorItem } from './doctor-appointment.mapper.js';
import {
  DOCTOR_VISIBLE_STATES,
  RECORD_VISIBLE_STATES,
} from './doctor-appointments.dto.js';
import type {
  DoctorAppointmentDetailRow,
  DoctorAppointmentPageRow,
} from './doctor-appointments.repository.js';
import {
  collectKeys,
  collectStrings,
  DOCTOR_FORBIDDEN_KEY,
} from '../testing/response-keys.js';

// Task B5 — mapper của Bác sĩ (hàm thuần): danh sách trắng từng khoá (DSB-06), nguồn của người khám (DSB-12). Mã DSB-nn là PLAN 7.8, TRACKING 3.20.3. Task B3 (TRACKING 17): dòng có thêm `coHoSoKham`
// (chín khoá), chi tiết vẫn mười một khoá với `ghiChuKham` là `null` hoặc đối tượng (DSB-06, DSB-08 hết "Một phần"; HDK-01, HDK-02 ở các khối cuối tệp).
// Tám khoá LÕI của một lịch, dùng chung cho dòng (cộng `coHoSoKham`) và chi tiết (cộng `ghiChuKham`, `chiNhanh`, `ngayDat`)
const CORE_KEYS = [
  'ca',
  'chuyenKhoa',
  'dichVu',
  'lyDoKham',
  'maLichHen',
  'nguoiKham',
  'thoiGian',
  'trangThai',
];
const PAGE_KEYS = [...CORE_KEYS, 'coHoSoKham'].sort();
const EXAMINEE_KEYS = [
  'gioiTinh',
  'hoTen',
  'ngaySinh',
  'quanHe',
  'soDienThoai',
];

function row(
  overrides: Partial<DoctorAppointmentPageRow> = {},
): DoctorAppointmentPageRow {
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
    coHoSoKham: 0,
    ...overrides,
  };
}

// Hàng thô của câu chi tiết: chưa có hồ sơ (cờ 0, mọi cột hồ sơ NULL)
function detailRow(
  overrides: Partial<DoctorAppointmentDetailRow> = {},
): DoctorAppointmentDetailRow {
  return {
    ...row(),
    chiNhanh: 'Chi nhánh 1',
    ngayDat: new Date('2026-11-01T02:00:00.000Z'),
    coHoSo: 0,
    trieuChung: null,
    chanDoanSoBo: null,
    huongXuLy: null,
    ngayTaiKhamDuKien: null,
    capNhatLanCuoi: null,
    ...overrides,
  };
}

describe('toDoctorItem: dòng danh sách (DSB-06, DSB-12)', () => {
  it('DSB-06 ĐÚNG chín khoá cấp một (tám khoá lõi cộng `coHoSoKham`) và năm khoá con của `nguoiKham`; `thoiGian` là ISO UTC', () => {
    const item = toDoctorItem(row());
    expect(Object.keys(item).sort()).toStrictEqual(PAGE_KEYS);
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
  it('DSB-06 ĐÚNG mười một khoá cấp một = tám khoá lõi cộng `ghiChuKham`, `chiNhanh`, `ngayDat`; KHÔNG `lyDoHuy`, KHÔNG `coHoSoKham` (cờ chỉ của danh sách)', () => {
    const detail = toDoctorDetail(detailRow());
    expect(Object.keys(detail).sort()).toStrictEqual(
      [...CORE_KEYS, 'chiNhanh', 'ghiChuKham', 'ngayDat'].sort(),
    );
    expect(detail).not.toHaveProperty('coHoSoKham');
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

  it('DSB-08 khoá `ghiChuKham` LUÔN có ở chi tiết (để giao diện dựa vào khoá): `null` khi chưa có hồ sơ, ở mọi trạng thái; đối tượng khi có (chi tiết ở khối HDK-01 bên dưới)', () => {
    for (const trangThai of ['DaXacNhan', 'HoanThanh', 'DaHuy'] as const) {
      const detail = toDoctorDetail(detailRow({ trangThai }));
      expect(detail).toHaveProperty('ghiChuKham', null);
    }
    expect(toDoctorDetail(withRecord())).toHaveProperty('ghiChuKham');
    expect(toDoctorDetail(withRecord()).ghiChuKham).not.toBeNull();
  });

  it('DSB-06 chi tiết dùng CHUNG lõi với dòng: tám khoá lõi y hệt `toDoctorItem` (trừ `coHoSoKham`)', () => {
    const base = row({ quanHe: 'Me', soDienThoai: null });
    const { ghiChuKham, chiNhanh, ngayDat, ...rest } = toDoctorDetail(
      detailRow({ ...base }),
    );
    expect([ghiChuKham, chiNhanh, ngayDat]).toHaveLength(3);
    const { coHoSoKham, ...core } = toDoctorItem(base);
    expect(typeof coHoSoKham).toBe('boolean');
    expect(rest).toStrictEqual(core);
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

// Task B3 (doctor-exam; PLAN 5.10 E2; TRACKING 17): `coHoSoKham` ở dòng danh sách (HDK-02) và `ghiChuKham` ở chi tiết (HDK-01, HDK-15, XHS-14). Mapper CHỈ tin cờ `coHoSo`/`coHoSoKham` mà SQL đã
// lọc theo trạng thái (Q16: điều kiện nằm trong `ON` của `LEFT JOIN`); nội dung đi nguyên văn, KHÔNG `trim`, KHÔNG đổi xuống dòng.
const RECORD_KEYS = [
  'capNhatLanCuoi',
  'chanDoanSoBo',
  'huongXuLy',
  'ngayTaiKhamDuKien',
  'trieuChung',
];
const UPDATED_AT = new Date('2026-11-10T03:20:30.000Z');

function withRecord(
  overrides: Partial<DoctorAppointmentDetailRow> = {},
): DoctorAppointmentDetailRow {
  return detailRow({
    trangThai: 'HoanThanh',
    coHoSo: 1,
    trieuChung: 'Ho kéo dài hai tuần',
    chanDoanSoBo: 'Viêm họng cấp',
    huongXuLy: 'Uống nhiều nước, tái khám khi sốt',
    ngayTaiKhamDuKien: '2026-11-24',
    capNhatLanCuoi: UPDATED_AT,
    ...overrides,
  });
}

describe('HDK-02 `coHoSoKham` ở dòng danh sách: một cờ logic, KHÔNG nội dung', () => {
  it.each([
    [1, true],
    ['1', true],
    [true, true],
    [0, false],
    ['0', false],
    [false, false],
  ])(
    'HDK-02 cột logic của MySQL %j ⇒ `coHoSoKham` là boolean %j (driver trả số, chuỗi hoặc boolean)',
    (raw, expected) => {
      expect(toDoctorItem(row({ coHoSoKham: raw })).coHoSoKham).toBe(expected);
    },
  );

  it('HDK-02 hàng thô mang cả cột nội dung (giả sử SQL lỡ chọn) vẫn KHÔNG lọt vào dòng: chín khoá, không chuỗi nội dung', () => {
    const leaky = row({
      coHoSoKham: 1,
      ...({
        trieuChung: 'NỘI DUNG BÍ MẬT',
        chanDoanSoBo: 'CHẨN ĐOÁN BÍ MẬT',
        huongXuLy: 'LỜI KHUYÊN BÍ MẬT',
        capNhatLanCuoi: UPDATED_AT,
      } as object),
    });
    const item = toDoctorItem(leaky);
    expect(Object.keys(item).sort()).toStrictEqual(PAGE_KEYS);
    expect(JSON.stringify(item)).not.toMatch(/BÍ MẬT|2026-11-10T03:20:30/);
  });
});

describe('HDK-01 `ghiChuKham` ở chi tiết: `null` hoặc đối tượng ĐÚNG năm khoá', () => {
  it('HDK-01 không có dòng hồ sơ (`coHoSo` 0) ⇒ `null` ở mọi trạng thái hiển thị; mapper chỉ tin cờ, kể cả khi hàng thô lỡ mang cột chữ', () => {
    for (const trangThai of DOCTOR_VISIBLE_STATES) {
      expect(
        toDoctorDetail(detailRow({ trangThai })).ghiChuKham,
        trangThai,
      ).toBeNull();
      expect(
        toDoctorDetail(
          detailRow({
            trangThai,
            coHoSo: 0,
            trieuChung: 'x',
            capNhatLanCuoi: UPDATED_AT,
          }),
        ).ghiChuKham,
        trangThai,
      ).toBeNull();
    }
  });

  it.each([1, '1', true])(
    'HDK-01 có dòng (`coHoSo` %j) ⇒ đối tượng đúng năm khoá, giá trị đúng; `capNhatLanCuoi` là `toISOString()` (CÙNG định dạng token của B2: có mili giây và `Z`)',
    (coHoSo) => {
      const { ghiChuKham } = toDoctorDetail(withRecord({ coHoSo }));
      expect(ghiChuKham).not.toBeNull();
      expect(Object.keys(ghiChuKham ?? {}).sort()).toStrictEqual(RECORD_KEYS);
      expect(ghiChuKham).toStrictEqual({
        trieuChung: 'Ho kéo dài hai tuần',
        chanDoanSoBo: 'Viêm họng cấp',
        huongXuLy: 'Uống nhiều nước, tái khám khi sốt',
        ngayTaiKhamDuKien: '2026-11-24',
        capNhatLanCuoi: '2026-11-10T03:20:30.000Z',
      });
      expect(ghiChuKham?.capNhatLanCuoi).toBe(UPDATED_AT.toISOString());
    },
  );

  it('HDK-01 chi tiết có hồ sơ vẫn ĐÚNG mười một khoá cấp một và KHÔNG có `coHoSoKham` (cờ chỉ của danh sách); không hàng thô thừa', () => {
    const detail = toDoctorDetail(withRecord());
    expect(Object.keys(detail).sort()).toStrictEqual(
      [...CORE_KEYS, 'chiNhanh', 'ghiChuKham', 'ngayDat'].sort(),
    );
    expect(detail).not.toHaveProperty('coHoSoKham');
    expect(detail).not.toHaveProperty('coHoSo');
  });

  it('HDK-01 `ngayTaiKhamDuKien` là chuỗi `YYYY-MM-DD` nguyên văn (mốc cuối năm) hoặc `null`', () => {
    expect(
      toDoctorDetail(withRecord({ ngayTaiKhamDuKien: '2026-12-31' })).ghiChuKham
        ?.ngayTaiKhamDuKien,
    ).toBe('2026-12-31');
    expect(
      toDoctorDetail(withRecord({ ngayTaiKhamDuKien: null })).ghiChuKham,
    ).toHaveProperty('ngayTaiKhamDuKien', null);
  });

  it('HDK-01 hai tập trạng thái "hiện hồ sơ" và "hiển thị" khớp hằng: đúng `DaTiepDon`, `HoanThanh`, đều nằm trong sáu trạng thái hiển thị của Bác sĩ', () => {
    expect([...RECORD_VISIBLE_STATES].sort()).toStrictEqual([
      'DaTiepDon',
      'HoanThanh',
    ]);
    for (const state of RECORD_VISIBLE_STATES)
      expect(DOCTOR_VISIBLE_STATES).toContain(state);
  });
});

describe('HDK-15, XHS-14 nội dung nguyên văn và cột NULL', () => {
  const VERBATIM = [
    '  <script>alert("x")</script> & <b>đậm</b>  ',
    'Dòng 1\r\nDòng 2\n\tDòng 3 😀 👨‍⚕️',
    ' ',
    'a'.repeat(2000),
  ];

  it.each(VERBATIM.map((text) => [text.length, text] as const))(
    'HDK-15 chuỗi %i ký tự (HTML, emoji, CRLF, TAB, khoảng trắng hai đầu) đi qua mapper KHÔNG đổi một ký tự ở cả ba trường chữ',
    (_length, text) => {
      const { ghiChuKham } = toDoctorDetail(
        withRecord({ trieuChung: text, chanDoanSoBo: text, huongXuLy: text }),
      );
      expect(ghiChuKham?.trieuChung).toBe(text);
      expect(ghiChuKham?.chanDoanSoBo).toBe(text);
      expect(ghiChuKham?.huongXuLy).toBe(text);
    },
  );

  it.each(['trieuChung', 'chanDoanSoBo', 'huongXuLy'] as const)(
    'XHS-14 cột chữ `%s` là NULL (dữ liệu từ nguồn khác) ⇒ chuỗi rỗng, KHÔNG `null` (bộ đọc web chỉ nhận chuỗi), các trường khác giữ nguyên',
    (column) => {
      const { ghiChuKham } = toDoctorDetail(withRecord({ [column]: null }));
      expect(ghiChuKham?.[column]).toBe('');
      expect(typeof ghiChuKham?.trieuChung).toBe('string');
      expect(typeof ghiChuKham?.chanDoanSoBo).toBe('string');
      expect(typeof ghiChuKham?.huongXuLy).toBe('string');
      const others = (
        ['trieuChung', 'chanDoanSoBo', 'huongXuLy'] as const
      ).filter((name) => name !== column);
      for (const name of others)
        expect(ghiChuKham?.[name]).toBe(withRecord()[name]);
    },
  );

  it('XHS-14 cả ba cột chữ NULL ⇒ vẫn đối tượng năm khoá (không lỗi, không `null`)', () => {
    const { ghiChuKham } = toDoctorDetail(
      withRecord({ trieuChung: null, chanDoanSoBo: null, huongXuLy: null }),
    );
    expect(ghiChuKham).toMatchObject({
      trieuChung: '',
      chanDoanSoBo: '',
      huongXuLy: '',
    });
    expect(Object.keys(ghiChuKham ?? {}).sort()).toStrictEqual(RECORD_KEYS);
  });

  it('HDK-01 không khoá nào của chi tiết có hồ sơ (kể cả khoá con của `ghiChuKham`) khớp regex cấm của Bác sĩ', () => {
    for (const key of collectKeys(toDoctorDetail(withRecord())))
      expect(key, key).not.toMatch(DOCTOR_FORBIDDEN_KEY);
    for (const key of collectKeys(toDoctorItem(row({ coHoSoKham: 1 }))))
      expect(key, key).not.toMatch(DOCTOR_FORBIDDEN_KEY);
  });
});
