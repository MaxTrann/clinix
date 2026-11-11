import { ROLE_HOME_PATHS } from '../../auth';

// Đường dẫn trang "Lịch làm việc bác sĩ" của Lễ tân (doctor F5): `/le-tan/lich-lam-viec-bac-si`. Nằm ở module doctor, không sửa `features/patient/`.
export const RECEPTION_SCHEDULE_SEGMENT = 'lich-lam-viec-bac-si';
export const RECEPTION_SCHEDULE_PATH = `${ROLE_HOME_PATHS.LeTan}/${RECEPTION_SCHEDULE_SEGMENT}`;
