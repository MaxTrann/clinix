import { nowVN } from '../../common/time/time.js';

// DATETIME của MySQL chỉ có độ chính xác giây (và làm tròn phần lẻ khi lưu). Cắt mili giây trước khi ghi để giá trị lưu
// và giá trị so sánh trong mã luôn khớp nhau.
// Bản 2 dòng này TRÙNG với `toSecond` private trong session/session.service.ts (A3). Chưa đưa vào common/time vì đó là file của module
// admin; ghi ở docs/TECH_DEBT.md, đề xuất chuyển vào common/time khi hai bên thống nhất.
export const toSecond = (date: Date): Date =>
  new Date(Math.floor(date.getTime() / 1000) * 1000);

/** Đồng hồ DUY NHẤT của OTP: nowVN() của common/time (test dùng đồng hồ giả), cắt xuống giây. Không dùng NOW() của DB. */
export const currentSecond = (): Date => toSecond(nowVN());
