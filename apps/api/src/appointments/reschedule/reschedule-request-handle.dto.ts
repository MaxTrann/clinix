import { applyDecorators } from '@nestjs/common';
import { ValidateBy, ValidateIf } from 'class-validator';
import { BOOKING_FIELD_ERROR_CODES } from '../appointments.constants.js';
import { RequiredReason } from '../status/required-reason.decorator.js';
import { BigintId } from './patient-reschedule.dto.js';

// Thân và kết quả của hai route XỬ LÝ yêu cầu đổi lịch ngoài chính sách: duyệt và từ chối, cho Lễ tân và Quản trị viên (reschedule B9; PLAN reschedule 5.8, Q10; TRACKING reschedule 1.13). Hình dạng kết quả khớp
// bộ đọc NGHIÊM của web F4 và F5: khoá vắng thì VẮNG, không bao giờ `null`; id BIGINT là chuỗi.

// Ký tự điều khiển (Unicode Cc) TRỪ xuống dòng: cùng luật `FORBIDDEN_CONTROL` của `reschedule-reason.ts` (B5, không `export`). `@RequiredReason` KHÔNG chặn nó, nên thêm bộ kiểm cục bộ này. Mã trường là
// `LY_DO_BAT_BUOC` như mọi lỗi khác của ghi chú (web chỉ cần MỘT câu "Ghi chú không hợp lệ"). `\p{Cf}` (ZWJ của emoji ghép) cố ý KHÔNG bị chặn.
const FORBIDDEN_CONTROL = /[^\P{Cc}\n\r]/u;

const NoControlCharacters = () =>
  ValidateBy({
    name: 'hasNoControlCharacters',
    validator: {
      validate: (value: unknown) =>
        typeof value === 'string' && !FORBIDDEN_CONTROL.test(value),
      defaultMessage: () => BOOKING_FIELD_ERROR_CODES.REASON_REQUIRED,
    },
  });

/**
 * Ghi chú xử lý (BẮT BUỘC cho cả duyệt và từ chối; Q10: Bệnh nhân đọc NGUYÊN VĂN ghi chú này, nên ô nhập cần dòng nhắc "Bệnh nhân sẽ đọc ghi chú này"). CÙNG bộ kiểm với đổi hộ (B7) và override (B14): `@RequiredReason`
 * (cắt bằng `String.trim()`, 1 đến `CANCEL_REASON_MAX_LENGTH` = 255 đơn vị UTF-16, chữ mà `redactText` che bị chặn) cộng bộ kiểm ký tự điều khiển. Luật Audit của P2 (`staffText`: `trim()` còn ít nhất 1 ký tự, tối đa
 * 255 đơn vị UTF-16, không bị `redactText` che) KHÔNG BAO GIỜ chặt hơn DTO, nên `AuditService.record` không ném vì ghi chú đã qua DTO. Dùng `normalizeRequestReason` của B5 thì sai (đếm theo điểm mã, chỉ cắt khoảng
 * trắng ASCII: "255 emoji" và "chỉ U+00A0" lọt DTO rồi bị Audit ném ⇒ hoàn tác ⇒ 500). Mọi lỗi của trường này ra `loi[{ truong: 'ghiChu', ma: 'LY_DO_BAT_BUOC' }]`.
 */
const handlingNote = () =>
  applyDecorators(
    RequiredReason({ rejectSecrets: true }),
    NoControlCharacters(),
  );

/**
 * Thân của `POST …/reschedule-requests/:yeuCauId/approve`. CHỈ hai trường: chi nhánh của người xử lý lấy từ phạm vi (DB), yêu cầu từ đường dẫn, nên `chiNhanhId`, `yeuCauId`, `trangThai`, `lyDoYeuCau`, `benhNhanId`…
 * hay khoá lạ khác là 400 `DU_LIEU_KHONG_HOP_LE` với `loi[].ma` `TRUONG_KHONG_DUOC_PHEP` (`forbidNonWhitelisted`).
 * `khungGioId` TUỲ CHỌN, là khung giờ THAY THẾ cho khung giờ mong muốn của yêu cầu (PLAN 5.7, Q7 (g)): VẮNG thì duyệt vào khung giờ mong muốn. Chỉ VẮNG mới được bỏ qua: `null` là 400 `IS_BIGINT_ID` (khác
 * `@IsOptional`, coi `null` là vắng), cùng số JSON, chuỗi rỗng, `0`, số 0 đứng đầu, vượt BIGINT.
 */
export class ApproveRescheduleRequestDto {
  @handlingNote()
  ghiChu!: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @BigintId()
  khungGioId?: string;
}

/** Thân của `POST …/reschedule-requests/:yeuCauId/reject`: CHỈ `ghiChu` (cùng bộ kiểm với duyệt). Không có khung giờ nào để chọn. */
export class RejectRescheduleRequestDto {
  @handlingNote()
  ghiChu!: string;
}

/** Đầu vào của dịch vụ (đã qua DTO). Controller chuyển TƯỜNG MINH từng trường. */
export interface ApproveRescheduleRequestInput {
  ghiChu: string;
  khungGioId?: string;
}
export interface RejectRescheduleRequestInput {
  ghiChu: string;
}

/**
 * 200 khi đã duyệt: ĐÚNG ba khoá. `lichHenMoi` cùng dạng của B6 (`trangThai` của lịch mới luôn `DaXacNhan`: B4 chèn thẳng `DaXacNhan`, cọc đã thu). KHÔNG `lichHenCu`, `yeuCauId` (web đã biết), `lich_hen_id`, tên, SĐT,
 * email hay ghi chú thô. `thoiGianMayChu` là `nowVN().toISOString()` lấy SAU commit, giữ mili giây.
 */
export interface ApproveRescheduleRequestResult {
  yeuCau: { trangThai: 'DaDuyet' };
  lichHenMoi: { maLichHen: string; thoiGian: string; trangThai: 'DaXacNhan' };
  thoiGianMayChu: string;
}

/** 200 khi đã từ chối: ĐÚNG hai khoá. Lịch gốc và khung giờ không đổi, nên không có `lichHenMoi`. */
export interface RejectRescheduleRequestResult {
  yeuCau: { trangThai: 'TuChoi' };
  thoiGianMayChu: string;
}
