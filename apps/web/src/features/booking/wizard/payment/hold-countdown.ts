// Hàm thuần của đồng hồ giữ chỗ ở Bước Thanh toán (booking F6, WZ-10; PLAN booking 5.13 "Đếm ngược"). KHÔNG import React, KHÔNG đọc đồng hồ máy: nơi gọi truyền giờ vào, nên test
// biên được mà không cần đồng hồ giả.
//
// Mốc thời gian (ms từ epoch):
//   hạn            `hanThanhToan` của máy chủ (ISO 8601 UTC)
//   giờ máy chủ    `thoiGianMayChu` của CHÍNH phản hồi đó
//   chênh          giờ máy chủ − giờ máy lúc nhận; "giờ máy chủ bây giờ" = `Date.now()` + chênh
// Còn lại mỗi nhịp = hạn − giờ máy chủ bây giờ, tính LẠI từ đồng hồ (không trừ dần): tab nền bị trình duyệt giãn hẹn giờ, trừ dần sẽ chậm theo.

export const FIVE_MINUTES_SECONDS = 300;
export const ONE_MINUTE_SECONDS = 60;

// Chênh giữa đồng hồ máy chủ và đồng hồ máy. Dương: máy chủ nhanh hơn máy. Tính MỘT lần lúc nhận dữ liệu.
export function clockOffsetMs(
  serverTimeIso: string,
  receivedAtMs: number,
): number {
  return Date.parse(serverTimeIso) - receivedAtMs;
}

// Số giây còn lại tới hạn, làm tròn LÊN: "00:00" chỉ hiện khi đã tới hoặc qua mốc (hạn là mốc nửa mở: đúng mốc là hết, Q2). Không bao giờ âm.
// `null` khi lịch không có hạn (khác 0: không có hạn thì không bao giờ hết). Mốc không đọc được (NaN) coi như đã hết: không để người dùng trả tiền vì một giờ sai.
export function holdRemainingSeconds(
  deadlineIso: string | null,
  serverNowMs: number,
): number | null {
  if (deadlineIso === null) return null;
  const leftMs = Date.parse(deadlineIso) - serverNowMs;
  return leftMs > 0 ? Math.ceil(leftMs / 1000) : 0;
}

// "mm:ss". Phút KHÔNG bị kẹp ở 59: thời gian giữ chỗ là cấu hình (Q2), 75 phút hiện "75:00".
export function formatHoldTime(totalSeconds: number): string {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

// Các mốc báo cho trình đọc màn hình và đổi giao diện: trên 5 phút, trong 5 phút, trong 1 phút, hết giờ
export type HoldLevel = 'plenty' | 'within5' | 'within1' | 'ended';

export function holdLevel(remainingSeconds: number): HoldLevel {
  if (remainingSeconds <= 0) return 'ended';
  if (remainingSeconds <= ONE_MINUTE_SECONDS) return 'within1';
  if (remainingSeconds <= FIVE_MINUTES_SECONDS) return 'within5';
  return 'plenty';
}
