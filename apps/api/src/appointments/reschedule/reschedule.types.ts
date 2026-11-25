import type { EntityManager } from 'typeorm';
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

// ───────────────────────── Hợp đồng của `AppointmentRescheduleService` (reschedule B4; PLAN reschedule 5.5) ─────────────────────────
// B6 (Bệnh nhân), B7 (Lễ tân đổi hộ) và B9 (duyệt yêu cầu) dùng NGUYÊN các kiểu dưới đây. `actor` là `RescheduleActor` của B2 (phạm vi chi nhánh; id người thao tác chỉ B7 và B9 cần cho Audit nên nằm
// trong closure `afterWrite` của họ).

/** Việc đã ghi, đưa cho `afterWrite` để B7 và B9 ghi Audit hay cập nhật yêu cầu bằng đúng thông tin của lần đổi này. Mọi id là chuỗi (BIGINT). */
export interface RescheduleWritten {
  lichHenCuId: string;
  lichHenMoiId: string;
  maLichHenCu: string;
  maLichHenMoi: string;
  khungGioCuId: string;
  khungGioMoiId: string;
  chiNhanhId: string;
  thoiGianCu: Date;
  thoiGianMoi: Date;
}

/**
 * Điểm cắm của B7 (Audit `DoiLichHo`) và B9 (`UPDATE` yêu cầu `DaDuyet`, Audit `XuLyDoiLichNgoaiChinhSach`): chạy TRONG giao dịch của lần đổi, SAU `markReplaced` và TRƯỚC thông báo, bằng `em` của giao dịch
 * (tầng 7 của thứ tự khoá: ghi nhật ký sau mọi hàng đã khoá). Ném ⇒ hoàn tác TRỌN (lịch mới, khung giờ, thông báo). Thân giao dịch có thể chạy LẠI (1213, 1205) nên hàm này không được giữ trạng thái giữa các lần.
 */
export type RescheduleAfterWrite = (
  em: EntityManager,
  written: RescheduleWritten,
) => Promise<void>;

/**
 * Đầu vào của `AppointmentRescheduleService.reschedule`. `TuDoi` không có điểm cắm (không ghi Audit, PLAN 5.11); `DoiHo` và `DuyetYeuCau` BẮT BUỘC có `afterWrite` (quên là lỗi biên dịch). `lyDo` của đổi hộ
 * (1 đến 255 ký tự, đã chuẩn hoá ở DTO của B7) đi vào thông báo cho Bệnh nhân (Q9); `ghiChu` của duyệt (đã chuẩn hoá ở DTO của B9) đi nguyên văn tới Bệnh nhân (Q10). Nhánh gửi YÊU CẦU khi hết lần tự đổi KHÔNG ở đây:
 * `OverQuota` trả về và B6 chuyển sang B5.
 */
export type RescheduleInput = {
  maLichHen: string;
  khungGioMoiId: string;
} & (
  | { actor: Extract<RescheduleActor, { via: 'TuDoi' }> }
  | {
      actor: Extract<RescheduleActor, { via: 'DoiHo' }>;
      lyDo: string;
      afterWrite: RescheduleAfterWrite;
    }
  | {
      actor: Extract<RescheduleActor, { via: 'DuyetYeuCau' }>;
      yeuCauId: string;
      ghiChu: string;
      afterWrite: RescheduleAfterWrite;
    }
);

/**
 * Từ chối CÓ KIỂU của dịch vụ: các kiểu của bộ luật (`RescheduleFailure`, ánh xạ sang lỗi API ở `rescheduleFailureException`) cộng hai kiểu riêng của DUYỆT. Hai kiểu sau CHƯA có mã HTTP ở
 * `appointments.constants.ts` (`YEU_CAU_DOI_LICH_KHONG_TON_TAI` 404, `YEU_CAU_DA_XU_LY` 409, PLAN 5.13): B9 thêm mã và ánh xạ.
 */
export type RescheduleRejection =
  RescheduleFailure | { kind: 'RequestNotFound' } | { kind: 'RequestHandled' };

export type RescheduleOutcome =
  | {
      kind: 'Rescheduled';
      maLichHenCu: string;
      maLichHenMoi: string;
      thoiGianMoi: Date;
    }
  /** `TuDoi` đã dùng hết lần tự đổi (`so_lan_tu_doi_lich >= toiDa`): KHÔNG khoá, KHÔNG ghi gì. B6 có lý do thì gọi B5 tạo yêu cầu, thiếu thì 409 `VUOT_SO_LAN_TU_DOI` kèm `soLanDaDoi` và `toiDa`. */
  | { kind: 'OverQuota'; soLanDaDoi: number; toiDa: number }
  /** Từ chối TRƯỚC lần ghi đầu tiên (giao dịch commit rỗng hay chưa mở), hoặc lỗi đã lường trước SAU lần ghi (giao dịch đã hoàn tác trọn, đổi sang kiểu này khi đã đóng) */
  | { kind: 'Rejected'; failure: RescheduleRejection };
