/**
 * Mã lỗi NGẮN để ghi log ở `payment/` (B4 IPN, B14 đối soát): `code` của driver MySQL (ví dụ `ER_DUP_ENTRY`) hay tên lớp lỗi. KHÔNG BAO GIỜ trả thông điệp lỗi: thông điệp SQL có thể mang giá trị
 * (mã giao dịch cổng trong "Duplicate entry", số tiền), là dữ liệu không được vào log (BDT-01).
 */
export function logErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && /^[A-Z0-9_]{1,64}$/.test(code)) return code;
    if (error instanceof Error) return error.name;
  }
  return 'unknown';
}
