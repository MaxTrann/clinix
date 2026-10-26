import { BenhNhan } from '../auth/entities/benh-nhan.entity.js';
import { MaXacThuc } from '../auth/entities/ma-xac-thuc.entity.js';
import { PhienDangNhap } from '../auth/entities/phien-dang-nhap.entity.js';
import { TaiKhoan } from '../auth/entities/tai-khoan.entity.js';
import { ViNoiBo } from '../auth/entities/vi-noi-bo.entity.js';

// Sổ đăng ký entity (một nơi duy nhất cho app, script migration và test). Module mới (admin…) thêm entity của
// mình vào đây; bài test registry.spec.ts báo lỗi nếu có file *.entity.ts chưa được đăng ký.
export const ENTITIES = [TaiKhoan, BenhNhan, ViNoiBo, MaXacThuc, PhienDangNhap];
