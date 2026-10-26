import argon2 from 'argon2';

// Tham số băm mật khẩu (quyết định S6): Argon2id, bộ nhớ 19 MiB (= 19456 KiB), 2 lượt, 1 luồng.
// Test SE-01 kiểm đúng các giá trị này trong chuỗi băm lưu ở DB. Muốn đổi phải đổi quyết định S6 trước, không sửa lặng lẽ ở đây.
// Các hằng của task sau (10 phút OTP, 5 lần sai, 60 giây gửi lại…) được thêm vào file này khi task đó cần.
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;
