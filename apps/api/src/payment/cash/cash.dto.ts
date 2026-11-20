import { ValidateBy } from 'class-validator';

// Thân và kết quả của `POST /reception/appointments/:maLichHen/collect-cash` (payment B6; PLAN 5.7, 5.11 #8).

// Số nguyên đồng dạng chuỗi `[đề xuất]` (PLAN 5.11 "chung"): "0", hoặc 1 đến 10 chữ số không số 0 đứng đầu. "0" vẫn qua DTO để máy chủ trả đúng `KHONG_CON_PHAI_THU` (TTQ-08) khi không còn gì để thu.
// Không nhận số (`number`), phần lẻ, dấu, khoảng trắng.
const AMOUNT_PATTERN = /^(0|[1-9][0-9]{0,9})$/u;

/**
 * `soTien` CHỈ để đối chiếu với số còn phải thu mà Lễ tân thấy trên màn hình (Figma hiện số, Lễ tân xác nhận); số thật được ghi là số máy chủ tính dưới khoá lịch. Thân KHÔNG nhận `chiNhanhId`, `nguoiThuId`
 * hay khoá lạ nào khác: `forbidNonWhitelisted` toàn cục trả 400 `TRUONG_KHONG_DUOC_PHEP` (TTQ-10); chi nhánh và người thu chỉ lấy từ token (QTT-14).
 */
export class CollectCashDto {
  @ValidateBy({
    name: 'isCashAmount',
    validator: {
      validate: (value: unknown) =>
        typeof value === 'string' && AMOUNT_PATTERN.test(value),
      defaultMessage: () => 'SO_TIEN_KHONG_HOP_LE',
    },
  })
  soTien!: string;
}

/** Phiếu thu in cho Bệnh nhân. Tiền là chuỗi decimal hai chữ số; `thoiDiem` ISO 8601 UTC; `soPhieu` là id giao dịch (chuỗi). Mọi số do MÁY CHỦ tính. */
export interface CashReceipt {
  soPhieu: string;
  giaKham: string;
  daThanhToanTruoc: string;
  thuTaiQuay: string;
  thoiDiem: string;
  /** Họ tên Lễ tân đã thu */
  nguoiThu: string;
}

/**
 * `GET /reception/appointments/:maLichHen/cash-preview` (payment F4): ba số của hộp "Thu tiền & tiếp đón" (Figma `492:2`), do MÁY CHỦ tính để web không phải lấy giá trừ còn phải thu
 * (WTQ-01). `thuTaiQuay` là số Lễ tân gửi lại ở `collect-cash`; số thật vẫn được tính lại dưới khoá lịch (lệch ⇒ `SO_TIEN_KHONG_KHOP`).
 */
export interface CashPreview {
  maLichHen: string;
  giaKham: string;
  daThanhToanTruoc: string;
  thuTaiQuay: string;
}

export interface CollectCashResult {
  maLichHen: string;
  trangThai: 'DaTiepDon';
  phieuThu: CashReceipt;
}
