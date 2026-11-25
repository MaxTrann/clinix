import type { TrangThaiYeuCauDoiLich } from '../../admin/entities/enums.js';

// Kiểu của đường GHI (duyệt, từ chối) yêu cầu đổi lịch ngoài chính sách (reschedule B9; PLAN reschedule 5.7, 5.8; TRACKING reschedule 1.13). Chỉ KIỂU. Để riêng khỏi `reschedule-request.types.ts` (B5) và
// `reschedule-request-list.types.ts` (B8) để B9 chỉ THÊM file, không sửa file của hai task kia.

/**
 * Hàng MỘT yêu cầu mà đường ghi cần: đủ để chọn lịch gốc cho lõi đổi lịch (`maLichHen`), chọn khung giờ đích mặc định (`khungGioMongMuonId`), gửi thông báo từ chối đúng tài khoản ĐẶT (`benhNhanId`) và ghi Audit
 * đúng chi nhánh của lịch (`chiNhanhId`). Mọi id là chuỗi (BIGINT, có thể lớn hơn 2^53). KHÔNG ra JSON: không có đường nào trả hàng này cho client. `thoiGianMongMuon` là giờ của khung giờ MONG MUỐN GỐC.
 */
export interface RescheduleRequestHandlingRow {
  yeuCauId: string;
  trangThai: TrangThaiYeuCauDoiLich;
  lichHenId: string;
  maLichHen: string;
  benhNhanId: string;
  chiNhanhId: string;
  khungGioMongMuonId: string;
  thoiGianMongMuon: Date;
}

/** Kết quả xử lý ghi vào yêu cầu (duyệt hay từ chối): `ghiChu` đã chuẩn hoá ở DTO, `thoiDiemXuLy` là MỘT mốc của người gọi (cắt xuống giây khi ghi). */
export interface RequestHandlingMark {
  yeuCauId: string;
  ghiChu: string;
  nguoiXuLyId: string;
  thoiDiemXuLy: Date;
}
