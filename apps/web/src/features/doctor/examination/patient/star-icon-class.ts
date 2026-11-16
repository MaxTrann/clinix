// Lớp của MỘT ngôi sao (doctor-exam F6), dùng chung cho `star-input.tsx` (ô chọn) và `rating-summary.tsx` (đánh giá đã gửi): biểu tượng 22,5 (Figma `423:413`, `424:431`). Sao đặc dùng `amber-600` và sao viền dùng `gray-500` vì ký hiệu phải đạt 3:1 trên nền trắng
// (ADR 0004; vàng `#ffb900` của Figma chỉ ≈ 1,7:1, `amber-500` 2,1:1, `amber-600` 3,2:1, `gray-400` 2,6:1, `gray-500` 4,8:1: số đo thật ghi ở TRACKING 24.8). Nhãn mức sao là chữ nên thông tin không chỉ nằm ở màu.
// Tách file riêng vì quy tắc `react-refresh/only-export-components` (file có thành phần chỉ được xuất thành phần).
export const starIconClass = (filled: boolean): string =>
  `size-6 ${filled ? 'fill-current text-amber-600' : 'text-gray-500'}`;
