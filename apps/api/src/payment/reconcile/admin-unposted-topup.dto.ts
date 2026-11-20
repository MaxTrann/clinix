import { IsAuditedReason } from '../../wallet/special-refund/special-refund.dto.js';
import type { TopupGateway } from '../../wallet/wallet.constants.js';

// Thân và kết quả của "Nạp ví chưa cộng" (payment B15; PLAN 5.4 bước 6, 5.11 #13). Tiền là chuỗi decimal, id BIGINT là chuỗi, thời điểm ISO 8601 UTC.

/**
 * Thân `POST /admin/payment/unposted-topups/:maGiaoDich/mark-unprocessable` (A4). `lyDo` sau `trim` dài 10 đến 255 (giới hạn của nhật ký `XuLyNapViChuaCong`) và KHÔNG giống bí mật
 * ⇒ `LY_DO_BAT_BUOC`. Khoá lạ ⇒ 400 `TRUONG_KHONG_DUOC_PHEP`.
 */
export class MarkUnprocessableDto {
  // Dùng chung với hoàn đặc biệt (B13): một bộ kiểm cho lý do có ghi nhật ký
  @IsAuditedReason()
  lyDo!: string;
}

/**
 * Thân `POST …/credit` phải RỖNG: số tiền cộng CHỈ lấy từ giao dịch nạp (không nhận số từ thân, NVC-03); khoá lạ (`soTien`…) ⇒ 400 `TRUONG_KHONG_DUOC_PHEP`.
 */
export class CreditUnpostedTopupDto {}

/** Một dòng của hàng đợi (Figma `551:2`): giao dịch nạp cổng đã xác minh `ThanhCong`, chưa cộng ví, đã hết lượt đối soát tự động. */
export interface UnpostedTopup {
  maGiaoDich: string;
  phuongThuc: TopupGateway;
  /** Mã giao dịch của cổng (chỉ Quản trị viên thấy, để đối chiếu với cổng) */
  maGiaoDichCong: string | null;
  benhNhan: { hoTen: string };
  soTien: string;
  /** Thời điểm cổng xác minh = lần thử số 0 (lúc IPN); không có dòng 0 thì là lúc tạo giao dịch */
  thoiDiemXacMinh: string;
  soLanThuTuDong: number;
  toiDaThuTuDong: number;
  /** Lần xử lý gần nhất của Quản trị viên: chưa có ⇒ `ChoXuLy` */
  trangThaiXuLy: 'ChoXuLy' | 'KhongTheXuLy';
  lyDoKhongTheXuLy: string | null;
}

export interface UnpostedTopupAttempt {
  soLanThu: number;
  ketQua: 'ThanhCong' | 'ThatBai' | 'KhongTheXuLy';
  /** Mã lý do của job hay lý do của Quản trị viên */
  lyDo: string | null;
  /** Họ tên Quản trị viên; `null` khi là job */
  nguoiXuLy: string | null;
  thoiDiem: string;
}

export interface UnpostedTopupDetail extends UnpostedTopup {
  lanThu: UnpostedTopupAttempt[];
}

/** Kết quả của hai route ghi (PLAN 5.11 #13): `DaDoiSoat` sau khi cộng, `ChoDoiSoat` sau "Không thể xử lý" (giữ hàng đợi). */
export interface UnpostedTopupHandled {
  maGiaoDich: string;
  trangThaiDoiSoat: 'DaDoiSoat' | 'ChoDoiSoat';
}
