import { isDuplicateKeyError } from '../../database/mysql-errors.js';

// Tên KHOÁ của một lỗi 1062 (task B8; PLAN booking 5.11, X1 M2; TRACKING 3.21 B8-D). `database/mysql-errors.ts` cố ý không đọc `message` (thông điệp "Duplicate entry '<giá trị>'" chứa dữ liệu),
// nhưng B8 phải phân biệt hai khoá của `lich_hen` (`ma_lich_hen` ⇒ sinh lại mã; `khung_gio_dang_giu` ⇒ `KHUNG_GIO_DA_DAT`). Hàm này chỉ trích TÊN KHOÁ trong `sqlMessage`
// ("... for key 'lich_hen.ma_lich_hen'", MySQL 8.4 đo ở M2), KHÔNG BAO GIỜ trả hay ghi giá trị trùng. Đặt ở `create/` vì chỉ B8 cần (không đụng thư mục dùng chung `database/`).

// Neo ở CUỐI thông điệp: tên khoá luôn đứng sau cùng, nên giá trị trùng có chứa chữ "for key '…'" cũng không đánh lừa được hàm.
const KEY_NAME = /for key ['`](?:[A-Za-z0-9_]+\.)?([A-Za-z0-9_]+)['`]\s*$/;

/** Tên khoá (không kèm tên bảng) của lỗi 1062, hoặc `null` nếu không phải 1062 hay không đọc được tên khoá. */
export function duplicateKeyOf(error: unknown): string | null {
  if (!isDuplicateKeyError(error)) return null;
  if (typeof error !== 'object' || error === null) return null;
  const wrapped: unknown = Reflect.get(error, 'driverError');
  const source: object =
    typeof wrapped === 'object' && wrapped !== null ? wrapped : error;
  const message: unknown = Reflect.get(source, 'sqlMessage');
  if (typeof message !== 'string') return null;
  return KEY_NAME.exec(message)?.[1] ?? null;
}
