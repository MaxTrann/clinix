import type { CauHinhHeThong } from '../../admin/entities/cau-hinh-he-thong.entity.js';
import type { CheckInWindowInput } from './appointment-state.matrix.js';

// Phần của `cau_hinh_he_thong` mà HAI phương thức đổi trạng thái của Lễ tân cần (task B12; TRACKING 3.26 B12-C, B12-D). Người gọi (route của Lễ tân, `payment` B17, job B13, Quản trị viên B14) đọc cấu hình
// MỘT lần NGOÀI giao dịch (`SystemConfigService.get()`) cùng một mốc `now = toSecond(nowVN())` rồi truyền vào: thân giao dịch chạy lại được khi 1213, 1205 mà không đọc lại cấu hình. `null` là chưa có
// dòng cấu hình (quy tắc 35): hai phương thức trả `ConfigMissing`, không đoán số phút hay ngưỡng.
export type StatusConfig = Pick<
  CauHinhHeThong,
  'checkInTruocPhut' | 'checkInSauPhut' | 'nguongNoShow'
>;

/**
 * Dữ liệu cửa sổ tiếp đón cho ma trận (`TransitionContext.window`, Q22), hoặc `undefined` khi chưa có cấu hình: ma trận khi đó từ chối `ThieuDuLieu` (CT-10). Không sửa đầu vào.
 */
export function windowOf(
  config: StatusConfig | null,
  now: Date,
  thoiGian: Date,
): CheckInWindowInput | undefined {
  if (config === null) return undefined;
  return {
    now,
    thoiGian,
    truocPhut: config.checkInTruocPhut,
    sauPhut: config.checkInSauPhut,
  };
}
