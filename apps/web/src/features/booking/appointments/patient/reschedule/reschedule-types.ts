import type {
  RescheduleCandidate,
  RescheduleCurrent,
  RescheduleDone,
} from '../../common/reschedule-payload';

// Kiểu dữ liệu của trang đổi lịch hẹn của Bệnh nhân (reschedule F1; hợp đồng `GET /patient/appointments/:maLichHen/reschedule-preview` ở PLAN reschedule 5.8).
// Id (`bacSiId`, `khungGioId`) là BIGINT dạng CHUỖI: không bao giờ ép sang `number` (id lớn hơn 2^53 sẽ trỏ nhầm). Giờ là ISO 8601 UTC, hiển thị theo giờ Việt Nam.

// `TuDoi`: còn lần tự đổi (đổi ngay). `GuiYeuCau`: hết lần tự đổi, đổi lịch trở thành yêu cầu cho Lễ tân duyệt (cần lý do; việc của F2).
export const RESCHEDULE_KINDS = ['TuDoi', 'GuiYeuCau'] as const;
export type RescheduleKind = (typeof RESCHEDULE_KINDS)[number];

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

// 201 khi đã gửi yêu cầu (đã hết lần tự đổi). KHÔNG có `yeuCauId`: bộ đọc không bao giờ chép khoá lạ.
export interface RescheduleRequestSent {
  ketQua: 'DaGuiYeuCau';
  yeuCau: { trangThai: 'ChoDuyet'; thoiGianMongMuon: string };
  thoiGianMayChu: string;
}

export type RescheduleResult = RescheduleDone | RescheduleRequestSent;
