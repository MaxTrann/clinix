import { ROLE_HOME_PATHS } from '../../auth';

// Đường dẫn của khu Bác sĩ (doctor F1). Route con khai bằng phần tương đối (`*_SEGMENT`), liên kết dùng đường dẫn đầy đủ.
export const DOCTOR_SCHEDULE_SEGMENT = 'lich-lam-viec';
export const DOCTOR_LEAVE_SEGMENT = 'lich-lam-viec/nghi-phep';

export const DOCTOR_PATHS = {
  root: ROLE_HOME_PATHS.BacSi,
  schedule: `${ROLE_HOME_PATHS.BacSi}/${DOCTOR_SCHEDULE_SEGMENT}`,
  leave: `${ROLE_HOME_PATHS.BacSi}/${DOCTOR_LEAVE_SEGMENT}`,
} as const;
