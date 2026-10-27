// Che mật khẩu, token, OTP, mã băm trước khi ghi log (SOW 3.2.2; PLAN auth mục 5.4, SE-04, DM-09).
// Đây là lớp phòng thủ THỨ HAI: quy tắc thứ nhất vẫn là không đưa bí mật vào log. Bộ che dựa trên tên khoá và hình dạng chuỗi,
// nên KHÔNG bắt được một dãy 6 chữ số trần trong văn bản tự do (xem docs/TECH_DEBT.md).
// Cố ý giữ lại thông tin chẩn đoán: tên khoá, nhãn [REDACTED], lớp lỗi, code/errno/sqlState, đường dẫn trong stack.
export const REDACTED = '[REDACTED]';

const MAX_DEPTH = 8;
// Tên khoá dài, ít nhập nhằng: khớp nếu chuỗi con xuất hiện sau khi bỏ dấu phân cách và hạ chữ thường (matKhauMoi → matkhaumoi)
const SENSITIVE_KEY_PARTS = [
  'password',
  'matkhau',
  'xacnhan', // xacNhan = mật khẩu nhập lại
  'token', // accessToken, refreshToken, resetToken, refresh_token_bam…
  'authorization',
  'cookie',
  'secret',
  'apikey',
  'credential',
  'parameters', // tham số câu lệnh SQL của TypeORM
];
// Từ ngắn, dễ trùng ngẫu nhiên (footprint chứa "otp"): chỉ khớp khi là MỘT TỪ RIÊNG sau khi tách camelCase/snake_case
const SENSITIVE_KEY_WORDS = new Set([
  'otp',
  'bam', // "băm": mat_khau_bam, ma_bam, refresh_token_bam
  'hash',
  'pass',
  'passwd',
  'pwd',
  'sql', // câu lệnh mysql2 có giá trị đã chèn sẵn (err.sql)
  'query',
]);

export function isSensitiveKey(key: string): boolean {
  const squashed = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (SENSITIVE_KEY_PARTS.some((part) => squashed.includes(part))) return true;
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/);
  return words.some((word) => SENSITIVE_KEY_WORDS.has(word));
}

// Tên khoá trong văn bản (khoá=giá trị, "khoá":"giá trị"). Khoá có chứa từ nhạy cảm, hoặc đúng otp / hậu tố _bam, Bam, hash.
// Phần trước/sau từ khoá bị giới hạn 64 ký tự để chuỗi dài không có dấu phân cách không làm regex chạy chậm theo bình phương.
const TEXT_KEY =
  '[\\w.-]{0,64}(?:password|matkhau|xacnhan|token|secret|apikey|authorization|cookie|credential)[\\w.-]{0,64}|otp|[\\w.-]{0,64}(?:_bam|Bam|[Hh]ash)';
const KEY_VALUE_PATTERN = new RegExp(
  `(${TEXT_KEY})(["']?\\s*[:=]\\s*)("[^"]*"|'[^']*'|[^\\s,;&)}\\]]+)`,
  'gi',
);

const TEXT_PATTERNS: readonly [RegExp, string][] = [
  // Authorization: Bearer <token>
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`],
  // JWT (access token, resetToken)
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, REDACTED],
  // Refresh token: <sid>.<43 ký tự>.<43 ký tự>
  [/\b[1-9]\d{0,18}\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}\b/g, REDACTED],
  // Băm Argon2
  [/\$argon2[a-z]*\$[^\s'"`,;)}\]]+/g, REDACTED],
  // SHA-256 / HMAC-SHA-256 dạng hex
  [/\b[0-9a-fA-F]{64}\b/g, REDACTED],
  // Thông điệp lỗi MySQL nêu giá trị trùng (có thể là email, mã băm…): giữ tên khoá ràng buộc để còn chẩn đoán được
  [/(Duplicate entry )'[^']*'( for key)/g, `$1'${REDACTED}'$2`],
];

// Giá trị bí mật của chính cấu hình (khoá JWT, mật khẩu DB…) nếu lỡ lọt vào log nguyên văn thì cũng bị che.
// Chỉ lấy giá trị đủ dài để không che nhầm những từ ngắn thông dụng.
const MIN_SECRET_LENGTH = 8;
const SECRET_ENV_NAME =
  /(SECRET|PASSWORD|PASSWD|TOKEN|API_?KEY|(^|_)PASS$|(^|_)KEY$)/i;

export function collectSecretValues(
  env: Readonly<Record<string, string | undefined>>,
): string[] {
  const values = new Set<string>();
  for (const [name, value] of Object.entries(env)) {
    if (
      value !== undefined &&
      value.length >= MIN_SECRET_LENGTH &&
      SECRET_ENV_NAME.test(name)
    ) {
      values.add(value);
    }
  }
  return [...values];
}

export function redactText(
  text: string,
  secrets: readonly string[] = [],
): string {
  let result = text;
  // Dài trước ngắn sau, để một bí mật chứa bí mật khác vẫn được che trọn
  for (const secret of [...secrets].sort((a, b) => b.length - a.length)) {
    result = result.split(secret).join(REDACTED);
  }
  for (const [pattern, replacement] of TEXT_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result.replace(
    KEY_VALUE_PATTERN,
    (_match, key: string, separator: string) => `${key}${separator}${REDACTED}`,
  );
}

// Thuộc tính của Error được giữ lại để chẩn đoán. KHÔNG giữ `sql`, `query`, `parameters`: mysql2 chèn sẵn giá trị vào `sql`.
const KEPT_ERROR_PROPERTIES = [
  'code',
  'errno',
  'sqlState',
  'status',
  'statusCode',
  'type',
] as const;

function sanitizeError(
  error: Error,
  secrets: readonly string[],
  depth: number,
  seen: WeakSet<object>,
): Error {
  const copy = new Error(redactText(error.message, secrets));
  copy.name = error.name;
  copy.stack =
    error.stack === undefined ? undefined : redactText(error.stack, secrets);
  for (const key of KEPT_ERROR_PROPERTIES) {
    const value: unknown = Reflect.get(error, key);
    if (typeof value === 'number') Reflect.set(copy, key, value);
    else if (typeof value === 'string')
      Reflect.set(copy, key, redactText(value, secrets));
  }
  if (error.cause !== undefined) {
    copy.cause = sanitizeValue(error.cause, secrets, depth + 1, seen);
  }
  return copy;
}

// Trả bản sao đã che của `value`; không sửa đối tượng gốc. Xử lý vòng lặp và độ sâu; thuộc tính ném lỗi khi đọc được thay bằng nhãn.
export function sanitizeValue(
  value: unknown,
  secrets: readonly string[] = [],
  depth = 0,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (typeof value === 'string') return redactText(value, secrets);
  if (typeof value !== 'object' || value === null) return value;
  if (value instanceof Date) return value;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    return '[Binary]';
  }
  if (seen.has(value)) return '[Circular]';
  if (depth >= MAX_DEPTH) return '[MaxDepth]';
  seen.add(value);
  try {
    if (value instanceof Error)
      return sanitizeError(value, secrets, depth, seen);
    if (Array.isArray(value)) {
      return value.map((item) => sanitizeValue(item, secrets, depth + 1, seen));
    }
    if (value instanceof Set) {
      return [...value].map((item) =>
        sanitizeValue(item, secrets, depth + 1, seen),
      );
    }
    const entries: [unknown, unknown][] =
      value instanceof Map
        ? [...value.entries()]
        : Object.keys(value).map((key): [unknown, unknown] => [
            key,
            readProperty(value, key),
          ]);
    const result: Record<string, unknown> = {};
    for (const [rawKey, rawValue] of entries) {
      const key = typeof rawKey === 'string' ? rawKey : String(rawKey);
      result[key] = isSensitiveKey(key)
        ? REDACTED
        : sanitizeValue(rawValue, secrets, depth + 1, seen);
    }
    return result;
  } finally {
    // Cho phép cùng một đối tượng xuất hiện ở hai nhánh khác nhau (không phải vòng lặp)
    seen.delete(value);
  }
}

function readProperty(target: object, key: string): unknown {
  try {
    return Reflect.get(target, key);
  } catch {
    return '[Unreadable]';
  }
}

// Che mọi đối số của một lời gọi logger (message, stack, context…)
export function sanitizeLogArgs(
  args: readonly unknown[],
  secrets: readonly string[] = [],
): unknown[] {
  return args.map((arg) => sanitizeValue(arg, secrets));
}
