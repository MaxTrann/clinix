import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { ValidateBy, ValidateIf } from 'class-validator';
import { CONFIG_FIELD_CODES } from './system-config.errors.js';
import { isValidConfigValue, type ConfigKey } from './system-config-params.js';

// Lý do thay đổi (Q38): 1 đến 500 ký tự sau trim, đếm theo đơn vị UTF-16 (`String.length`) như AUDIT_*_LIMITS `[đề xuất]`.
// Không dùng `@Length` của class-validator vì nó đếm theo điểm mã (cặp thay thế tính 1). AuditService chỉ kiểm "không rỗng", nên đây là nơi DUY NHẤT chặn 500.
export const CHANGE_REASON_MAX_LENGTH = 500;

export function isValidChangeReason(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= CHANGE_REASON_MAX_LENGTH
  );
}

const trimReason = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

// Một tham số cấu hình: vắng (`undefined`) = không đổi; có mặt (kể cả `null`) thì phải đúng miền của bảng chuẩn. Sai ⇒ `loi[{truong, ma}]` với
// `ma` = CAU_HINH_GIA_TRI_KHONG_HOP_LE (cùng cách `GIA_MAC_DINH_KHONG_HOP_LE` của dịch vụ khám).
function ConfigParam(key: ConfigKey) {
  return applyDecorators(
    ValidateIf((_object, value: unknown) => value !== undefined),
    ValidateBy({
      name: 'isConfigValue',
      validator: {
        validate: (value: unknown) => isValidConfigValue(key, value),
        defaultMessage: () => CONFIG_FIELD_CODES.invalidValue,
      },
    }),
  );
}

// Thân `PUT /admin/system-config`: `lyDo` bắt buộc + 0 đến 12 tham số muốn đổi. Trường lạ bị ValidationPipe toàn cục từ chối (TRUONG_KHONG_DUOC_PHEP).
export class UpdateSystemConfigDto {
  @Transform(trimReason)
  @ValidateBy({
    name: 'isChangeReason',
    validator: {
      validate: isValidChangeReason,
      defaultMessage: () => CONFIG_FIELD_CODES.reasonRequired,
    },
  })
  lyDo!: string;

  @ConfigParam('thoiGianGiuCho')
  thoiGianGiuCho?: number;

  @ConfigParam('thoiDiemNhacLich')
  thoiDiemNhacLich?: number[];

  @ConfigParam('soLichHenToiDaMoiHoSo')
  soLichHenToiDaMoiHoSo?: number;

  @ConfigParam('soLanTuDoiLichToiDa')
  soLanTuDoiLichToiDa?: number;

  @ConfigParam('checkInTruocPhut')
  checkInTruocPhut?: number;

  @ConfigParam('checkInSauPhut')
  checkInSauPhut?: number;

  @ConfigParam('thoiHanPhanHoiLoiMoi')
  thoiHanPhanHoiLoiMoi?: number;

  @ConfigParam('soMucChoToiDa')
  soMucChoToiDa?: number;

  @ConfigParam('nguongNoShow')
  nguongNoShow?: number;

  @ConfigParam('soNgayBaoTruocDoiGioLam')
  soNgayBaoTruocDoiGioLam?: number;

  @ConfigParam('trongSoW1')
  trongSoW1?: number;

  @ConfigParam('trongSoW2')
  trongSoW2?: number;
}
