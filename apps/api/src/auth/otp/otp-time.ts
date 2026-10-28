import { nowVN, toSecond } from '../../common/time/time.js';

/** Đồng hồ DUY NHẤT của OTP: nowVN() của common/time (test dùng đồng hồ giả), cắt xuống giây. Không dùng NOW() của DB. */
export const currentSecond = (): Date => toSecond(nowVN());
