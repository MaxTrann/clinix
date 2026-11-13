import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { ValidateBy } from 'class-validator';
import { redactText } from '../../common/logging/sanitize.js';
import {
  BOOKING_FIELD_ERROR_CODES,
  CANCEL_REASON_MAX_LENGTH,
} from '../appointments.constants.js';

// Bộ kiểm `lyDo` BẮT BUỘC dùng chung cho các thân có lý do của Lễ tân và Quản trị viên (PLAN booking Q27, 5.14; TRACKING 3.26 B12-E, 3.31 B14-C), để hai DTO không chép cùng một đoạn (jscpd). Chữ sau `trim()` phải dài
// 1 đến `CANCEL_REASON_MAX_LENGTH` (255 đơn vị UTF-16, như cột `ly_do_huy`); vi phạm ⇒ `message` của ràng buộc là mã trường `LY_DO_BAT_BUOC` (nằm ở `loi[].ma` của 400 `DU_LIEU_KHONG_HOP_LE`, như `lyDoKham` ở B8).
// `rejectSecrets` (Quản trị viên override): chữ cũng không được giống mật khẩu, token, băm hay `khoá=giá trị` theo ĐÚNG bộ kiểm `redactText` mà `AuditService` dùng (`copyAuditJson`: `redactText(s) !== s` ⇒
// `AUDIT_SENSITIVE_DATA`), nếu không audit ném và override hoàn tác rồi ra 500. Lễ tân không ghi audit nên không bật cờ này (hành vi Lễ tân không đổi).

export interface RequiredReasonOptions {
  rejectSecrets?: boolean;
}

/** Chữ lý do hợp lệ (đã `trim`): 1 đến `CANCEL_REASON_MAX_LENGTH` đơn vị UTF-16 và, khi `rejectSecrets`, không bị `redactText` che. Xuất để test và để người gọi nội bộ dùng cùng một luật. */
export function isValidReasonText(
  value: unknown,
  options: RequiredReasonOptions = {},
): boolean {
  if (typeof value !== 'string') return false;
  if (value.length < 1 || value.length > CANCEL_REASON_MAX_LENGTH) return false;
  return options.rejectSecrets === true ? redactText(value) === value : true;
}

export function RequiredReason(options: RequiredReasonOptions = {}) {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? value.trim() : value,
    ),
    ValidateBy({
      name: 'isCancelReason',
      validator: {
        validate: (value: unknown) => isValidReasonText(value, options),
        defaultMessage: () => BOOKING_FIELD_ERROR_CODES.REASON_REQUIRED,
      },
    }),
  );
}
