// Chính sách mật khẩu (Q11, N9, N10 trong docs/features/auth/TRACKING.md). File này KHÔNG import gì để frontend
// sao chép nguyên văn; hợp đồng chung FE/BE là password-policy.vectors.json (test SE-08 chạy cùng bộ vector).

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;

// 32 dấu câu/ký hiệu ASCII được tính là "ký tự đặc biệt". Dấu cách KHÔNG nằm trong danh sách này.
export const PASSWORD_SPECIAL_CHARACTERS = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';

export const PASSWORD_ISSUES = {
  // Sai độ dài, thiếu chữ số hoặc thiếu ký tự đặc biệt
  INVALID: 'MAT_KHAU_KHONG_HOP_LE',
  // Có ký tự ngoài ASCII in được (chữ có dấu, emoji, U+00A0, ký tự điều khiển…)
  INVALID_CHARACTERS: 'MAT_KHAU_KY_TU_KHONG_HOP_LE',
} as const;

export type PasswordIssue =
  (typeof PASSWORD_ISSUES)[keyof typeof PASSWORD_ISSUES];

const PRINTABLE_ASCII_FIRST = 0x20; // dấu cách
const PRINTABLE_ASCII_LAST = 0x7e; // ~

// Trả mã lỗi đầu tiên gặp, hoặc null nếu mật khẩu hợp lệ. Mỗi mật khẩu chỉ trả MỘT mã, theo thứ tự:
// ký tự không hợp lệ trước (khi đó đếm độ dài không còn ý nghĩa), rồi mới tới độ dài/chữ số/ký tự đặc biệt.
// Không trim, không chuẩn hoá Unicode: dấu cách đầu/cuối được giữ nguyên và tính vào độ dài.
export function checkPassword(password: string): PasswordIssue | null {
  for (let i = 0; i < password.length; i++) {
    const code = password.charCodeAt(i);
    if (code < PRINTABLE_ASCII_FIRST || code > PRINTABLE_ASCII_LAST) {
      return PASSWORD_ISSUES.INVALID_CHARACTERS;
    }
  }

  // Tới đây mọi ký tự là ASCII nên số ký tự = số byte
  if (
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    return PASSWORD_ISSUES.INVALID;
  }
  if (!/[0-9]/.test(password)) {
    return PASSWORD_ISSUES.INVALID;
  }
  // split('') an toàn ở đây vì mọi ký tự đã được kiểm là ASCII một đơn vị mã
  if (
    !password
      .split('')
      .some((char) => PASSWORD_SPECIAL_CHARACTERS.includes(char))
  ) {
    return PASSWORD_ISSUES.INVALID;
  }
  return null;
}
