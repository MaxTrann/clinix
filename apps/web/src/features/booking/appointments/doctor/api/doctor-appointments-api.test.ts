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
  parseDoctorListRow,
} from './doctor-appointments-api';

// booking F11: bộ đọc và bộ dựng query của API Bác sĩ. Mã DAL-01, DAL-03, DAD-02 là [đề xuất] (PLAN booking mục 7.44); doctor-exam F2 sửa DAD-02: `ghiChuKham` nhận `null` HOẶC đối tượng năm khoá (WHS-08 phần bộ đọc chi tiết). Phản hồi 200 sai hình dạng cùng loại với HTML 502 (không dùng được): ném
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

// Hồ sơ khám (doctor-exam F2; hình dạng nguồn `ExamRecordView` của B2): đúng năm khoá. Dữ liệu giả.
const RECORD = {
  trieuChung: 'Đau ngực khi gắng sức',
  chanDoanSoBo: 'Theo dõi thêm',
  huongXuLy: 'Nghỉ ngơi, tái khám khi nặng hơn',
  ngayTaiKhamDuKien: '2026-07-10',
  capNhatLanCuoi: '2026-06-10T10:30:00.000Z',
};
const RECORD_KEYS = Object.keys(RECORD).sort();

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

  it('DAD-02 (F2) `ghiChuKham` là đối tượng đúng năm khoá ⇒ đọc đúng; vẫn đúng mười một khoá cấp một; khoá THỪA trong đối tượng bị bỏ, không chép sang kết quả (WHS-08 phần bộ đọc)', () => {
    const detail = parseDoctorAppointmentDetail({
      ...makeDoctorDetail(),
      ghiChuKham: {
        ...RECORD,
        soDienThoai: '0977777777',
        thua: 'KHÔNG ĐƯỢC LỌT',
      },
    });
    expect(detail.ghiChuKham).toEqual(RECORD);
    expect(Object.keys(detail.ghiChuKham ?? {}).sort()).toEqual(RECORD_KEYS);
    expect(Object.keys(detail).sort()).toEqual(ELEVEN_KEYS);
    const text = JSON.stringify(detail);
    for (const leaked of ['0977777777', 'KHÔNG ĐƯỢC LỌT', 'thua']) {
      expect(text).not.toContain(leaked);
    }
  });

  it('DAD-02 (F2) `ngayTaiKhamDuKien` là null (tuỳ chọn) ⇒ giữ null; `ghiChuKham` null ⇒ null', () => {
    const detail = parseDoctorAppointmentDetail({
      ...makeDoctorDetail(),
      ghiChuKham: { ...RECORD, ngayTaiKhamDuKien: null },
    });
    expect(detail.ghiChuKham).toEqual({ ...RECORD, ngayTaiKhamDuKien: null });
    expect(
      parseDoctorAppointmentDetail({ ...makeDoctorDetail(), ghiChuKham: null })
        .ghiChuKham,
    ).toBeNull();
  });

  it.each(RECORD_KEYS)(
    'DAD-02 (F2) đối tượng `ghiChuKham` thiếu khoá %s ⇒ phản hồi không dùng được',
    (key) => {
      const ghiChuKham: Record<string, unknown> = { ...RECORD };
      delete ghiChuKham[key];
      expect(() =>
        parseDoctorAppointmentDetail({ ...makeDoctorDetail(), ghiChuKham }),
      ).toThrow(UnexpectedResponseError);
    },
  );

  it.each([
    ['trieuChung là số', { trieuChung: 5 }],
    ['trieuChung là null', { trieuChung: null }],
    ['chanDoanSoBo là mảng', { chanDoanSoBo: ['x'] }],
    ['huongXuLy là đối tượng', { huongXuLy: { a: 1 } }],
    ['ngayTaiKhamDuKien dạng dd/mm/yyyy', { ngayTaiKhamDuKien: '10/07/2026' }],
    ['ngayTaiKhamDuKien thiếu số 0', { ngayTaiKhamDuKien: '2026-7-1' }],
    ['ngayTaiKhamDuKien có giờ', { ngayTaiKhamDuKien: '2026-07-10T00:00:00Z' }],
    ['ngayTaiKhamDuKien là số', { ngayTaiKhamDuKien: 20260710 }],
    ['capNhatLanCuoi chỉ có ngày', { capNhatLanCuoi: '2026-06-10' }],
    ['capNhatLanCuoi dạng dd/mm/yyyy', { capNhatLanCuoi: '10/06/2026 17:30' }],
    ['capNhatLanCuoi là null', { capNhatLanCuoi: null }],
    ['capNhatLanCuoi là số', { capNhatLanCuoi: 1781090000000 }],
  ])('DAD-02 (F2) %s ⇒ phản hồi không dùng được', (_name, wrong) => {
    expect(() =>
      parseDoctorAppointmentDetail({
        ...makeDoctorDetail(),
        ghiChuKham: { ...RECORD, ...wrong },
      }),
    ).toThrow(UnexpectedResponseError);
  });

  it('DAD-02 (F2) `ghiChuKham` không phải null hay đối tượng (mảng, chuỗi, rỗng, số, boolean) ⇒ không dùng được; vắng khoá `ghiChuKham` cũng vậy', () => {
    for (const ghiChuKham of [
      [],
      [RECORD],
      'Triệu chứng: đau ngực',
      '',
      0,
      true,
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

  it('DAD-02 (F2) mỗi khoá của hồ sơ lấy đúng khoá của nó (ba chuỗi khác nhau không bị đảo chỗ)', () => {
    const detail = parseDoctorAppointmentDetail({
      ...makeDoctorDetail(),
      ghiChuKham: {
        ...RECORD,
        trieuChung: 'A-triệu chứng',
        chanDoanSoBo: 'B-chẩn đoán',
        huongXuLy: 'C-hướng xử lý',
      },
    });
    expect(detail.ghiChuKham).toMatchObject({
      trieuChung: 'A-triệu chứng',
      chanDoanSoBo: 'B-chẩn đoán',
      huongXuLy: 'C-hướng xử lý',
    });
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

// doctor-exam F4: dòng DANH SÁCH có thêm `coHoSoKham` (B3, Q24: chín khoá). Mã WHS-18 là [đề xuất] (TRACKING 21.2); XHS-02 phần web: danh sách không bao giờ mang nội dung hồ sơ. `parseDoctorAppointment` (tám khoá lõi) được CHI TIẾT dùng
// lại và chi tiết KHÔNG có cờ: bộ đọc đó không được đọc cờ (thêm cờ vào đó làm hỏng mọi trang chi tiết).
const NINE_KEYS = [...EIGHT_KEYS, 'coHoSoKham'].sort();

// Khoá nội dung hồ sơ mà một máy chủ lỡ gửi kèm ở dòng danh sách (B3 chỉ gửi cờ): phải bị bỏ, kể cả dạng đối tượng
const RECORD_LEAK = {
  trieuChung: 'LEAK-trieu-chung',
  chanDoanSoBo: 'LEAK-chan-doan',
  huongXuLy: 'LEAK-huong-xu-ly',
  ngayTaiKhamDuKien: '2026-07-10',
  capNhatLanCuoi: '2026-06-10T10:30:00.000Z',
  ghiChuKham: { ...RECORD, trieuChung: 'LEAK-ghi-chu-doi-tuong' },
};
const RECORD_LEAK_WORDS = [
  'LEAK',
  '2026-07-10',
  '2026-06-10T10:30',
  'trieuChung',
  'chanDoanSoBo',
  'huongXuLy',
  'ghiChuKham',
  'ngayTaiKhamDuKien',
  'capNhatLanCuoi',
];

describe('doctor-exam F4 — bộ đọc dòng danh sách có `coHoSoKham`', () => {
  it('WHS-18 dòng có ĐÚNG chín khoá (tám khoá lõi cộng `coHoSoKham`); cờ `true` và `false` giữ nguyên; khoá thừa (giá, cọc, email…) bị bỏ', () => {
    for (const coHoSoKham of [true, false]) {
      const row = parseDoctorListRow({
        ...makeDoctorAppointment({ coHoSoKham }),
        ...EXTRA,
      });
      expect(Object.keys(row).sort()).toEqual(NINE_KEYS);
      expect(row.coHoSoKham).toBe(coHoSoKham);
      const text = JSON.stringify(row);
      for (const leaked of ['300000', '100000', 'email', '0988888888']) {
        expect(text).not.toContain(leaked);
      }
    }
  });

  it.each([
    ['chuỗi "true"', 'true'],
    ['chuỗi "false"', 'false'],
    ['số 1', 1],
    ['số 0', 0],
    ['null', null],
    ['mảng rỗng', []],
    ['đối tượng', {}],
    ['chuỗi rỗng', ''],
  ])(
    'WHS-18 `coHoSoKham` là %s (không phải boolean) ⇒ phản hồi không dùng được',
    (_label, wrong) => {
      expect(() =>
        parseDoctorListRow({
          ...makeDoctorAppointment(),
          coHoSoKham: wrong,
        }),
      ).toThrow(UnexpectedResponseError);
    },
  );

  it('WHS-18 thiếu khoá `coHoSoKham` (vắng hay `undefined`) ⇒ phản hồi không dùng được', () => {
    const missing: Record<string, unknown> = { ...makeDoctorAppointment() };
    delete missing.coHoSoKham;
    expect(() => parseDoctorListRow(missing)).toThrow(UnexpectedResponseError);
    expect(() =>
      parseDoctorListRow({ ...makeDoctorAppointment(), coHoSoKham: undefined }),
    ).toThrow(UnexpectedResponseError);
  });

  it.each(EIGHT_KEYS)(
    'WHS-18 thiếu khoá lõi %s ⇒ dòng danh sách không dùng được (như bộ đọc lõi)',
    (key) => {
      const row: Record<string, unknown> = { ...makeDoctorAppointment() };
      delete row[key];
      expect(() => parseDoctorListRow(row)).toThrow(UnexpectedResponseError);
    },
  );

  it('WHS-18 trang: cờ đi đúng từng dòng (đúng thứ tự, không đảo, không lệch); mỗi dòng đủ chín khoá', () => {
    const page = parseDoctorAppointmentPage({
      items: [
        makeDoctorAppointment({ maLichHen: 'CP20260520001', coHoSoKham: true }),
        makeDoctorAppointment({
          maLichHen: 'CP20260520002',
          coHoSoKham: false,
        }),
        makeDoctorAppointment({ maLichHen: 'CP20260520003', coHoSoKham: true }),
      ],
      total: 3,
      page: 1,
      pageSize: 20,
      demTheoTrangThai: COUNTS,
    });
    expect(page.items.map((item) => [item.maLichHen, item.coHoSoKham])).toEqual(
      [
        ['CP20260520001', true],
        ['CP20260520002', false],
        ['CP20260520003', true],
      ],
    );
    for (const item of page.items) {
      expect(Object.keys(item).sort()).toEqual(NINE_KEYS);
    }
  });

  it('WHS-18 MỘT dòng sai cờ trong trang ⇒ CẢ trang không dùng được (không vẽ bảng dở dang)', () => {
    expect(() =>
      parseDoctorAppointmentPage({
        items: [
          makeDoctorAppointment({ maLichHen: 'CP20260520001' }),
          {
            ...makeDoctorAppointment({ maLichHen: 'CP20260520002' }),
            coHoSoKham: 'true',
          },
        ],
        total: 2,
        page: 1,
        pageSize: 20,
        demTheoTrangThai: COUNTS,
      }),
    ).toThrow(UnexpectedResponseError);
  });

  it('XHS-02 (phần web) nội dung hồ sơ lọt vào dòng (`trieuChung`, `chanDoanSoBo`, `huongXuLy`, `ghiChuKham` dạng đối tượng, `ngayTaiKhamDuKien`, `capNhatLanCuoi`) bị BỎ: khoá và chuỗi đều không có ở kết quả', () => {
    const row = parseDoctorListRow({
      ...makeDoctorAppointment({ coHoSoKham: true }),
      ...RECORD_LEAK,
    });
    expect(Object.keys(row).sort()).toEqual(NINE_KEYS);
    const text = JSON.stringify(row);
    for (const word of RECORD_LEAK_WORDS) {
      expect(text, word).not.toContain(word);
    }

    const page = parseDoctorAppointmentPage({
      items: [{ ...makeDoctorAppointment(), ...RECORD_LEAK }],
      total: 1,
      page: 1,
      pageSize: 20,
      demTheoTrangThai: COUNTS,
    });
    const pageText = JSON.stringify(page);
    for (const word of RECORD_LEAK_WORDS) {
      expect(pageText, word).not.toContain(word);
    }
  });

  it('WHS-18 bộ đọc lõi (dùng chung với chi tiết) vẫn ĐÚNG tám khoá và KHÔNG đọc cờ: dòng có cờ thì bỏ cờ, dòng không có cờ vẫn dùng được', () => {
    const withFlag = parseDoctorAppointment({
      ...makeDoctorAppointment({ coHoSoKham: true }),
    });
    expect(Object.keys(withFlag).sort()).toEqual(EIGHT_KEYS);
    expect(withFlag).not.toHaveProperty('coHoSoKham');
    const withoutFlag = parseDoctorAppointment({ ...makeDoctorDetail() });
    expect(Object.keys(withoutFlag).sort()).toEqual(EIGHT_KEYS);
  });

  it('WHS-18 chi tiết KHÔNG có `coHoSoKham` (B3: cờ chỉ của danh sách): vẫn ĐÚNG mười một khoá và không đòi cờ; nếu máy chủ lỡ gửi thì bị bỏ', () => {
    const plain = parseDoctorAppointmentDetail(makeDoctorDetail());
    expect(Object.keys(plain).sort()).toEqual(ELEVEN_KEYS);
    const stray = parseDoctorAppointmentDetail({
      ...makeDoctorDetail(),
      coHoSoKham: true,
    });
    expect(Object.keys(stray).sort()).toEqual(ELEVEN_KEYS);
    expect(stray).not.toHaveProperty('coHoSoKham');
  });

  it('WHS-18 bộ dựng giả đúng hợp đồng B3: dòng giả chín khoá (cờ mặc định `false`), chi tiết giả mười một khoá và BỎ cờ kể cả khi dựng từ một dòng danh sách', () => {
    expect(Object.keys(makeDoctorAppointment()).sort()).toEqual(NINE_KEYS);
    expect(makeDoctorAppointment().coHoSoKham).toBe(false);
    expect(makeDoctorAppointment({ coHoSoKham: true }).coHoSoKham).toBe(true);
    expect(Object.keys(makeDoctorDetail()).sort()).toEqual(ELEVEN_KEYS);
    const fromRow = makeDoctorDetail(
      makeDoctorAppointment({ coHoSoKham: true }),
    );
    expect(Object.keys(fromRow).sort()).toEqual(ELEVEN_KEYS);
  });
});
