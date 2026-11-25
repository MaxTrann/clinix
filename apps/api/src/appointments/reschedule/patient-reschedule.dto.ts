import { Transform } from 'class-transformer';
import { IsOptional, IsString, ValidateBy } from 'class-validator';
import { isBigintId } from '../lists/list-query.rules.js';
import { normalizeRequestReason } from './reschedule-reason.js';

// Thân, query và kết quả của hai route đổi lịch của Bệnh nhân (reschedule B6; PLAN reschedule 5.8; TRACKING reschedule 1.10). Hình dạng khớp HỢP ĐỒNG WEB F1 (web đọc NGHIÊM): khoá vắng thì VẮNG, không bao giờ `null`.

// Id BIGINT dạng CHUỖI (id lớn hơn 2^53 mà ép `Number` sẽ trỏ nhầm dòng khác): số JSON, chuỗi rỗng, có khoảng trắng, `0`, số 0 đứng đầu, vượt BIGINT đều bị từ chối. Tên ràng buộc `isBigintId` ⇒ mã
// lỗi trường `IS_BIGINT_ID` (đúng nếp `create/booking-checks.dto.ts`, `lists/`). Viết lại ở đây (8 dòng) vì `create/` không thuộc phạm vi B6; chỗ định nghĩa id thật là `isBigintId`.
export const BigintId = () =>
  ValidateBy({
    name: 'isBigintId',
    validator: {
      validate: (value: unknown) => isBigintId(value),
      defaultMessage: () => 'isBigintId',
    },
  });

/**
 * Thân của `POST /patient/appointments/:maLichHen/reschedule`. CHỈ hai trường: chủ sở hữu lấy từ access token, nên `benhNhanId`, `accountId`, `trangThai`… hay khoá lạ khác là 400
 * `DU_LIEU_KHONG_HOP_LE` với `loi[].ma` `TRUONG_KHONG_DUOC_PHEP` (`forbidNonWhitelisted`).
 * `lyDoYeuCau` TUỲ CHỌN: vắng, `null`, rỗng hay chỉ khoảng trắng ⇒ VẮNG; còn lại chuẩn hoá bằng `normalizeRequestReason` của B5 (NFC rồi cắt khoảng trắng ASCII). DTO CỐ Ý KHÔNG kiểm độ dài 5 đến 500: lý do
 * chỉ dùng khi Bệnh nhân đã hết lần tự đổi và DLH-11 yêu cầu "chỉ khi dùng đến" (còn lần thì lý do thừa bị bỏ qua); độ dài do `RescheduleRequestService.create` kiểm bằng chính `isValidRequestReason`.
 * Sai KIỂU (số, đối tượng, mảng) ⇒ 400 `IS_STRING` ở đây luôn.
 */
export class PatientRescheduleDto {
  @BigintId()
  khungGioId!: string;

  @Transform(({ value }: { value: unknown }) => {
    if (value === null) return undefined;
    if (typeof value !== 'string') return value;
    const reason = normalizeRequestReason(value);
    return reason === '' ? undefined : reason;
  })
  @IsOptional()
  @IsString()
  lyDoYeuCau?: string;
}

/** Query của `GET …/reschedule-preview`: `khungGioId` TUỲ CHỌN (không có thì chỉ trả điều kiện đổi); cùng ràng buộc id như thân POST. Khoá lạ hay lặp khoá (mảng) ⇒ 400. */
export class ReschedulePreviewQueryDto {
  @IsOptional()
  @BigintId()
  khungGioId?: string;
}

/** Khung giờ mới của preview (chỉ có khi hỏi kèm `khungGioId`): `lyDoKhongHopLe` VẮNG khi `hopLe = true` (web từ chối `null`). */
export interface ReschedulePreviewCandidate {
  khungGioId: string;
  /** ISO 8601 UTC, giữ mili giây */
  thoiGian: string;
  hopLe: boolean;
  lyDoKhongHopLe?: string;
}

/**
 * Kết quả 200 của `GET …/reschedule-preview`: đúng các khoá dưới đây, không khoá nào khác (hợp đồng web F1 điểm 1 đến 7). `lyDoKhongDoi` là chuỗi `maLoi` của PLAN 5.13, VẮNG khi `choPhepDoi = true`.
 * `loai = 'GuiYeuCau'` khi đã hết lần tự đổi, kể cả khi chưa có `khungGioId`. `lichCu` đúng hai khoá; `bacSiId` là id BIGINT dạng chuỗi.
 */
export interface ReschedulePreviewResult {
  choPhepDoi: boolean;
  lyDoKhongDoi?: string;
  loai: 'TuDoi' | 'GuiYeuCau';
  soLanDaDoi: number;
  soLanToiDa: number;
  coYeuCauChoDuyet: boolean;
  lichCu: { thoiGian: string; bacSiId: string };
  lichMoi: ReschedulePreviewCandidate | null;
  /** `nowVN().toISOString()` lấy SAU khi giao dịch đọc đã đóng, giữ mili giây */
  thoiGianMayChu: string;
}

/** 201 khi đã đổi ngay. KHÔNG `lich_hen_id`: chỉ mã lịch. `trangThai` của lịch mới luôn là `DaXacNhan` (B4 chèn thẳng `DaXacNhan`). */
export interface RescheduledResult {
  ketQua: 'DaDoi';
  lichHenMoi: { maLichHen: string; thoiGian: string; trangThai: 'DaXacNhan' };
  lichHenCu: { maLichHen: string };
  thoiGianMayChu: string;
}

/** 201 khi đã gửi yêu cầu (đã hết lần tự đổi và có lý do). KHÔNG đưa id yêu cầu ra API Bệnh nhân. */
export interface RequestSentResult {
  ketQua: 'DaGuiYeuCau';
  yeuCau: { trangThai: 'ChoDuyet'; thoiGianMongMuon: string };
  thoiGianMayChu: string;
}

export type RescheduleResult = RescheduledResult | RequestSentResult;
