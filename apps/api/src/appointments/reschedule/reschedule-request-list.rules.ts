import {
  TRANG_THAI_YEU_CAU_DOI_LICH,
  type TrangThaiYeuCauDoiLich,
} from '../../admin/entities/enums.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { isBigintId } from '../lists/list-query.rules.js';
import type { ListOrder } from '../lists/list-query.sql.js';
import {
  failureCode,
  type RescheduleAvailability,
} from './reschedulability.rules.js';
import type { RescheduleActor } from './reschedule.types.js';

// Hàm THUẦN của danh sách và chi tiết yêu cầu đổi lịch cho nhân sự (reschedule B8; PLAN reschedule 5.7). Không DB, không Nest, không đồng hồ. B9 (duyệt, từ chối) dùng lại `parseRescheduleRequestId` và
// `approverActor` để đọc yêu cầu và chọn phạm vi CÙNG một cách với B8, không viết lần hai.

/** `lyDoKhongDuyet` của yêu cầu đã xử lý (`DaDuyet` hay `TuChoi`): trùng chữ mã `YEU_CAU_DA_XU_LY` của PLAN 5.13 mà B9 thêm vào `appointments.constants.ts`. */
export const REQUEST_HANDLED_CODE = 'YEU_CAU_DA_XU_LY';
/** `lyDoKhongDuyet` khi chưa có `cau_hinh_he_thong` (không có `check_in_sau_phut` để tính hạn): chi tiết vẫn đọc được, 409 là của route ghi. */
export const CONFIG_MISSING_CODE = 'HE_THONG_CHUA_CAU_HINH';

/**
 * Id yêu cầu ở đường dẫn: BIGINT dương dạng CHUỖI (không ép `Number`: id lớn hơn 2^53 sẽ trỏ nhầm hàng). Sai dạng ⇒ `null`, người gọi trả CÙNG 404 với "không có" và "ngoài phạm vi".
 * Nhận `unknown` vì giá trị đến từ đường dẫn chưa qua pipe nào.
 */
export function parseRescheduleRequestId(raw: unknown): string | null {
  return isBigintId(raw) ? raw : null;
}

/** Tập trạng thái cuối cùng: mặc định `ChoDuyet` (PLAN 5.7), bỏ trùng, THEO THỨ TỰ CHUẨN của ENUM nên câu SQL không phụ thuộc thứ tự khách gửi. */
export function statesOf(
  requested: readonly TrangThaiYeuCauDoiLich[] | undefined,
): readonly TrangThaiYeuCauDoiLich[] {
  if (requested === undefined || requested.length === 0) return ['ChoDuyet'];
  return TRANG_THAI_YEU_CAU_DOI_LICH.filter((state) =>
    requested.includes(state),
  );
}

/** Chiều sắp xếp theo `thoi_diem_tao`: TĂNG (cũ nhất trước) CHỈ khi tập đúng `{ChoDuyet}`; mọi tập khác GIẢM (tab "Đã xử lý" và tập trộn; PLAN 5.7). */
export function listOrderOf(
  states: readonly TrangThaiYeuCauDoiLich[],
): ListOrder {
  return states.length === 1 && states[0] === 'ChoDuyet' ? 'ASC' : 'DESC';
}

/**
 * Phạm vi của người duyệt đổi sang `actor` của lõi đổi lịch (B4): Toàn hệ thống ⇒ `chiNhanhId: null` (mọi chi nhánh), Chi nhánh (Quản trị viên Chi nhánh, Lễ tân) ⇒ chi nhánh được gán.
 * Chỉ nhận hai biến thể của `AdminScope`; phạm vi hỏng đã bị từ chối ở dịch vụ trước khi tới đây.
 */
export function approverActor(
  scope: AdminScope,
): Extract<RescheduleActor, { via: 'DuyetYeuCau' }> {
  return {
    via: 'DuyetYeuCau',
    chiNhanhId: scope.kind === 'ChiNhanh' ? scope.chiNhanhId : null,
  };
}

/** Kết quả "duyệt được không" của MỘT yêu cầu, chỉ là thông tin lúc đọc: quyết định thật ở B9, dưới khoá. */
export interface RequestApproval {
  coTheDuyet: boolean;
  lyDoKhongDuyet: string | null;
}

/**
 * `coTheDuyet` và `lyDoKhongDuyet` (PLAN 5.7; R6, Q3, Q7 (g)). Thứ tự, dừng ở nguyên nhân đầu tiên:
 *  1. yêu cầu không còn `ChoDuyet` ⇒ `YEU_CAU_DA_XU_LY`; 2. thiếu cấu hình ⇒ `HE_THONG_CHUA_CAU_HINH`;
 *  3. luật `evaluateRescheduleAvailability` (B2, vai `DuyetYeuCau`) không cho phép ⇒ `maLoi` của `failureCode` (`LICH_HEN_KHONG_CHO_DOI`, `LICH_HEN_DA_QUA_GIO`, `HO_SO_NGUOI_THAN_DA_NGUNG`,
 *     `CHUOI_DOI_LICH_QUA_DAI`); lỗi không có mã riêng (`NotFound`: dữ liệu lệch) ra `KHONG_TIM_THAY`; 4. còn lại ⇒ duyệt được.
 * KHÔNG viết luật thứ hai: trạng thái lịch, hạn giờ, hồ sơ người thân, chuỗi đều do `availability`. Khung giờ mong muốn còn trống hay không KHÔNG ảnh hưởng (có `khungGioMongMuon.trangThai` riêng).
 * `availability` là `null` khi chưa đọc (bước 1 hay 2 đã dừng); nếu vẫn `null` ở bước 3 thì coi như không đọc được lịch.
 */
export function approvalOf(input: {
  trangThai: TrangThaiYeuCauDoiLich;
  configured: boolean;
  availability: Pick<RescheduleAvailability, 'choPhep' | 'failure'> | null;
}): RequestApproval {
  if (input.trangThai !== 'ChoDuyet')
    return { coTheDuyet: false, lyDoKhongDuyet: REQUEST_HANDLED_CODE };
  if (!input.configured)
    return { coTheDuyet: false, lyDoKhongDuyet: CONFIG_MISSING_CODE };
  const { availability } = input;
  if (availability === null)
    return {
      coTheDuyet: false,
      lyDoKhongDuyet: COMMON_ERROR_CODES.NOT_FOUND,
    };
  if (availability.choPhep) return { coTheDuyet: true, lyDoKhongDuyet: null };
  return {
    coTheDuyet: false,
    lyDoKhongDuyet:
      (availability.failure === null
        ? null
        : failureCode(availability.failure)) ?? COMMON_ERROR_CODES.NOT_FOUND,
  };
}
