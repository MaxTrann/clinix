import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNumber,
  ValidateBy,
  ValidateNested,
} from 'class-validator';

// Thân vào của `PUT /admin/payment-policy/services/:id` (payment B10; PLAN payment 5.9, 5.11 #14). DTO CHỈ kiểm HÌNH DẠNG (kiểu dữ liệu): luật nghiệp vụ (cọc không âm, không vượt giá, tỷ lệ 0 đến 100, giờ không trùng,
// tỷ lệ không tăng, tối đa 6 mốc) ở `policy.rules.ts` để trả MỘT lỗi `CHINH_SACH_COC_KHONG_HOP_LE` liệt kê đủ (CSD-09). Vì vậy số âm và số ngoài khoảng VẪN qua DTO. Khoá lạ ở thân là 400 `TRUONG_KHONG_DUOC_PHEP`
// (`forbidNonWhitelisted` toàn cục: CSD-15). Mã lỗi hình dạng đặt vào `message` (nếp admin) để `loi[].ma` ổn định.

// Cọc là số nguyên đồng dạng chuỗi `[đề xuất]` (như giá của admin): "0", hoặc 1 đến 10 chữ số không số 0 đứng đầu, có thể có dấu trừ (để luật báo MUC_COC_AM, không báo sai hình dạng).
// Tối đa 10 chữ số vừa `decimal(12,2)`. Không nhận phần lẻ, khoảng trắng, số mũ, kiểu số (`number`) hay `null`.
const DEPOSIT_PATTERN = /^(0|-?[1-9][0-9]{0,9})$/u;
const isDepositString = (value: unknown): boolean =>
  typeof value === 'string' && DEPOSIT_PATTERN.test(value);

// Tối đa số phần tử mảng nhận vào để một thân khổng lồ không tốn công kiểm từng mốc; vượt số mốc cho phép nhưng còn trong mức này vẫn tới luật và nhận QUA_NHIEU_MOC.
const MAX_TIERS_ACCEPTED = 50;

const finiteNumber = { allowNaN: false, allowInfinity: false } as const;

export class RefundTierDto {
  @IsNumber(finiteNumber, { message: 'SO_GIO_MOC_KHONG_HOP_LE' })
  soGioTruocToiThieu!: number;

  @IsNumber(finiteNumber, { message: 'TY_LE_HOAN_KHONG_HOP_LE' })
  tyLeHoan!: number;
}

export class UpdatePaymentPolicyDto {
  @ValidateBy({
    name: 'isDepositAmount',
    validator: {
      validate: isDepositString,
      defaultMessage: () => 'MUC_COC_KHONG_HOP_LE',
    },
  })
  mucDatCoc!: string;

  @IsArray({ message: 'MOC_KHONG_HOP_LE' })
  @ArrayMaxSize(MAX_TIERS_ACCEPTED, { message: 'QUA_NHIEU_MOC' })
  @ValidateNested({ each: true })
  @Type(() => RefundTierDto)
  moc!: RefundTierDto[];
}
