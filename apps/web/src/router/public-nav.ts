import { BOOKING_PATH, type PublicNavConfig } from '../features/search';

// Menu của khung công khai (PLAN search 5.7, Q19c), thứ tự theo Figma `257:6` và `257:1008`.
// Mục không có `to` là nút vô hiệu "Chưa được triển khai": module có trang mới chỉ thêm `to` ở đây, không sửa features/search/.
export const PUBLIC_NAV: PublicNavConfig = {
  navItems: [
    { label: 'Trang chủ', to: '/', end: true },
    { label: 'Dịch vụ khám', to: BOOKING_PATH, hasMenu: true },
    { label: 'Chuyên khoa', to: '/chuyen-khoa' },
    { label: 'Bác sĩ' },
    { label: 'Cẩm nang' },
    { label: 'Liên hệ' },
  ],
  // Q19d: mở luồng chọn nhóm dịch vụ (TCBS b1) khi có trang
  bookingItem: { label: 'Đặt lịch khám', to: BOOKING_PATH },
  allBranchesTo: '/chi-nhanh',
  footerLinks: [
    { label: 'Trang chủ', to: '/', end: true },
    { label: 'Chuyên khoa', to: '/chuyen-khoa' },
    { label: 'Chi nhánh', to: '/chi-nhanh' },
    { label: 'Đội ngũ bác sĩ' },
    { label: 'Cẩm nang sức khỏe' },
    { label: 'Về chúng tôi' },
    { label: 'Câu hỏi thường gặp' },
  ],
  legalLinks: [
    { label: 'Chính sách bảo mật' },
    { label: 'Điều khoản sử dụng' },
  ],
};
