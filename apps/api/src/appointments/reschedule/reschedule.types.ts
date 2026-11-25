import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import type { BookingErrorCode } from '../appointments.constants.js';
import type {
  BookabilityFacts,
  LapsedHoldRef,
} from '../slots/bookability.rules.js';

// Kiểu của bộ luật "đổi lịch được không" (reschedule B2; PLAN reschedule 5.5 và 5.6). Chỉ KIỂU: không có giá trị lúc chạy.

/**
 * Ai đổi và trong phạm vi nào, GẮN với `via` để không ghép nhầm (ví dụ Lễ tân mà mang phạm vi chủ lịch):
 *  - `TuDoi`: Bệnh nhân, chỉ lịch của chính mình (`benh_nhan_id` = `accountId`);
 *  - `DoiHo`: Lễ tân, chỉ lịch của chi nhánh được gán;
 *  - `DuyetYeuCau`: Lễ tân hoặc Quản trị viên Chi nhánh (`chiNhanhId` là chuỗi), hoặc Quản trị viên Toàn hệ thống (`chiNhanhId = null`).
 * B7, B8, B9 đổi vai trò của họ sang đây; B2 không đọc `rbac`.
 */
export type RescheduleActor =
  | { via: 'TuDoi'; accountId: string }
  | { via: 'DoiHo'; chiNhanhId: string }
  | { via: 'DuyetYeuCau'; chiNhanhId: string | null };

export type RescheduleVia = RescheduleActor['via'];

/** Ba giá trị của `cau_hinh_he_thong` mà đổi lịch dùng; chỉ có từ `RescheduleReader.config()` (thiếu ⇒ 409, không số ngầm). */
export interface RescheduleConfig {
  soLanTuDoiLichToiDa: number;
  checkInSauPhut: number;
  soLichHenToiDaMoiHoSo: number;
}

/** Lịch hẹn CŨ (lịch đang đổi). Mọi id là chuỗi (BIGINT); `thoiGian` là `Date` (so bằng `getTime()`, không so chuỗi). */
export interface RescheduleSource {
  lichHenId: string;
  maLichHen: string;
  benhNhanId: string;
  /** `null` là hồ sơ bản thân */
  hoSoNguoiThanId: string | null;
  bacSiId: string;
  chiNhanhId: string;
  dichVuKhamId: string;
  khungGioId: string;
  trangThai: TrangThaiLichHen;
  thoiGian: Date;
  soLanTuDoiLich: number;
}

/**
 * Dữ kiện cho `evaluateReschedulability`. `source` đã lọc theo phạm vi của `actor` (`null` = không có, của người khác hay ngoài phạm vi: CÙNG một kết quả, không lộ gì); khi `source`
 * là `null` các trường còn lại chỉ là giá trị điền chỗ, luật không đọc.
 */
export interface ReschedulabilityFacts {
  actor: RescheduleActor;
  /** Mốc duy nhất của luồng, đã `toSecond(nowVN())` */
  now: Date;
  config: Pick<RescheduleConfig, 'soLanTuDoiLichToiDa' | 'checkInSauPhut'>;
  source: RescheduleSource | null;
  /** Hồ sơ người thân của lịch còn hiệu lực (hồ sơ bản thân luôn `true`) */
  profileActive: boolean;
  /** Số lịch của chuỗi `lich_hen_truoc_id` chứa lịch cũ, KỂ CẢ lịch cũ; tối đa `MAX_CHAIN_DEPTH` (câu đọc bị chặn) */
  chainLength: number;
  /** Dữ kiện của `BookabilityReader` cho khung giờ ĐÍCH (đã có `thayThe`); `null` = không có khung giờ đích */
  bookability: BookabilityFacts | null;
  /** Bệnh nhân đã nhập lý do yêu cầu (chỉ quan trọng khi `TuDoi` hết lần tự đổi) */
  requestReasonGiven: boolean;
  /** Lịch cũ đang có yêu cầu đổi lịch `ChoDuyet` */
  pendingRequest: boolean;
}

/**
 * Lý do từ chối CÓ KIỂU (nếp `BookingFailure`): luật không ném `AppException`; B4 và B6 đổi sang lỗi API SAU khi giao dịch đóng.
 *  - `NotFound`: 404 `KHONG_TIM_THAY` (không có lịch, của người khác, ngoài phạm vi, hoặc Bệnh nhân gặp lịch `DaDoiLich`; cùng một thân);
 *  - `ProfileInactive`: 409 `HO_SO_NGUOI_THAN_DA_NGUNG`; `SlotNotFound`: 404 `KHUNG_GIO_KHONG_TON_TAI`;
 *  - `Rule`: một mã của `BOOKING_ERROR_CODES` (HTTP ở `BOOKING_ERRORS`), `chiTiet` đã qua danh sách trắng.
 */
export type RescheduleFailure =
  | { kind: 'NotFound' }
  | { kind: 'ProfileInactive' }
  | { kind: 'SlotNotFound' }
  | { kind: 'Rule'; code: BookingErrorCode; chiTiet?: unknown };

/**
 * `branch`: `Reschedule` = đổi ngay (tự đổi còn lần, đổi hộ, duyệt); `Request` = `TuDoi` hết lần tự đổi và đã có lý do, chuyển thành yêu cầu cho Lễ tân (B5).
 * `lapsedHold`: khung giờ đích `DangGiuCho` đã quá hạn, coi là trống nhưng người ghi (B4) phải hết hạn lười trước khi đặt.
 */
export type ReschedulabilityVerdict =
  | {
      ok: true;
      branch: 'Reschedule' | 'Request';
      lapsedHold: LapsedHoldRef | null;
    }
  | { ok: false; failure: RescheduleFailure };
