import { errorMessageFor } from '../../../shared/api/error-message';
import { ApiError } from '../../../shared/api/errors';
import type {
  RefundTier,
  ServicePolicy,
  ServicePolicyInput,
} from './api/policy-api';

// Biểu mẫu chính sách cọc của MỘT dịch vụ (payment F5). Hàm THUẦN để test riêng: chuyển dữ liệu máy chủ ⇄ ô nhập, kiểm ĐỊNH DẠNG trước khi gửi, ánh xạ lỗi `loi[].ma` vào đúng ô.
// Luật nghiệp vụ đầy đủ (giờ trùng, tỷ lệ tăng, tối đa 6 mốc…) là của máy chủ (`policy.rules.ts` của B10): web chỉ chặn những gì không thể gửi được (ô rỗng, chữ) và cọc vượt giá
// (so trên CHUỖI bằng BigInt, không qua `Number`: WCP-06). Mọi chữ là [đề xuất] (Figma chưa có frame lỗi, PLAN 4.5).

/** Bảng mẫu "Chính sách hủy / hoàn mặc định — Toàn hệ thống" (Figma `553:2`; Q7: chỉ là HẰNG ở web, không lưu; nút "Áp dụng bảng mẫu" chép vào mốc riêng). */
export const DEFAULT_TIERS: readonly RefundTier[] = [
  { soGioTruocToiThieu: 24, tyLeHoan: 100 },
  { soGioTruocToiThieu: 2, tyLeHoan: 50 },
  { soGioTruocToiThieu: 0, tyLeHoan: 0 },
];

/** Tối đa số mốc (khớp `MAX_REFUND_TIERS` của B10): nút "Thêm mốc" tắt khi đủ. */
export const MAX_TIERS = 6;

export interface TierDraft {
  /** Khoá ổn định cho React khi thêm, xoá mốc */
  key: number;
  hours: string;
  rate: string;
}

export interface PolicyDraft {
  deposit: string;
  tiers: TierDraft[];
}

/** Lỗi theo ô: `deposit`, `tiers` (cả bảng), `tier.<i>.hours`, `tier.<i>.rate`. */
export type FieldErrors = Record<string, string>;

export const FIELD_MESSAGES: Record<string, string> = {
  MUC_COC_KHONG_HOP_LE: 'Mức đặt cọc phải là số nguyên đồng, không âm.',
  MUC_COC_AM: 'Mức đặt cọc không được âm.',
  MUC_COC_VUOT_GIA: 'Mức đặt cọc không được lớn hơn giá dịch vụ.',
  SO_GIO_MOC_KHONG_HOP_LE: 'Số giờ phải là số nguyên không âm.',
  TY_LE_HOAN_KHONG_HOP_LE: 'Tỷ lệ hoàn phải là số nguyên từ 0 đến 100.',
  TY_LE_HOAN_NGOAI_KHOANG: 'Tỷ lệ hoàn phải là số nguyên từ 0 đến 100.',
  MOC_TRUNG_SO_GIO: 'Số giờ này đã có ở mốc khác.',
  TY_LE_MOC_TANG:
    'Hủy càng sát giờ hẹn thì tỷ lệ hoàn không được cao hơn mốc xa hơn.',
  QUA_NHIEU_MOC: `Tối đa ${MAX_TIERS} mốc.`,
  MOC_KHONG_HOP_LE: 'Danh sách mốc không hợp lệ.',
};

let nextKey = 1;
const newKey = () => nextKey++;

const tierDraft = (tier?: RefundTier): TierDraft => ({
  key: newKey(),
  hours: tier === undefined ? '' : String(tier.soGioTruocToiThieu),
  rate: tier === undefined ? '' : String(tier.tyLeHoan),
});

/** "100000.00" ⇒ "100000": bỏ phần lẻ ".00" trên CHUỖI (cọc luôn là số nguyên đồng; phần lẻ khác 0 giữ nguyên để không làm sai số). */
export function depositInput(amount: string): string {
  return amount.replace(/\.0+$/, '');
}

export function draftFromPolicy(policy: ServicePolicy): PolicyDraft {
  return {
    deposit: depositInput(policy.mucDatCoc),
    tiers: policy.moc.map(tierDraft),
  };
}

export const emptyTier = (): TierDraft => tierDraft();

export const templateTiers = (): TierDraft[] => DEFAULT_TIERS.map(tierDraft);

const DIGITS = /^\d+$/;
const DEPOSIT_DIGITS = /^(0|[1-9]\d{0,9})$/;

/** Số tiền decimal dạng chuỗi ⇒ đơn vị 0,01 (BigInt). Chỉ dùng cho chuỗi đã đúng dạng. */
function cents(amount: string): bigint {
  const [whole = '0', fraction = ''] = amount.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2));
}

/** Số tiền decimal dạng chuỗi có bằng 0 không ("0", "0.00"), kiểm bằng BigInt. */
export function isZeroAmount(amount: string): boolean {
  return cents(amount) === 0n;
}

/** Cọc (số nguyên đồng) có lớn hơn giá (chuỗi decimal của máy chủ) không, so bằng BigInt (WCP-06: không `Number`). */
export function depositExceedsPrice(deposit: string, price: string): boolean {
  return cents(deposit) > cents(price);
}

/**
 * Kiểm ĐỊNH DẠNG trước khi gửi. Trả lỗi theo ô (rỗng ⇒ gửi được) và thân PUT khi không lỗi. Luật nghiệp vụ còn lại để máy chủ kiểm và trả `loi[]` (một nơi chứa luật).
 */
export function buildInput(
  draft: PolicyDraft,
  price: string,
): { errors: FieldErrors; input: ServicePolicyInput | null } {
  const errors: FieldErrors = {};
  const deposit = draft.deposit.trim();
  if (!DEPOSIT_DIGITS.test(deposit))
    errors.deposit = FIELD_MESSAGES.MUC_COC_KHONG_HOP_LE!;
  else if (depositExceedsPrice(deposit, price))
    errors.deposit = FIELD_MESSAGES.MUC_COC_VUOT_GIA!;

  const moc: RefundTier[] = [];
  draft.tiers.forEach((tier, index) => {
    const hours = tier.hours.trim();
    const rate = tier.rate.trim();
    // `Number` an toàn ở đây: số giờ và tỷ lệ là số nguyên nhỏ, không phải tiền
    if (!DIGITS.test(hours) || hours.length > 9)
      errors[`tier.${index}.hours`] = FIELD_MESSAGES.SO_GIO_MOC_KHONG_HOP_LE!;
    if (!DIGITS.test(rate) || Number(rate) > 100)
      errors[`tier.${index}.rate`] = FIELD_MESSAGES.TY_LE_HOAN_KHONG_HOP_LE!;
    moc.push({ soGioTruocToiThieu: Number(hours), tyLeHoan: Number(rate) });
  });
  if (draft.tiers.length > MAX_TIERS)
    errors.tiers = FIELD_MESSAGES.QUA_NHIEU_MOC!;

  return Object.keys(errors).length > 0
    ? { errors, input: null }
    : { errors, input: { mucDatCoc: deposit, moc } };
}

/** Cảnh báo WCP-04: có cọc mà không có mốc nào ⇒ Bệnh nhân hủy sẽ không được hoàn (vẫn lưu được, booking Q15). */
export function noRefundWarning(draft: PolicyDraft): boolean {
  const deposit = draft.deposit.trim();
  return (
    DEPOSIT_DIGITS.test(deposit) && deposit !== '0' && draft.tiers.length === 0
  );
}

/**
 * Đổi `truong` của máy chủ sang khoá ô của form. Máy chủ có hai dạng: luật B10 `moc[0].tyLeHoan` và ValidationPipe `moc.0.tyLeHoan`; cả hai về `tier.0.rate`.
 */
function fieldKey(truong: string): string | null {
  if (truong === 'mucDatCoc') return 'deposit';
  if (truong === 'moc') return 'tiers';
  const match =
    /^moc(?:\[(\d+)\]|\.(\d+))\.(soGioTruocToiThieu|tyLeHoan)$/.exec(truong);
  if (match === null) return null;
  const index = match[1] ?? match[2];
  return `tier.${index}.${match[3] === 'tyLeHoan' ? 'rate' : 'hours'}`;
}

export interface SaveFeedback {
  /** Banner chung: CHỈ khi lỗi không gắn được ô nào (nếp `catalog-errors.ts` của admin) */
  message: string;
  fields: FieldErrors;
}

/** Lỗi khi lưu ⇒ câu theo ô (WCP-03: gắn đúng ô, giữ nội dung đang gõ) hay banner chung. */
export function saveFeedbackFor(error: unknown): SaveFeedback {
  if (!(error instanceof ApiError))
    return { message: errorMessageFor(error), fields: {} };
  const fields: FieldErrors = {};
  for (const item of error.loi ?? []) {
    const key = fieldKey(item.truong);
    const message = FIELD_MESSAGES[item.ma];
    if (key !== null && message !== undefined && fields[key] === undefined)
      fields[key] = message;
  }
  if (Object.keys(fields).length > 0) return { message: '', fields };
  if (error.status === 404)
    return {
      message: 'Dịch vụ không còn tồn tại. Hãy tải lại danh sách.',
      fields,
    };
  if (error.status === 403)
    return { message: 'Bạn không có quyền thực hiện thao tác này.', fields };
  return {
    message: 'Không lưu được chính sách. Vui lòng thử lại.',
    fields,
  };
}
