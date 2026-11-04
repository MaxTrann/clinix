// Mối quan hệ của hồ sơ người thân (patient P1, quyết định Q15; TRACKING patient P1-C): đúng 8 giá trị ENUM của cột
// `ho_so_nguoi_than.moi_quan_he`, lấy từ enum của entity (admin) chứ không viết lại. Nhãn tiếng Việt nằm ở web (F6), API không dùng nhãn.
import {
  MOI_QUAN_HE_NGUOI_THAN,
  type MoiQuanHeNguoiThan,
} from '../../admin/entities/enums.js';

export function isRelationship(value: unknown): value is MoiQuanHeNguoiThan {
  return (
    typeof value === 'string' &&
    (MOI_QUAN_HE_NGUOI_THAN as readonly string[]).includes(value)
  );
}
