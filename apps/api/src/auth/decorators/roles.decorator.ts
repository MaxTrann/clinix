import { SetMetadata, type CustomDecorator } from '@nestjs/common';
import type { LoaiTaiKhoan } from '../entities/enums.js';

export const ROLES_KEY = 'auth:roles';

// Chỉ cho các vai trò liệt kê gọi route; vai trò khác nhận 403. Không có @Roles thì chỉ cần đăng nhập.
// Đặt ở class hoặc method; @Roles ở method THAY THẾ (không gộp với) @Roles ở class.
// Kiểu tuple không rỗng nên @Roles() không đối số là lỗi biên dịch (tránh vô tình để route không giới hạn gì).
// Chỉ kiểm vai trò; phạm vi Toàn hệ thống / Chi nhánh của quản trị viên thuộc module admin.
export const Roles = (
  ...roles: [LoaiTaiKhoan, ...LoaiTaiKhoan[]]
): CustomDecorator<string> => SetMetadata(ROLES_KEY, roles);
