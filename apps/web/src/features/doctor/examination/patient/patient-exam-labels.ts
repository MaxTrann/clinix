import type { ExamineeOption } from '../api/patient-exam-types';

// Nhãn của hai ENUM của DB cho trang Hồ sơ khám bệnh của Bệnh nhân (doctor-exam F5; WXH-13). Bảng nhỏ CHÉP từ `features/search/format/doctor-title.ts` và `features/patient/relatives/relative-labels.ts`: cả hai không xuất qua
// `index.ts` của feature và `features/doctor` không được import booking (Q20, WHT-10) ⇒ bản chép thứ tư, ghi `TECH_DEBT` 166. Dùng `Map` (không phải đối tượng thường) để mã lạ như "constructor" không trúng khoá của nguyên mẫu;
// mã lạ (API thêm giá trị mới) hiện NGUYÊN MÃ thay vì vỡ trang. Hàm thuần.
const DOCTOR_TITLES = new Map<string, string>([
  ['BS', 'BS'],
  ['BS_CKI', 'BS.CKI'],
  ['BS_CKII', 'BS.CKII'],
  ['ThS_BS', 'ThS.BS'],
  ['TS_BS', 'TS.BS'],
  ['PGS_TS_BS', 'PGS.TS.BS'],
  ['GS_TS_BS', 'GS.TS.BS'],
]);

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

export const SELF_LABEL = 'Bản thân';
// Giá trị của bộ lọc người khám khi chọn bản thân (cùng chữ với `hoSoNguoiThanId` của `GET /patient/appointments`, B4)
export const SELF_FILTER = 'BanThan';

export function doctorTitleLabel(code: string): string {
  return DOCTOR_TITLES.get(code) ?? code;
}

// Figma `414:2`, `443:2`: "BS Lê Thảo Vy", "ThS.BS Nguyễn Minh Anh", "BS.CKII Trần Quốc Huy" (chức danh, một dấu cách, họ tên; KHÔNG chấm sau "BS" như `doctorDisplayName` của search)
export function doctorName(code: string, fullName: string): string {
  return `${doctorTitleLabel(code)} ${fullName}`;
}

export function relationshipLabel(code: string): string {
  return RELATIONSHIPS.get(code) ?? code;
}

// Quan hệ của người khám với tài khoản: `null` là bản thân
export function relationLabel(quanHe: string | null): string {
  return quanHe === null ? SELF_LABEL : relationshipLabel(quanHe);
}

// Chip lọc (Figma `414:2`): "Nguyễn Văn A (Bản thân)" và "Bùi Minh Khoa · Con"
export function examineeChipLabel(option: ExamineeOption): string {
  return option.quanHe === null
    ? `${option.hoTen} (${SELF_LABEL})`
    : `${option.hoTen} · ${relationshipLabel(option.quanHe)}`;
}

// Giá trị gửi lên API của một chip: id hồ sơ người thân, hoặc `BanThan`
export function examineeValue(option: ExamineeOption): string {
  return option.id ?? SELF_FILTER;
}
