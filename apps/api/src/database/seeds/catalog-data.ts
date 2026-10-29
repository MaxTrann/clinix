// Bộ tạm được duyệt cho C5, chưa đối chiếu Figma. Giá/giờ hoàn toàn là dữ liệu minh họa.
export const SPECIALTY_NAMES = [
  'Cơ Xương Khớp',
  'Thần kinh',
  'Tiêu hóa',
  'Nội tổng quát',
  'Y học gia đình',
  'Tâm thần',
  'Tim mạch',
  'Tai Mũi Họng',
] as const;

export const CATALOG_SERVICES = [
  {
    group: 'Khám chuyên khoa',
    name: 'Khám chuyên khoa mẫu',
    duration: 30,
    price: '200000.00',
  },
  {
    group: 'Khám tổng quát',
    name: 'Khám tổng quát mẫu',
    duration: 60,
    price: '500000.00',
  },
  {
    group: 'Khám từ xa',
    name: 'Tư vấn từ xa mẫu',
    duration: 30,
    price: '150000.00',
  },
] as const;

export const CATALOG_BRANCHES = Array.from({ length: 4 }, (_, index) => ({
  ten: `CLINIX Mẫu ${index + 1}`,
  diaChi: `Địa chỉ minh họa ${index + 1}`,
}));

export const CLINIC_DEMO = {
  id: 1,
  tenThuongHieu: 'CLINIX (minh họa)',
  diaChiTruSo: 'Địa chỉ trụ sở minh họa',
  email: 'clinic@example.invalid',
  duongDayNong: null,
};

export const CONFIG_DEMO = {
  id: 1,
  thoiGianGiuCho: 15,
  thoiDiemNhacLich: [72, 24, 2],
  soLichHenToiDaMoiHoSo: 3,
  soLanTuDoiLichToiDa: 2,
  checkInTruocPhut: 30,
  checkInSauPhut: 15,
  thoiHanPhanHoiLoiMoi: 60,
  soMucChoToiDa: 2,
  nguongNoShow: 3,
  soNgayBaoTruocDoiGioLam: 3,
  trongSoW1: '0.60',
  trongSoW2: '0.40',
};
