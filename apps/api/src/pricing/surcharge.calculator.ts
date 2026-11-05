import type { ChucDanhBacSi } from '../admin/entities/enums.js';
import { addMoney } from './money.js';

/** Một dòng `phu_phi_bac_si` (chỉ các cột dùng để tính). `phuPhi` là chuỗi decimal như DB. */
export interface SurchargeRule {
  chucDanh: ChucDanhBacSi;
  soNamKinhNghiemTu: number;
  phuPhi: string;
  apDung: boolean;
}

/** Phần của bác sĩ mà phép tính cần: chức danh (7 mức) và số năm kinh nghiệm. */
export interface DoctorForPricing {
  chucDanh: ChucDanhBacSi;
  soNamKinhNghiem: number;
}

/** Không có quy tắc nào áp dụng ⇒ phụ phí bằng 0 (quy tắc 11). */
export const NO_SURCHARGE = '0.00';

/**
 * QUY TẮC GIÁ CỦA NHÓM (admin Q21, quy tắc 11 trong `clinix_quy_tac_nghiep_vu.md`) — "chọn mốc áp dụng":
 *  1. Chỉ xét dòng cùng chức danh với bác sĩ.
 *  2. Dòng `apDung = false` (đã tắt) bị loại KHỎI phép tính, các dòng còn lại vẫn xét.
 *  3. Chỉ giữ dòng có `soNamKinhNghiemTu <= số năm kinh nghiệm` (0 năm vẫn khớp mốc 0, không khớp mốc >= 1).
 *  4. Trong số còn lại lấy dòng có mốc LỚN NHẤT.
 * Hệ quả (đã chốt, không phải tình cờ): tắt mốc cao thì bác sĩ RƠI XUỐNG mốc thấp hơn còn hiệu lực, không về 0.
 * Không có dòng nào phù hợp ⇒ `undefined`.
 */
export function pickApplicableRule(
  rules: readonly SurchargeRule[],
  doctor: DoctorForPricing,
): SurchargeRule | undefined {
  let best: SurchargeRule | undefined;
  for (const rule of rules) {
    if (rule.chucDanh !== doctor.chucDanh) continue;
    if (!rule.apDung) continue;
    if (rule.soNamKinhNghiemTu > doctor.soNamKinhNghiem) continue;
    if (!best || rule.soNamKinhNghiemTu > best.soNamKinhNghiemTu) best = rule;
  }
  return best;
}

/** Phụ phí hiện hành của bác sĩ (chuỗi decimal, 2 chữ số thập phân); không có quy tắc phù hợp ⇒ "0.00". */
export function computeSurcharge(
  rules: readonly SurchargeRule[],
  doctor: DoctorForPricing,
): string {
  const rule = pickApplicableRule(rules, doctor);
  return rule ? addMoney(rule.phuPhi, '0') : NO_SURCHARGE;
}

/**
 * Giá khám áp dụng = giá mặc định của dịch vụ + phụ phí hiện hành (Q15). MỘT hàm cho `search` và `booking`;
 * không viết công thức phụ phí lần hai, không cộng bằng số thực.
 */
export function computeExamPrice(
  giaMacDinh: string,
  rules: readonly SurchargeRule[],
  doctor: DoctorForPricing,
): string {
  return addMoney(giaMacDinh, computeSurcharge(rules, doctor));
}
