import { ROLE_HOME_PATHS } from '../auth';

// Đường dẫn của khu Bệnh nhân và khu Lễ tân (Q21g). Route con khai bằng phần tương đối (`*_SEGMENT`), liên kết dùng đường dẫn đầy đủ.
export const PATIENT_PROFILE_SEGMENT = 'ho-so-nguoi-kham';

export const PATIENT_PATHS = {
  root: ROLE_HOME_PATHS.BenhNhan,
  profile: `${ROLE_HOME_PATHS.BenhNhan}/${PATIENT_PROFILE_SEGMENT}`,
} as const;

// patient F2. "Thông tin cá nhân" (`thong-tin-ca-nhan`) do F4 thêm cùng route, chưa khai ở đây để không có hằng chưa dùng
export const RECEPTION_LOOKUP_SEGMENT = 'tra-cuu-benh-nhan';

export const RECEPTION_PATHS = {
  root: ROLE_HOME_PATHS.LeTan,
  lookup: `${ROLE_HOME_PATHS.LeTan}/${RECEPTION_LOOKUP_SEGMENT}`,
} as const;
