// Quét bí mật trong những gì một thao tác đưa ra ngoài (kết quả, lỗi, log), dùng cho test SE-04 / DK-39 / DK-40 của task A6.
// Bí mật được kiểm là giá trị THẬT sinh ra trong luồng (mật khẩu của test, băm Argon2id đọc từ DB, mã OTP đọc từ thư giả), không phải chuỗi mẫu.
import { inspect } from 'node:util';

/** Mã OTP đứng riêng (không nằm giữa các chữ số khác), để không báo nhầm khi 6 chữ số trùng một đoạn của id hay mốc thời gian. */
export const standalone = (code: string): RegExp =>
  new RegExp(`(?<![0-9])${code}(?![0-9])`);

/** Chạy `work` và gom mọi thứ nó đưa ra ngoài: giá trị trả về (JSON) hoặc lỗi (inspect đủ cả nguyên nhân, stack và thân phản hồi). */
export async function exposedBy(work: () => Promise<unknown>): Promise<string> {
  try {
    // String(): thao tác trả undefined (verify-otp) thì JSON.stringify trả undefined chứ không phải chuỗi
    return String(JSON.stringify(await work()));
  } catch (error) {
    return `${inspect(error, { depth: 8 })}\n${JSON.stringify(
      (error as { getResponse?: () => unknown }).getResponse?.() ?? null,
    )}`;
  }
}

export interface Secrets {
  /** Chuỗi cấm xuất hiện nguyên văn (mật khẩu, băm, email…) */
  literals: string[];
  /** Mã OTP: cấm xuất hiện đứng riêng */
  codes: string[];
}

export function expectNoSecrets(
  where: string,
  text: string,
  secrets: Secrets,
): void {
  for (const literal of secrets.literals) {
    expect(
      literal.length,
      `${where}: bí mật rỗng thì kiểm vô nghĩa`,
    ).toBeGreaterThan(5);
    expect(text, `${where}: ${literal.slice(0, 4)}…`).not.toContain(literal);
  }
  for (const code of secrets.codes) {
    expect(text, `${where}: OTP`).not.toMatch(standalone(code));
  }
  expect(text, `${where}: dấu hiệu băm Argon2id`).not.toContain('$argon2id$');
}
