import { ValidateBy } from 'class-validator';

// Thân và kết quả của `POST /patient/wallet/withdrawals` (payment B11; PLAN 5.8, 5.11 #9).

// Số nguyên đồng dạng CHUỖI (PLAN 5.11 "chung"; số đo M9: số kiểu `number` bị từ chối): 1 đến 10 chữ số, không số 0 đứng đầu. Hạn mức tối thiểu Q20 kiểm ở service
// (lỗi khác: `SO_TIEN_NGOAI_HAN_MUC`); tối đa là số dư khả dụng, chỉ biết được DƯỚI khoá ví.
const WITHDRAW_AMOUNT_PATTERN = /^[1-9][0-9]{0,9}$/u;

/** Ví và chủ ví CHỈ lấy từ token; khoá lạ (`viNoiBoId`, `benhNhanId`…) ⇒ 400 `TRUONG_KHONG_DUOC_PHEP` (`forbidNonWhitelisted` toàn cục). */
export class CreateWithdrawalDto {
  @ValidateBy({
    name: 'isWithdrawAmount',
    validator: {
      validate: (value: unknown) =>
        typeof value === 'string' && WITHDRAW_AMOUNT_PATTERN.test(value),
      defaultMessage: () => 'SO_TIEN_KHONG_HOP_LE',
    },
  })
  soTien!: string;
}

/** Tiền là chuỗi decimal hai chữ số; `maYeuCau` là id yêu cầu (chuỗi). Số do MÁY CHỦ tính dưới khoá ví. */
export interface WithdrawalCreated {
  maYeuCau: string;
  soTien: string;
  soDuKhaDung: string;
  soTienDangGiu: string;
}
