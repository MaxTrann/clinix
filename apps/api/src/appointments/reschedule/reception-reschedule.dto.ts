import { RequiredReason } from '../status/required-reason.decorator.js';
import {
  BigintId,
  type ReschedulePreviewCandidate,
} from './patient-reschedule.dto.js';

// Thân và kết quả của hai route đổi lịch HỘ của Lễ tân (reschedule B7; PLAN reschedule 5.8, Q9; TRACKING reschedule 1.11). Query của GET dùng lại `ReschedulePreviewQueryDto` của B6; kết quả 201 của POST dùng lại
// `RescheduledResult` của B6 (cùng bốn khoá). Hình dạng preview khớp hợp đồng F3: khoá vắng thì VẮNG, không bao giờ `null`.

/**
 * Thân của `POST /reception/appointments/:maLichHen/reschedule`. CHỈ hai trường: chi nhánh của Lễ tân lấy từ `ReceptionScopeService` và chủ lịch từ DB, nên `chiNhanhId`, `benhNhanId`, `lyDoYeuCau`… hay khoá lạ
 * khác là 400 `DU_LIEU_KHONG_HOP_LE` với `loi[].ma` `TRUONG_KHONG_DUOC_PHEP` (`forbidNonWhitelisted`).
 * `lyDo` BẮT BUỘC (Q9, 1 đến 255 ký tự): CÙNG bộ kiểm với Quản trị viên override (`RequiredReason`, B14), vì lý do này đi vào nhật ký `DoiLichHo.ly_do`. Luật Audit của P2 đòi `String.trim()` còn ít nhất 1 ký tự, tối đa 255
 * đơn vị UTF-16 và chữ không bị `redactText` che; nếu DTO nới hơn (ví dụ `normalizeRequestReason` của B5 đếm theo điểm mã và chỉ cắt khoảng trắng ASCII) thì `AuditService.record` ném NGAY trong giao dịch và đổi lịch bị hoàn tác
 * ra 500. `RequiredReason` (cắt bằng `trim()`, 1 đến `CANCEL_REASON_MAX_LENGTH` = 255 đơn vị UTF-16, `rejectSecrets`) luôn chặt hơn hoặc bằng luật Audit; thiếu, `null`, số, rỗng, chỉ khoảng trắng, quá dài hay giống bí mật ⇒
 * `loi[].ma` `LY_DO_BAT_BUOC`.
 */
export class ReceptionRescheduleDto {
  @BigintId()
  khungGioId!: string;

  @RequiredReason({ rejectSecrets: true })
  lyDo!: string;
}

/**
 * Kết quả 200 của `GET …/reschedule-preview` (đổi hộ): đúng các khoá dưới đây, không khoá nào khác. Khác preview của Bệnh nhân ở chỗ KHÔNG có `loai`, `soLanDaDoi`, `soLanToiDa` (Lễ tân đổi hộ không bị hạn mức tự
 * đổi, PLAN 5.8). `lyDoKhongDoi` là chuỗi `maLoi` (PLAN 5.13), VẮNG khi `choPhepDoi = true`. `lichCu` đúng hai khoá; `bacSiId` (id BIGINT dạng chuỗi) để web dựng lưới khung giờ của đúng bác sĩ. `coYeuCauChoDuyet`:
 * lịch đang có yêu cầu `ChoDuyet`; KHÔNG chặn đổi hộ (KDL-19).
 */
export interface ReceptionReschedulePreviewResult {
  choPhepDoi: boolean;
  lyDoKhongDoi?: string;
  coYeuCauChoDuyet: boolean;
  lichCu: { thoiGian: string; bacSiId: string };
  lichMoi: ReschedulePreviewCandidate | null;
  /** `nowVN().toISOString()` lấy SAU khi giao dịch đọc đã đóng, giữ mili giây */
  thoiGianMayChu: string;
}
