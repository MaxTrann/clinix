import { ROLE_HOME_PATHS } from '../auth';

// Đường dẫn của khu Bệnh nhân (Q21g). Route con khai bằng phần tương đối (`*_SEGMENT`), liên kết dùng đường dẫn đầy đủ.
export const PATIENT_PROFILE_SEGMENT = 'ho-so-nguoi-kham';

export const PATIENT_PATHS = {
  root: ROLE_HOME_PATHS.BenhNhan,
  profile: `${ROLE_HOME_PATHS.BenhNhan}/${PATIENT_PROFILE_SEGMENT}`,
} as const;
