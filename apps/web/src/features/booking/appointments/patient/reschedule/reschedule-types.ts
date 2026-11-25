// Kiểu dữ liệu của trang đổi lịch hẹn của Bệnh nhân (reschedule F1; hợp đồng `GET /patient/appointments/:maLichHen/reschedule-preview` ở PLAN reschedule 5.8).
// Id (`bacSiId`, `khungGioId`) là BIGINT dạng CHUỖI: không bao giờ ép sang `number` (id lớn hơn 2^53 sẽ trỏ nhầm). Giờ là ISO 8601 UTC, hiển thị theo giờ Việt Nam.

// `TuDoi`: còn lần tự đổi (đổi ngay). `GuiYeuCau`: hết lần tự đổi, đổi lịch trở thành yêu cầu cho Lễ tân duyệt (cần lý do; việc của F2).
export const RESCHEDULE_KINDS = ['TuDoi', 'GuiYeuCau'] as const;
export type RescheduleKind = (typeof RESCHEDULE_KINDS)[number];

// Lịch hiện tại. `bacSiId` là chỗ Đại chốt 25/11/2026 (câu A): web cần id bác sĩ để gọi lưới khung giờ, chi tiết lịch chỉ có TÊN. Backend B6 phải trả khoá này.
export interface RescheduleCurrent {
  thoiGian: string;
  bacSiId: string;
}

// Khung giờ mới đã chọn (chỉ có khi hỏi kèm `khungGioId`, việc của F2). `hopLe = false` ⇒ có thể kèm `lyDoKhongHopLe` là mã lỗi.
export interface RescheduleCandidate {
  khungGioId: string;
  thoiGian: string;
  hopLe: boolean;
  lyDoKhongHopLe?: string;
}

// Kết quả xem trước. `choPhepDoi = false` ⇒ `lyDoKhongDoi` là mã lỗi (`maLoi`) của PLAN 5.13; web chọn câu theo mã, không theo chữ.
export interface ReschedulePreview {
  choPhepDoi: boolean;
  lyDoKhongDoi?: string;
  loai: RescheduleKind;
  soLanDaDoi: number;
  soLanToiDa: number;
  coYeuCauChoDuyet: boolean;
  lichCu: RescheduleCurrent;
  lichMoi: RescheduleCandidate | null;
  // ISO 8601 UTC; F1 chưa dùng
  thoiGianMayChu: string;
}

// ---- Gửi đổi lịch (reschedule F2; hợp đồng `POST /patient/appointments/:maLichHen/reschedule` của B6, PLAN reschedule 5.8) ----

// Thân gửi: `khungGioId` luôn có (chuỗi id); `lyDoYeuCau` CHỈ khi hết lần tự đổi (đã chuẩn hoá, 5 đến 500 điểm mã), vắng ở `TuDoi`.
export interface RescheduleSubmitInput {
  khungGioId: string;
  lyDoYeuCau?: string;
}

// 201 khi đã đổi ngay. Chỉ mã lịch, không id nội bộ. `trangThai` của lịch mới do máy chủ trả (B6: luôn `DaXacNhan`), web không dùng để quyết gì.
export interface RescheduleDone {
  ketQua: 'DaDoi';
  lichHenMoi: { maLichHen: string; thoiGian: string; trangThai: string };
  lichHenCu: { maLichHen: string };
  thoiGianMayChu: string;
}

// 201 khi đã gửi yêu cầu (đã hết lần tự đổi). KHÔNG có `yeuCauId`: bộ đọc không bao giờ chép khoá lạ.
export interface RescheduleRequestSent {
  ketQua: 'DaGuiYeuCau';
  yeuCau: { trangThai: 'ChoDuyet'; thoiGianMongMuon: string };
  thoiGianMayChu: string;
}

export type RescheduleResult = RescheduleDone | RescheduleRequestSent;
