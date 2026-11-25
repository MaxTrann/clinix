import type { TrangThaiYeuCauDoiLich } from '../../admin/entities/enums.js';
import type { RescheduleFailure } from './reschedule.types.js';

// Kiểu của việc TẠO yêu cầu đổi lịch ngoài chính sách (reschedule B5; PLAN reschedule 5.5 bước 4, 5.7). Chỉ KIỂU. Để riêng khỏi `reschedule.types.ts`: file đó là của B2 và B4 sẽ thêm `RescheduleInput`,
// `RescheduleOutcome` vào đó.

export interface CreateRescheduleRequestInput {
  /** Đã qua `ParseAppointmentCodePipe` (B6) */
  maLichHen: string;
  /** Id BIGINT dạng chuỗi (có thể lớn hơn 2^53) */
  khungGioMongMuonId: string;
  /** Chữ thô của Bệnh nhân; dịch vụ chuẩn hoá và kiểm 5 đến 500 điểm mã (`reschedule-reason.ts`) */
  lyDoYeuCau: string;
  /** Tài khoản Bệnh nhân từ access token: chủ lịch (`lich_hen.benh_nhan_id`) và cũng là người nhận thông báo */
  accountId: string;
}

/**
 *  - `RequestCreated`: đã ghi yêu cầu `ChoDuyet` và thông báo `YeuCauDoiLichDangCho`; lịch cũ và mọi khung giờ KHÔNG đổi (Q7 (f)). `thoiGianMongMuon` là giờ của khung giờ mong muốn, để B6 trả
 *    `yeuCau.thoiGianMongMuon` mà không đọc lại.
 *  - `NotOverQuota`: lịch còn lần tự đổi (cấu hình `toiDa` đã đổi giữa lần đọc của B4 và của B5): KHÔNG ghi gì; B6 quay về B4. Không có HTTP và không có `maLoi`: kết quả nội bộ.
 *  - `Rejected`: từ chối có kiểu (404 hay 409 theo `failure`, mã ở PLAN 5.13), không ghi gì.
 * Lỗi sau lần ghi đầu tiên (`INSERT`, `notify`) không phải kết quả: NÉM để hoàn tác trọn rồi đi ra nguyên.
 */
export type CreateRescheduleRequestOutcome =
  | { kind: 'RequestCreated'; yeuCauId: string; thoiGianMongMuon: Date }
  | { kind: 'NotOverQuota'; soLanDaDoi: number; toiDa: number }
  | { kind: 'Rejected'; failure: RescheduleFailure };

/** Yêu cầu MỚI NHẤT của một lịch cho chi tiết lịch Bệnh nhân (danh sách trắng: không `ly_do_yeu_cau`, không id, không người xử lý). `ISO 8601 UTC`, giữ mili giây. */
export interface PatientRescheduleRequest {
  trangThai: TrangThaiYeuCauDoiLich;
  thoiGianMongMuon: string;
  ghiChuXuLy: string | null;
  thoiDiemTao: string;
}

/** Kết quả của `RescheduleRequestRepository.findLatest`: giờ đã đổi sang `Date` từ chuỗi giờ Việt Nam nguyên văn (H13); chỉ bốn cột của danh sách trắng. */
export interface LatestRescheduleRequest {
  trangThai: TrangThaiYeuCauDoiLich;
  thoiGianMongMuon: Date;
  ghiChuXuLy: string | null;
  thoiDiemTao: Date;
}
