// Nhãn hiển thị của luồng đặt lịch (booking F4; F5 dùng lại cho Bước 5). Bản nhỏ riêng của booking vì `features/` không import chéo: cùng nội dung với
// `patient/relatives/relative-labels.ts` (quan hệ) và `search/format/doctor-title.ts` (chức danh); gom lại ở TECH_DEBT dòng 109. Dùng `Map` (không phải đối
// tượng thường) để mã lạ như "constructor" không trúng khoá của nguyên mẫu.

// Mã của ENUM `ho_so_nguoi_than.moi_quan_he` (8 giá trị, thứ tự của Q15) và nhãn. Mã lạ ⇒ "Người thân" [đề xuất] (không đoán, không lộ mã thô).
const RELATIONSHIPS = new Map<string, string>([
  ['Cha', 'Cha'],
  ['Me', 'Mẹ'],
  ['Vo', 'Vợ'],
  ['Chong', 'Chồng'],
  ['Con', 'Con'],
  ['AnhChiEm', 'Anh/Chị/Em'],
  ['OngBa', 'Ông/Bà'],
  ['Khac', 'Khác'],
]);

export const UNKNOWN_RELATIONSHIP_LABEL = 'Người thân';

export function relationshipLabel(code: string): string {
  return RELATIONSHIPS.get(code) ?? UNKNOWN_RELATIONSHIP_LABEL;
}

// Mã của ENUM `bac_si.chuc_danh` (7 giá trị). Mã lạ (API thêm chức danh mới) hiện nguyên mã thay vì vỡ trang.
const DOCTOR_TITLES = new Map<string, string>([
  ['BS', 'BS'],
  ['BS_CKI', 'BS.CKI'],
  ['BS_CKII', 'BS.CKII'],
  ['ThS_BS', 'ThS.BS'],
  ['TS_BS', 'TS.BS'],
  ['PGS_TS_BS', 'PGS.TS.BS'],
  ['GS_TS_BS', 'GS.TS.BS'],
]);

export function doctorTitleLabel(code: string): string {
  return DOCTOR_TITLES.get(code) ?? code;
}

// "ThS.BS. Nguyễn Minh Anh" (Figma `449:2`): nhãn chức danh, dấu chấm, họ tên
export function doctorDisplayName(chucDanh: string, hoTen: string): string {
  return `${doctorTitleLabel(chucDanh)}. ${hoTen}`;
}
