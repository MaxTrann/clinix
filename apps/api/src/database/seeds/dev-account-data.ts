// Tài khoản demo được duyệt; không chứa mật khẩu và không dùng để gửi email/liên lạc.
export const DEV_ACCOUNTS = [
  {
    email: 'admin.system@example.invalid',
    name: 'Quản trị hệ thống mẫu',
    phone: '0900000001',
    role: 'QuanTriVien',
    scope: 'ToanHeThong',
  },
  {
    email: 'admin.branch@example.invalid',
    name: 'Quản trị chi nhánh mẫu',
    phone: '0900000002',
    role: 'QuanTriVien',
    scope: 'ChiNhanh',
  },
  {
    email: 'doctor@example.invalid',
    name: 'Bác sĩ mẫu',
    phone: '0900000003',
    role: 'BacSi',
  },
  {
    email: 'receptionist@example.invalid',
    name: 'Lễ tân mẫu',
    phone: '0900000004',
    role: 'LeTan',
  },
  {
    email: 'patient@example.invalid',
    name: 'Bệnh nhân mẫu',
    phone: '0900000005',
    role: 'BenhNhan',
  },
] as const;
export type DevAccount = (typeof DEV_ACCOUNTS)[number];
