// Nhãn chức danh và tên hiển thị của bác sĩ trong thẻ gợi ý. BẢN CHÉP của `features/search/format/doctor-title.ts` (chatbot không import
// `features/search`, PLAN 1.2); `router/chatbot-suggest-route.test.tsx` khoá hai bên cho cùng kết quả (đổi một nơi mà quên nơi kia thì ca đỏ).
// Mã chức danh là mã THÔ của API (`ChucDanhBacSi`); đây là nhãn công khai như trang tra cứu, không phải học vị nội bộ dùng để xếp hạng.
const LABELS: Record<string, string> = {
  BS: 'BS',
  BS_CKI: 'BS.CKI',
  BS_CKII: 'BS.CKII',
  ThS_BS: 'ThS.BS',
  TS_BS: 'TS.BS',
  PGS_TS_BS: 'PGS.TS.BS',
  GS_TS_BS: 'GS.TS.BS',
};

// BS_CKII ⇒ "BS.CKII"; mã lạ (API thêm chức danh mới) hiện nguyên mã thay vì vỡ thẻ
export function doctorTitleLabel(title: string): string {
  return LABELS[title] ?? title;
}

// "ThS.BS. Nguyễn Minh Anh" (chấm sau chữ BS) nhưng "BS.CKII Trần Quốc Huy" (KHÔNG chấm sau số La Mã CKI, CKII)
export function doctorDisplayName(title: string, fullName: string): string {
  const label = doctorTitleLabel(title);
  return /CKI{1,2}$/.test(label)
    ? `${label} ${fullName}`
    : `${label}. ${fullName}`;
}
