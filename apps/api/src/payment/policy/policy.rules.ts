import type { FieldError } from '../../common/errors/app.exception.js';
import { compareMoney } from '../../pricing/money.js';

// Luật hợp lệ của chính sách đặt cọc và hoàn tiền của MỘT dịch vụ (payment B10; PLAN payment 5.9, A1). Hàm THUẦN, không DB, không giờ: MỘT chỗ chứa luật để service chỉ gọi,
// test đơn vị phủ từng mã (CSD-03, CSD-05 đến CSD-08). Trả TẤT CẢ lỗi một lượt (CSD-09: thân lỗi liệt kê đủ), không dừng ở lỗi đầu. Lỗi chỉ mang tên trường và mã,
// KHÔNG mang giá trị người dùng gửi.

/** Tối đa số mốc hoàn của một dịch vụ `[đề xuất]` (CSD-08: 7 mốc bị từ chối, 6 mốc hợp lệ). */
export const MAX_REFUND_TIERS = 6;

/** Số giờ tối đa vừa cột `so_gio_truoc_toi_thieu` (`INT` có dấu của MySQL). */
const MAX_TIER_HOURS = 2147483647;

export interface RefundTier {
  /** Hủy trước giờ hẹn ít nhất bấy nhiêu giờ thì được hoàn `tyLeHoan` phần trăm */
  soGioTruocToiThieu: number;
  tyLeHoan: number;
}

export interface DepositPolicyInput {
  /** Số nguyên đồng dạng chuỗi (`"100000"`), có thể có dấu trừ để luật báo `MUC_COC_AM` thay vì coi là sai hình dạng */
  mucDatCoc: string;
  moc: readonly RefundTier[];
}

/** Mã lỗi trong `loi[].ma` của `CHINH_SACH_COC_KHONG_HOP_LE` (PLAN 5.14). */
export const POLICY_ERROR_CODES = {
  DEPOSIT_NEGATIVE: 'MUC_COC_AM',
  DEPOSIT_OVER_PRICE: 'MUC_COC_VUOT_GIA',
  RATE_OUT_OF_RANGE: 'TY_LE_HOAN_NGOAI_KHOANG',
  HOURS_INVALID: 'SO_GIO_MOC_KHONG_HOP_LE',
  HOURS_DUPLICATE: 'MOC_TRUNG_SO_GIO',
  RATE_INCREASES: 'TY_LE_MOC_TANG',
  TOO_MANY_TIERS: 'QUA_NHIEU_MOC',
} as const;

const isValidHours = (value: number): boolean =>
  Number.isInteger(value) && value >= 0 && value <= MAX_TIER_HOURS;

const isValidRate = (value: number): boolean =>
  Number.isInteger(value) && value >= 0 && value <= 100;

/**
 * Kiểm cọc và mốc. `giaMacDinh` là `gia_mac_dinh` của dịch vụ (chuỗi decimal của DB) đọc DƯỚI khoá X của hàng `dich_vu_kham`: cọc không được vượt giá (4.7 #1).
 * Chiều ngược lại (Admin hạ giá dưới cọc) do `ServiceService.update` của admin kiểm dưới cùng khoá, ở đây chỉ kiểm chiều cọc ≤ giá.
 */
export function validatePolicy(
  input: DepositPolicyInput,
  giaMacDinh: string,
): FieldError[] {
  const errors: FieldError[] = [];
  const add = (truong: string, ma: string) => errors.push({ truong, ma });

  // Cọc: không âm; bằng 0 hợp lệ (không đặt cọc); không vượt giá. Dấu trừ ở đầu là cách DTO cho phép số âm tới được đây.
  if (input.mucDatCoc.startsWith('-')) {
    add('mucDatCoc', POLICY_ERROR_CODES.DEPOSIT_NEGATIVE);
  } else if (compareMoney(input.mucDatCoc, giaMacDinh) > 0) {
    add('mucDatCoc', POLICY_ERROR_CODES.DEPOSIT_OVER_PRICE);
  }

  if (input.moc.length > MAX_REFUND_TIERS) {
    add('moc', POLICY_ERROR_CODES.TOO_MANY_TIERS);
  }

  // Từng mốc: giờ nguyên không âm, tỷ lệ nguyên 0 đến 100, giờ không trùng nhau (khớp UNIQUE (dich_vu_kham_id, so_gio_truoc_toi_thieu))
  const seenHours = new Set<number>();
  // Mốc đủ điều kiện để so thứ tự tỷ lệ: giờ và tỷ lệ hợp lệ, giờ chưa gặp
  const comparable: { index: number; tier: RefundTier }[] = [];
  input.moc.forEach((tier, index) => {
    const hoursOk = isValidHours(tier.soGioTruocToiThieu);
    const rateOk = isValidRate(tier.tyLeHoan);
    if (!hoursOk)
      add(`moc[${index}].soGioTruocToiThieu`, POLICY_ERROR_CODES.HOURS_INVALID);
    if (!rateOk)
      add(`moc[${index}].tyLeHoan`, POLICY_ERROR_CODES.RATE_OUT_OF_RANGE);
    if (!hoursOk) return;
    if (seenHours.has(tier.soGioTruocToiThieu)) {
      add(
        `moc[${index}].soGioTruocToiThieu`,
        POLICY_ERROR_CODES.HOURS_DUPLICATE,
      );
      return;
    }
    seenHours.add(tier.soGioTruocToiThieu);
    if (rateOk) comparable.push({ index, tier });
  });

  // Hủy càng sát giờ hẹn (số giờ càng nhỏ) hoàn càng ít: xếp giờ giảm dần thì tỷ lệ phải không tăng. Báo ở mốc đứng SAU (mốc làm tỷ lệ tăng).
  const byHoursDesc = sortTiersDescending(comparable, (item) => item.tier);
  for (let i = 1; i < byHoursDesc.length; i += 1) {
    const previous = byHoursDesc[i - 1]!;
    const current = byHoursDesc[i]!;
    if (current.tier.tyLeHoan > previous.tier.tyLeHoan)
      add(`moc[${current.index}].tyLeHoan`, POLICY_ERROR_CODES.RATE_INCREASES);
  }

  return errors;
}

/** Xếp mốc theo số giờ GIẢM dần (thứ tự lưu và trả về: mốc xa giờ hẹn trước). Không sửa mảng gốc. */
export function sortTiersDescending<T>(
  items: readonly T[],
  tierOf: (item: T) => RefundTier,
): T[] {
  return [...items].sort(
    (a, b) => tierOf(b).soGioTruocToiThieu - tierOf(a).soGioTruocToiThieu,
  );
}
