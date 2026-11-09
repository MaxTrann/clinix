import { ROLE_HOME_PATHS } from '../auth';

// Đường dẫn của khu Bệnh nhân và khu Lễ tân (Q21g). Route con khai bằng phần tương đối (`*_SEGMENT`), liên kết dùng đường dẫn đầy đủ.
export const PATIENT_PROFILE_SEGMENT = 'ho-so-nguoi-kham';

export const PATIENT_PATHS = {
  root: ROLE_HOME_PATHS.BenhNhan,
  profile: `${ROLE_HOME_PATHS.BenhNhan}/${PATIENT_PROFILE_SEGMENT}`,
} as const;

// patient F2 (tra cứu bệnh nhân), patient F4 (thông tin cá nhân)
export const RECEPTION_LOOKUP_SEGMENT = 'tra-cuu-benh-nhan';
export const RECEPTION_PROFILE_SEGMENT = 'thong-tin-ca-nhan';

export const RECEPTION_PATHS = {
  root: ROLE_HOME_PATHS.LeTan,
  lookup: `${ROLE_HOME_PATHS.LeTan}/${RECEPTION_LOOKUP_SEGMENT}`,
  profile: `${ROLE_HOME_PATHS.LeTan}/${RECEPTION_PROFILE_SEGMENT}`,
} as const;

// patient F5 (thông tin cá nhân của Quản trị viên). Cùng đoạn với Lễ tân nhưng khác khu `/admin`. Mục menu ở `features/admin` ghi
// đường dẫn này bằng chữ (không import chéo `features/`); ca `AQ-` giữ hai nơi khớp nhau.
export const ADMIN_PROFILE_SEGMENT = 'thong-tin-ca-nhan';

export const ADMIN_PATHS = {
  root: ROLE_HOME_PATHS.QuanTriVien,
  profile: `${ROLE_HOME_PATHS.QuanTriVien}/${ADMIN_PROFILE_SEGMENT}`,
} as const;
