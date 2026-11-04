// Mục điều hướng là dữ liệu do lớp router giữ (router/public-nav.ts, PLAN search 5.7): module có trang mới chỉ đặt `to` ở đó.
export interface PublicNavItem {
  label: string;
  // Không có `to` = trang chưa làm: hiện nút vô hiệu "Chưa được triển khai" (KC-01)
  to?: string;
  // Chỉ sáng khi đúng đường dẫn này, không sáng ở trang con
  end?: boolean;
  // Mục mở menu thả xuống (Dịch vụ khám) thay vì là liên kết thường
  hasMenu?: boolean;
}

export interface PublicNavConfig {
  navItems: PublicNavItem[];
  // Nút cam "Đặt lịch khám"
  bookingItem: PublicNavItem;
  footerLinks: PublicNavItem[];
  legalLinks: PublicNavItem[];
}

export const NOT_IMPLEMENTED_TITLE = 'Chưa được triển khai';
