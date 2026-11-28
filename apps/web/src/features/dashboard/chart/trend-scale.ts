import { formatDate } from '../../../shared/schedule/week';
import type { AdminDashboard, TrendPoint } from '../api/dashboard-api';
import { formatCount } from '../format';

// Hàm thuần của biểu đồ "Xu hướng đăng ký khám" (dashboard F2; PLAN dashboard 5.6 (6), 5.11; Q5, Q8). Tách khỏi component để test không cần vẽ.
// Web KHÔNG gom ngày thành tuần hay tự đếm: máy chủ đã trả đủ điểm (kể cả 0) và `donVi` (B2). Ở đây chỉ tính thang trục và chữ hiển thị.

export type TrendUnit = AdminDashboard['xuHuong']['donVi'];

/** Số vạch chia tối đa của trục dọc (không kể vạch 0). */
const MAX_TICKS = 4;

/**
 * Đỉnh trục dọc và các vạch chia, bước "đẹp" (1, 2, 5 nhân lũy thừa của 10), bước tối thiểu 1 vì là số đếm.
 * Toàn 0 hay không có điểm ⇒ `{ top: 0, ticks: [0] }`: nơi dùng không chia cho `top` (DBD-01).
 * Ví dụ: 7 ⇒ bước 2, đỉnh 8, vạch 0 2 4 6 8; 120 ⇒ bước 50, đỉnh 150.
 */
export function axisScale(max: number): { top: number; ticks: number[] } {
  if (!(max > 0)) return { top: 0, ticks: [0] };
  const rawStep = max / MAX_TICKS;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = Math.max(
    1,
    [1, 2, 5, 10].map((f) => f * magnitude).find((s) => s >= rawStep) ??
      10 * magnitude,
  );
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= top; value += step) ticks.push(value);
  return { top, ticks };
}

/** Chiều cao cột theo phần trăm vùng vẽ; `top` 0 ⇒ 0 (không chia cho 0). */
export function barPercent(value: number, top: number): number {
  return top > 0 ? (value / top) * 100 : 0;
}

/** Nhãn trục ngang: "dd/mm" của ngày, hay của ngày ĐẦU tuần (tuần đã được máy chủ cắt theo hai đầu khoảng) (DBD-03). */
export function axisLabel(point: TrendPoint): string {
  return formatDate(point.tuNgay).slice(0, 5);
}

/** Nhãn đầy đủ một điểm cho bảng số và tóm tắt: "03/12/2026" hay "Tuần 30/11/2026 – 06/12/2026" (DBD-03). */
export function pointLabel(point: TrendPoint, unit: TrendUnit): string {
  return unit === 'Ngay'
    ? formatDate(point.tuNgay)
    : `Tuần ${formatDate(point.tuNgay)} – ${formatDate(point.denNgay)}`;
}

/**
 * Chỉ số các điểm được ghi nhãn trục ngang: tối đa khoảng 7 nhãn để 375 px không chồng chữ (62 điểm ⇒ cách 9 điểm một nhãn).
 * Mọi điểm vẫn có trong bảng số.
 */
export function labelledIndexes(count: number, maxLabels = 7): number[] {
  if (count <= 0) return [];
  const every = Math.ceil(count / maxLabels);
  const indexes: number[] = [];
  for (let i = 0; i < count; i += every) indexes.push(i);
  return indexes;
}

/**
 * Tên truy cập của biểu đồ (DBD-02): đơn vị, tổng và điểm cao nhất (điểm đầu tiên nếu bằng nhau).
 * Tổng ở đây là phép cộng để ĐỌC tóm tắt hình vẽ, không thay một số nào máy chủ trả.
 */
export function trendSummary(points: TrendPoint[], unit: TrendUnit): string {
  const per = unit === 'Ngay' ? 'theo ngày' : 'theo tuần';
  const total = points.reduce((sum, point) => sum + point.soLuong, 0);
  if (total === 0)
    return `Xu hướng đăng ký khám ${per}: chưa có lịch đặt mới nào.`;
  const peak = points.reduce((best, point) =>
    point.soLuong > best.soLuong ? point : best,
  );
  const peakAt =
    unit === 'Ngay'
      ? `ngày ${pointLabel(peak, unit)}`
      : pointLabel(peak, unit).toLowerCase();
  return `Xu hướng đăng ký khám ${per}: tổng ${formatCount(total)} lịch đặt mới; cao nhất ${formatCount(peak.soLuong)} lịch, ${peakAt}.`;
}
