import { TaoBangAnh1793188800000 } from './1793188800000-tao-bang-anh.js';
import { TaoBangAuth1793001600000 } from './1793001600000-tao-bang-auth.js';
import { TaoBangDanhMuc1793024340000 } from './1793024340000-tao-bang-danh-muc.js';
import { TaoBangNhanSu1793080000000 } from './1793080000000-tao-bang-nhan-su.js';
import { TaoBangVanHanh1793090000000 } from './1793090000000-tao-bang-van-hanh.js';

// Sổ đăng ký migration, theo thứ tự thời gian. Thêm migration mới vào CUỐI mảng với timestamp lớn hơn;
// bài test registry.spec.ts báo lỗi nếu có file migration chưa được đăng ký hoặc sai thứ tự.
export const MIGRATIONS = [
  TaoBangAuth1793001600000,
  TaoBangDanhMuc1793024340000,
  TaoBangNhanSu1793080000000,
  TaoBangVanHanh1793090000000,
  TaoBangAnh1793188800000,
];
