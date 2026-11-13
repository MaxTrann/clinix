import {
  describeFailure,
  type StatusFailure,
} from '../../common/status-failure';
import type { OverrideTarget } from '../api/admin-appointment-types';
import { OVERRIDE_TEXT } from './detail-messages';

// Câu lỗi của route override của Quản trị viên (booking F10; PLAN 5.14, B14 mục 5). Override KHÔNG có mã `maLoi` riêng: mọi mã B14 trả (400 `DU_LIEU_KHONG_HOP_LE` kèm `LY_DO_BAT_BUOC`, 404,
// 409 `CHUYEN_TRANG_THAI_KHONG_HOP_LE`, `LICH_HEN_KHONG_CHO_HUY`, `CHI_BAC_SI_HOAN_THANH`, `HE_THONG_CHUA_CAU_HINH`, 503 `HE_THONG_DANG_BAN`, 401, 403) đã có trong bảng chung ở
// `common/status-failure.ts`; ba mã chỉ của Lễ tân (chưa thanh toán, ngoài khung giờ, chưa qua giờ hẹn) Quản trị viên không gặp (B14 bỏ qua cửa sổ tiếp đón và khoản còn phải thu) nên
// rơi vào câu chung. Chỉ có câu "chưa rõ" riêng theo đích. Chọn theo `maLoi`, KHÔNG theo mã HTTP. Hàm thuần.
export function describeOverrideFailure(
  error: unknown,
  target: OverrideTarget,
): StatusFailure {
  return describeFailure(error, OVERRIDE_TEXT.unsure[target]);
}
