import {
  collectKeys,
  DOCTOR_FORBIDDEN_KEY,
  HEALTH_RECORD_KEY,
} from './response-keys.js';

// Task B3 — `HEALTH_RECORD_KEY` (doctor-exam; PLAN H10, QHK-08; TRACKING 17): khoá của hồ sơ khám mà Lễ tân, Quản trị viên và Bệnh nhân KHÔNG được thấy ở bất kỳ API booking nào. Bác sĩ phụ trách thì
// được thấy (ngược lại với regex này): `DOCTOR_FORBIDDEN_KEY` giữ nguyên và KHÔNG khớp các khoá đó.
describe('QHK-08 HEALTH_RECORD_KEY: mỗi khoá của hồ sơ khám đều bị bắt', () => {
  it.each([
    'trieuChung',
    'chanDoanSoBo',
    'huongXuLy',
    'ghiChuKham',
    'ngayTaiKhamDuKien',
    'capNhatLanCuoi',
    'coHoSoKham',
    'trieu_chung',
    'chan_doan_so_bo',
    'huong_xu_ly',
    'ghi_chu_kham',
    'ngay_tai_kham_du_kien',
    'cap_nhat_lan_cuoi',
    'co_ho_so_kham',
  ])('QHK-08 khoá "%s" KHỚP', (key) => {
    expect(key).toMatch(HEALTH_RECORD_KEY);
  });

  it.each([
    'maLichHen',
    'thoiGian',
    'trangThai',
    'lyDoKham',
    'nguoiKham',
    'hoTen',
    'dichVu',
    'chuyenKhoa',
    'chiNhanh',
    'ngayDat',
    'bacSi',
    'hoSoNguoiThan',
    'demTheoTrangThai',
    'ghiChu',
    'soDienThoai',
  ])('QHK-08 khoá thường "%s" KHÔNG bị bắt nhầm', (key) => {
    expect(key).not.toMatch(HEALTH_RECORD_KEY);
  });

  it('QHK-08 quét một thân phản hồi: tìm được khoá hồ sơ ở độ sâu bất kỳ (kể cả trong mảng)', () => {
    const body = {
      items: [{ maLichHen: 'A', nguoiKham: { hoTen: 'B' } }],
      chiTiet: [{ ghiChuKham: { trieuChung: 'x' } }],
    };
    expect(
      collectKeys(body).filter((key) => HEALTH_RECORD_KEY.test(key)),
    ).toStrictEqual(['ghiChuKham', 'trieuChung']);
    expect(
      collectKeys({ items: [{ maLichHen: 'A' }] }).filter((key) =>
        HEALTH_RECORD_KEY.test(key),
      ),
    ).toStrictEqual([]);
  });

  it('QHK-08 các khoá của hồ sơ KHÔNG nằm trong `DOCTOR_FORBIDDEN_KEY` (Bác sĩ phụ trách được thấy): hai regex bổ sung nhau, không chồng', () => {
    for (const key of [
      'trieuChung',
      'chanDoanSoBo',
      'huongXuLy',
      'ghiChuKham',
      'ngayTaiKhamDuKien',
      'capNhatLanCuoi',
      'coHoSoKham',
    ])
      expect(key, key).not.toMatch(DOCTOR_FORBIDDEN_KEY);
  });
});
