// Vai trò và đường dẫn (theo routes.tsx của mã Figma Make của nhóm). `/bac-si` là danh sách bác sĩ công khai, nên khu Bác sĩ là `/bac-si-portal`.
export type VaiTro = 'BenhNhan' | 'BacSi' | 'LeTan' | 'QuanTriVien';

export const LOGIN_PATH = '/dang-nhap';

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
