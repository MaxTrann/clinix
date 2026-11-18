// Bộ quét dùng trong test: một phản hồi của API tài khoản KHÔNG BAO GIỜ được chứa băm, mã, token hay phiên (SE-A12).
// Quét hai hướng: (1) TÊN khoá, (2) GIÁ TRỊ (chuỗi mồi mà fixture đã đặt vào DB, và vài dạng giá trị bí mật điển hình).

// Tên khoá gợi ý bí mật. `bam` ở cuối bắt `matKhauBam`, `maBam`, `refreshTokenBam`.
const FORBIDDEN_KEY =
  /mat_?khau|password|secret|token|otp|hash|salt|refresh|ma_?bam|bam$/i;

// Giá trị điển hình: băm Argon2, băm SHA-256 dạng hex (nguyên cả giá trị), token base64url 43 ký tự (nguyên cả giá trị).
const SECRET_LIKE_VALUES: readonly { name: string; test: RegExp }[] = [
  { name: 'băm Argon2', test: /\$argon2/i },
  { name: 'băm SHA-256 hex', test: /^[0-9a-f]{64}$/i },
  { name: 'token base64url 43 ký tự', test: /^[A-Za-z0-9_-]{43}$/ },
];

/** Trả về danh sách vi phạm (rỗng = sạch); mỗi phần tử nêu đường dẫn tới chỗ vi phạm, KHÔNG in lại giá trị. */
export function findSecretLeaks(
  value: unknown,
  sentinels: readonly string[] = [],
): string[] {
  const leaks: string[] = [];
  const visit = (node: unknown, path: string): void => {
    if (typeof node === 'string') {
      for (const rule of SECRET_LIKE_VALUES)
        if (rule.test.test(node))
          leaks.push(`${path}: giá trị giống ${rule.name}`);
      sentinels.forEach((sentinel, index) => {
        if (sentinel !== '' && node.includes(sentinel))
          leaks.push(`${path}: chứa chuỗi mồi số ${String(index)}`);
      });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${path}[${String(index)}]`));
      return;
    }
    if (node !== null && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) {
        if (FORBIDDEN_KEY.test(key)) leaks.push(`${path}.${key}: tên khoá cấm`);
        visit(child, `${path}.${key}`);
      }
    }
  };
  visit(value, '$');
  return leaks;
}

/** Ném lỗi nếu có vi phạm. */
export function assertNoSecretLeak(
  value: unknown,
  sentinels: readonly string[] = [],
): void {
  const leaks = findSecretLeaks(value, sentinels);
  if (leaks.length > 0)
    throw new Error(`Phản hồi lộ dữ liệu cấm:\n${leaks.join('\n')}`);
}
