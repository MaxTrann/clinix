import { TaoBangAuth1793001600000 } from './1793001600000-tao-bang-auth.js';

// Sổ đăng ký migration, theo thứ tự thời gian. Thêm migration mới vào CUỐI mảng với timestamp lớn hơn;
// bài test registry.spec.ts báo lỗi nếu có file migration chưa được đăng ký hoặc sai thứ tự.
export const MIGRATIONS = [TaoBangAuth1793001600000];
