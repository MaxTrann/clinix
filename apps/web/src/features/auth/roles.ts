// Vai trò và đường dẫn (theo routes.tsx của mã Figma Make của nhóm). `/bac-si` là danh sách bác sĩ công khai, nên khu Bác sĩ là `/bac-si-portal`.
export type VaiTro = 'BenhNhan' | 'BacSi' | 'LeTan' | 'QuanTriVien';

export const LOGIN_PATH = '/dang-nhap';
// FORGOT_PASSWORD_PATH do F4 thêm; tới lúc đó liên kết của màn đăng nhập ra 404. VERIFY_EMAIL_PATH là [đề xuất], Make không có route riêng.
export const REGISTER_PATH = '/dang-ky';
export const FORGOT_PASSWORD_PATH = '/quen-mat-khau';
export const VERIFY_EMAIL_PATH = '/dang-ky/xac-minh';

export const ROLE_HOME_PATHS: Record<VaiTro, string> = {
  BenhNhan: '/benh-nhan',
  BacSi: '/bac-si-portal',
  LeTan: '/le-tan',
  QuanTriVien: '/admin',
};

export const ROLE_LABELS: Record<VaiTro, string> = {
  BenhNhan: 'Bệnh nhân',
  BacSi: 'Bác sĩ',
  LeTan: 'Lễ tân',
  QuanTriVien: 'Quản trị viên',
};

export function homePathFor(vaiTro: VaiTro): string {
  return ROLE_HOME_PATHS[vaiTro];
}
