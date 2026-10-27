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

// --- Token và phiên đăng nhập (task A3, quyết định Q2). Cố định theo quyết định nên là hằng số, không phải biến môi trường.
export const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000; // access JWT sống 15 phút
export const SESSION_IDLE_MS = 30 * 60 * 1000; // phiên không hoạt động quá 30 phút thì hết hạn (trượt theo mỗi lần làm mới)
export const SESSION_MAX_MS = 8 * 60 * 60 * 1000; // trần tuyệt đối 8 giờ kể từ lúc đăng nhập (tao_luc), không gia hạn được

export const ACCESS_TOKEN_ALGORITHM = 'HS256'; // cố định; verify chỉ nhận đúng thuật toán này (chặn alg: none / đổi alg)
export const ACCESS_TOKEN_ISSUER = 'clinix-api';
export const ACCESS_TOKEN_AUDIENCE = 'clinix-web';

export const REFRESH_TOKEN_RANDOM_BYTES = 32; // 256 bit ngẫu nhiên
export const REFRESH_COOKIE_NAME = 'refresh_token';
// Đường dẫn NHÌN TỪ TRÌNH DUYỆT (proxy gỡ tiền tố /api trước khi tới API), nên cookie chỉ được gửi tới /api/auth/*
export const REFRESH_COOKIE_PATH = '/api/auth';
