import {
  toExaminee,
  toItem,
  toMonthCounts,
  type ExamRecordRow,
} from './patient-exam-records.mapper.js';

// doctor-exam B4 — mapper THUẦN của danh sách hồ sơ khám (PLAN 5.6; XHS-02, XHS-10). Không DB. Dữ liệu giả.
const ROW: ExamRecordRow = {
  maLichHen: 'CLX-20261110-7K3QD',
  thoiGian: new Date('2026-11-30T23:30:00+07:00'),
  chuyenKhoa: 'Nội tổng quát',
  bacSiHoTen: 'Bác sĩ Mẫu',
  chucDanh: 'BS_CKI',
  nguoiKhamHoTen: 'Người thân mẫu',
  quanHe: 'Con',
  coHoSoKham: 1,
  daDanhGia: 0,
};

describe('XHS-02 toItem: danh sách trắng bảy khoá', () => {
  it('ĐÚNG bảy khoá; bacSi hai khoá; nguoiKham hai khoá; không khoá nội bộ hay nội dung hồ sơ', () => {
    const item = toItem({
      ...ROW,
      lichHenId: '9',
      trieuChung: 'bí mật',
      biAn: 1,
    } as ExamRecordRow);
    expect(Object.keys(item).toSorted()).toEqual(
      [
        'bacSi',
        'chuyenKhoa',
        'coHoSoKham',
        'daDanhGia',
        'maLichHen',
        'nguoiKham',
        'thoiGian',
      ].toSorted(),
    );
    expect(Object.keys(item.bacSi).toSorted()).toEqual(['chucDanh', 'hoTen']);
    expect(Object.keys(item.nguoiKham).toSorted()).toEqual(['hoTen', 'quanHe']);
    expect(JSON.stringify(item)).not.toMatch(
      /lichHenId|trieuChung|biAn|bí mật/,
    );
  });

  it('giá trị: ENUM giữ nguyên (chức danh, quan hệ); thoiGian là ISO 8601 UTC (23:30 ngày 30/11 giờ VN = 16:30Z cùng ngày)', () => {
    expect(toItem(ROW)).toEqual({
      maLichHen: 'CLX-20261110-7K3QD',
      thoiGian: '2026-11-30T16:30:00.000Z',
      chuyenKhoa: 'Nội tổng quát',
      bacSi: { hoTen: 'Bác sĩ Mẫu', chucDanh: 'BS_CKI' },
      nguoiKham: { hoTen: 'Người thân mẫu', quanHe: 'Con' },
      coHoSoKham: true,
      daDanhGia: false,
    });
  });

  it('người khám là bản thân: quanHe là null (không "BanThan", không chuỗi rỗng)', () => {
    expect(toItem({ ...ROW, quanHe: null }).nguoiKham.quanHe).toBeNull();
  });

  it.each([
    [1, true],
    [0, false],
    ['1', true],
    ['0', false],
  ])('cờ logic của driver %j ⇒ boolean %s (cả hai cờ)', (raw, expected) => {
    const item = toItem({ ...ROW, coHoSoKham: raw, daDanhGia: raw });
    expect(item.coHoSoKham).toBe(expected);
    expect(item.daDanhGia).toBe(expected);
  });
});

describe('XHS-04 toExaminee, toMonthCounts', () => {
  it('toExaminee: id BIGINT dạng chuỗi giữ nguyên chuỗi, null (bản thân) giữ null; chỉ ba khoá', () => {
    expect(
      toExaminee({ id: '9007199254740993', hoTen: 'A', quanHe: 'Cha' }),
    ).toEqual({ id: '9007199254740993', hoTen: 'A', quanHe: 'Cha' });
    expect(toExaminee({ id: null, hoTen: 'Tôi', quanHe: null })).toEqual({
      id: null,
      hoTen: 'Tôi',
      quanHe: null,
    });
  });

  it('toMonthCounts: đủ 12 khoá "1" đến "12"; chuỗi của driver ra số; cột thiếu hay null là 0; không có hàng cũng đủ 12 khoá', () => {
    const counts = toMonthCounts({ m1: '3', m2: 5, m3: null, m12: '2' });
    expect(Object.keys(counts)).toEqual(
      Array.from({ length: 12 }, (_, index) => String(index + 1)),
    );
    expect(counts).toEqual({
      '1': 3,
      '2': 5,
      '3': 0,
      '4': 0,
      '5': 0,
      '6': 0,
      '7': 0,
      '8': 0,
      '9': 0,
      '10': 0,
      '11': 0,
      '12': 2,
    });
    expect(Object.values(toMonthCounts(undefined))).toEqual(Array(12).fill(0));
  });
});
