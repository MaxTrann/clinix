import type {
  RescheduleCandidate,
  RescheduleCurrent,
} from '../../common/reschedule-payload';

// Kiểu dữ liệu của Lễ tân đổi lịch HỘ bệnh nhân (reschedule F3; hợp đồng THẬT của B7: TRACKING mục 7 khối B7, PLAN reschedule 5.8). `lichCu` và `lichMoi` GIỐNG preview của Bệnh nhân nên dùng chung kiểu ở
// `common/reschedule-payload.ts`. Id (`bacSiId`, `khungGioId`) là BIGINT dạng CHUỖI, không bao giờ ép sang `number`. Giờ là ISO 8601 UTC, hiển thị theo giờ Việt Nam.

// Kết quả xem trước `GET /reception/appointments/:maLichHen/reschedule-preview[?khungGioId=]`: ĐÚNG sáu khoá. KHÁC Bệnh nhân ở chỗ KHÔNG có `loai`, `soLanDaDoi`, `soLanToiDa` (đổi hộ không có hạn mức tự đổi):
// bộ đọc không đọc và không chép chúng ra. `choPhepDoi = false` ⇒ `lyDoKhongDoi` là mã lỗi (`maLoi`) của PLAN 5.13; web chọn câu theo mã, không theo chữ. `coYeuCauChoDuyet = true` KHÔNG chặn đổi hộ (KDL-19).
export interface ReceptionReschedulePreview {
  choPhepDoi: boolean;
  lyDoKhongDoi?: string;
  coYeuCauChoDuyet: boolean;
  lichCu: RescheduleCurrent;
  lichMoi: RescheduleCandidate | null;
  // ISO 8601 UTC, giữ mili giây; web chưa dùng
  thoiGianMayChu: string;
}

// Thân `POST /reception/appointments/:maLichHen/reschedule`: ĐÚNG hai khoá. `lyDo` đã `trim()`, 1 đến 255 đơn vị UTF-16 (Q9). KHÔNG `lyDoYeuCau`, `chiNhanhId`, `benhNhanId`: khoá lạ ⇒ 400 `TRUONG_KHONG_DUOC_PHEP`.
export interface ReceptionRescheduleInput {
  khungGioId: string;
  lyDo: string;
}
