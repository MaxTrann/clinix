// Phản chiếu hằng của API (`OTP_TTL_MINUTES` và `OTP_RESEND_MIN_INTERVAL_MS` ở apps/api/src/auth/auth.constants.ts; TECH_DEBT dòng 54).
export const OTP_TTL_SECONDS = 600;
export const RESEND_INTERVAL_SECONDS = 60;

// Dùng đồng hồ máy: sai bao nhiêu thì số đếm lệch bấy nhiêu, nên kẹp lại; API vẫn là bên quyết định
export function secondsByClock(
  iso: string | null,
  maxSeconds: number,
  nowMs: number,
): number {
  if (iso === null) return 0;
  const left = Math.ceil((Date.parse(iso) - nowMs) / 1000);
  return Number.isNaN(left) ? 0 : Math.min(Math.max(left, 0), maxSeconds);
}

// Phản hồi vừa nhận: API tính `coTheGuiLaiLuc = hetHanLuc − 10 phút + 60 giây` nên hiệu hai mốc cho đúng thời lượng,
// không cần đồng hồ máy (có thể lệch). Dữ liệu lạ thì quay về đồng hồ máy.
export function secondsFromFreshCode(
  hetHanLuc: string,
  coTheGuiLaiLuc: string,
  nowMs: number,
): number {
  const gap = (Date.parse(hetHanLuc) - Date.parse(coTheGuiLaiLuc)) / 1000;
  const seconds = gap + RESEND_INTERVAL_SECONDS;
  return seconds >= 1 && seconds <= OTP_TTL_SECONDS
    ? seconds
    : secondsByClock(hetHanLuc, OTP_TTL_SECONDS, nowMs);
}
