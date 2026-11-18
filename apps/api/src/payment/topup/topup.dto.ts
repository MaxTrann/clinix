import { IsIn, ValidateBy } from 'class-validator';
import {
  TOPUP_GATEWAYS,
  type TopupGateway,
} from '../../wallet/wallet.constants.js';

// Thân và kết quả của nạp ví (payment B4; PLAN 5.4, 5.11 #3, #4).

// Số nguyên đồng dạng CHUỖI (PLAN 5.11 "chung"; số đo M9: số kiểu `number` bị từ chối): 1 đến 10 chữ số, không số 0 đứng đầu. "0", âm, phần lẻ, khoảng trắng, chữ số Unicode đều sai dạng.
// Hạn mức Q20 kiểm ở service (lỗi khác: `SO_TIEN_NGOAI_HAN_MUC` kèm `chiTiet`).
const TOPUP_AMOUNT_PATTERN = /^[1-9][0-9]{0,9}$/u;

/** Thân `POST /patient/wallet/topups`. Ví và chủ ví CHỈ lấy từ token; khoá lạ ⇒ 400 `TRUONG_KHONG_DUOC_PHEP` (`forbidNonWhitelisted` toàn cục). */
export class CreateTopupDto {
  @ValidateBy({
    name: 'isTopupAmount',
    validator: {
      validate: (value: unknown) =>
        typeof value === 'string' && TOPUP_AMOUNT_PATTERN.test(value),
      defaultMessage: () => 'SO_TIEN_KHONG_HOP_LE',
    },
  })
  soTien!: string;

  // Chỉ hai cổng nạp; `Vi`, `TienMatTaiQuay` (DB nhận cho loại khác) bị chặn ở đây (NTV-05).
  @IsIn(TOPUP_GATEWAYS, { message: 'PHUONG_THUC_KHONG_HOP_LE' })
  phuongThuc!: TopupGateway;
}

export interface CreateTopupResult {
  maGiaoDich: string;
  redirectUrl: string;
}

export interface TopupStatus {
  maGiaoDich: string;
  soTien: string;
  phuongThuc: TopupGateway;
  trangThai: 'DangXuLy' | 'ThanhCong' | 'ThatBai';
  daCongVi: boolean;
  /** ISO 8601 UTC */
  thoiDiemTao: string;
}
