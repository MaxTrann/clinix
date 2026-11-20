import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateBy,
} from 'class-validator';
import { isValidReasonText } from '../../appointments/status/required-reason.decorator.js';
import { AUDIT_PAYMENT_LIMITS } from '../../audit/audit-validation.js';
import { WALLET_ERROR_CODES } from '../wallet.constants.js';

// Query, thân và kết quả của hoàn tiền đặc biệt (payment B13; PLAN 5.6.2, 5.11 #12). Tiền là chuỗi decimal, id BIGINT là chuỗi.

/** Mã lỗi của trường lý do (dùng chung nghĩa với booking, admin: nằm ở `loi[].ma` của 400 `DU_LIEU_KHONG_HOP_LE`). */
export const REASON_REQUIRED = 'LY_DO_BAT_BUOC';
// Số nguyên đồng dạng CHUỖI, 1 đến 10 chữ số, không số 0 đứng đầu (như rút tiền B11). Số kiểu `number` bị từ chối (M9).
const AMOUNT_PATTERN = /^[1-9][0-9]{0,9}$/u;
const ID_PATTERN = /^[1-9][0-9]{0,18}$/u;

/**
 * Lý do bắt buộc của thao tác tiền có ghi nhật ký (hoàn đặc biệt B13, nạp ví chưa cộng B15): `trim`, dài 10 đến 255 (giới hạn của nhật ký) và KHÔNG giống bí mật (cùng bộ kiểm `redactText`
 * mà nhật ký dùng; nếu không, nhật ký ném `AUDIT_SENSITIVE_DATA` và người dùng nhận 500). Sai ⇒ `LY_DO_BAT_BUOC` ở `loi[].ma`.
 */
export function IsAuditedReason(): PropertyDecorator {
  const trim = Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
  const validate = ValidateBy({
    name: 'isAuditedReason',
    validator: {
      validate: (value: unknown) =>
        isValidReasonText(value, { rejectSecrets: true }) &&
        (value as string).length >= AUDIT_PAYMENT_LIMITS.requiredReasonMin &&
        (value as string).length <= AUDIT_PAYMENT_LIMITS.reasonMax,
      defaultMessage: () => REASON_REQUIRED,
    },
  });
  return (target, key) => {
    trim(target, key);
    validate(target, key);
  };
}

/** Đúng MỘT trong hai (Trung chốt 19/11/2026); kiểm "đúng một" ở service. `maLichHen` của bất kỳ lịch nào trong chuỗi đổi lịch. */
export class RefundablePaymentsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  maLichHen?: string;

  @IsOptional()
  @Matches(ID_PATTERN)
  benhNhanId?: string;
}

/**
 * Thân `POST /admin/wallet/special-refunds`. Người hoàn CHỈ từ token; khoá lạ ⇒ 400 `TRUONG_KHONG_DUOC_PHEP`.
 *  - `maGiaoDich`: chuỗi; sai dạng hay không phải khoản qua ví ⇒ 404 cùng thân với "không có" (service, QTT-13).
 *  - `soTien`: âm, 0, có phần lẻ, kiểu số ⇒ `SO_TIEN_KHONG_HOP_LE` (HDB-04, A2).
 *  - `lyDo`: sau `trim` dài 10 đến 255 (giới hạn của nhật ký `HoanTienDacBiet`) và KHÔNG giống bí mật (cùng bộ kiểm `redactText` mà nhật ký dùng; nếu không, nhật ký ném
 *    `AUDIT_SENSITIVE_DATA` và người dùng nhận 500) ⇒ `LY_DO_BAT_BUOC` (HDB-03, A1).
 */
export class CreateSpecialRefundDto {
  @IsString()
  @MaxLength(30)
  maGiaoDich!: string;

  @ValidateBy({
    name: 'isRefundAmount',
    validator: {
      validate: (value: unknown) =>
        typeof value === 'string' && AMOUNT_PATTERN.test(value),
      defaultMessage: () => WALLET_ERROR_CODES.INVALID_AMOUNT,
    },
  })
  soTien!: string;

  @IsAuditedReason()
  lyDo!: string;
}

export interface RefundablePayment {
  maGiaoDich: string;
  /** Mã lịch CUỐI của chuỗi đổi lịch (lịch Bệnh nhân đang thấy) */
  maLichHen: string;
  soTien: string;
  daHoan: string;
  conCoTheHoan: string;
  thoiDiem: string;
}

/** Kết quả hoàn: KHÔNG có số dư của Bệnh nhân (BDT-08). */
export interface SpecialRefundCreated {
  maGiaoDich: string;
  soTien: string;
}
