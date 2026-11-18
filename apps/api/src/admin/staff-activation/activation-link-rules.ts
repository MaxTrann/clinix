import type { MaXacThuc } from '../../auth/entities/ma-xac-thuc.entity.js';

// Quy tắc nghiệp vụ của liên kết kích hoạt dưới dạng HÀM THUẦN (không DB, không đồng hồ thật): dễ kiểm bằng đồng hồ giả và là nơi DUY NHẤT
// ghi các biên (hết hạn, khoảng cách tối thiểu, số lần mỗi giờ). ActivationLinkService chỉ lo đọc/ghi DB rồi gọi các hàm này;
// B16 (kích hoạt công khai) và B17 (hiển thị hạn) dùng lại `deriveActivationLinkState`.

type StateFacts = Pick<
  MaXacThuc,
  'daDungLuc' | 'daGuiLuc' | 'thuHoiLuc' | 'hetHanLuc'
>;

// Năm trạng thái của bảng PLAN 5.5 (suy ra từ các cột thời điểm, không có cột trạng thái riêng)
export type ActivationLinkState =
  | 'DA_DUNG' // da_dung_luc có
  | 'BI_THU_HOI' // thu_hoi_luc có: gửi lỗi hoặc bị liên kết mới thay
  | 'MOI_TAO' // da_gui_luc rỗng, thu_hoi_luc rỗng: chưa có hiệu lực
  | 'HET_HAN' // đã gửi, chưa thu hồi/dùng, het_han_luc <= bây giờ
  | 'HOP_LE';

/**
 * Trạng thái của một hàng `ma_xac_thuc` loại KichHoatNhanSu. Thứ tự ưu tiên (cái đứng trước thắng):
 *   đã dùng > thu hồi > mới tạo (chưa gửi) > hết hạn > hợp lệ.
 * CHECK của DB cấm vừa dùng vừa thu hồi và cấm dùng khi chưa gửi, nên thứ tự chỉ quyết định khi dữ liệu hỏng.
 * Hạn là nửa mở: đúng thời điểm `hetHanLuc` thì đã hết hạn (PLAN 5.5: hợp lệ khi het_han_luc > bây giờ).
 */
export function deriveActivationLinkState(
  row: StateFacts,
  now: Date,
): ActivationLinkState {
  if (row.daDungLuc !== null) return 'DA_DUNG';
  if (row.thuHoiLuc !== null) return 'BI_THU_HOI';
  if (row.daGuiLuc === null) return 'MOI_TAO';
  if (now.getTime() >= row.hetHanLuc.getTime()) return 'HET_HAN';
  return 'HOP_LE';
}

// Giới hạn gửi lại (Q23): giá trị lấy từ biến môi trường STAFF_ACTIVATION_RESEND_MIN_SECONDS và STAFF_ACTIVATION_RESEND_MAX_PER_HOUR
export interface ResendPolicy {
  /** Hàng mới phải cách hàng mới nhất ít nhất chừng này mili giây (đúng bằng thì được). */
  minIntervalMs: number;
  /** Số hàng tối đa trong cửa sổ; đang có đủ chừng này thì hàng kế tiếp bị từ chối. */
  maxPerWindow: number;
  windowMs: number;
}

export type ResendDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: 'TOO_SOON' | 'HOURLY_LIMIT';
      retryAfterSeconds: number;
    };

/**
 * Giới hạn gửi lại (Q23). `createdAt` là `tao_luc` của MỌI hàng KichHoatNhanSu của tài khoản, KỂ CẢ hàng gửi lỗi, hàng bị thay và lần gửi đầu.
 * Được phép khi cùng lúc:
 *   - cách hàng mới nhất ≥ `minIntervalMs` (đúng bằng thì được);
 *   - số hàng trong cửa sổ gần nhất < `maxPerWindow` (đang có N-1 thì hàng thứ N được, có N thì hàng thứ N+1 bị từ chối).
 * Cửa sổ nửa mở: hàng đúng `windowMs` tuổi không còn được đếm. Vi phạm cả hai thì trả thời gian chờ LỚN hơn, làm tròn LÊN giây.
 * Cùng thuật toán với `decideIssue` của OTP (auth) nhưng hằng số lấy từ `policy`, vì giá trị của liên kết kích hoạt cấu hình riêng.
 */
export function decideResend(
  createdAt: readonly Date[],
  now: Date,
  policy: ResendPolicy,
): ResendDecision {
  const nowMs = now.getTime();
  const times = createdAt.map((d) => d.getTime()).sort((a, b) => a - b);
  const inWindow = times.filter((t) => nowMs - t < policy.windowMs);

  const latest = times.length > 0 ? times[times.length - 1] : undefined;
  const waitForInterval =
    latest === undefined
      ? 0
      : Math.max(0, latest + policy.minIntervalMs - nowMs);

  // Cần (số hàng - (N-1)) hàng cũ nhất rời khỏi cửa sổ thì mới còn dưới N: hàng quyết định là hàng thứ (số hàng - N) tính từ cũ nhất
  const decisive = inWindow[inWindow.length - policy.maxPerWindow];
  const waitForWindow =
    inWindow.length >= policy.maxPerWindow && decisive !== undefined
      ? Math.max(0, decisive + policy.windowMs - nowMs)
      : 0;

  if (waitForInterval === 0 && waitForWindow === 0) return { allowed: true };
  const tooSoonIsLonger = waitForInterval >= waitForWindow;
  return {
    allowed: false,
    reason: tooSoonIsLonger ? 'TOO_SOON' : 'HOURLY_LIMIT',
    retryAfterSeconds: Math.ceil(
      Math.max(waitForInterval, waitForWindow) / 1000,
    ),
  };
}
