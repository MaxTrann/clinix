import { useLayoutEffect, useRef } from 'react';
import { useLockCountdown } from '../login/use-lock-countdown';
import {
  OTP_TTL_SECONDS,
  RESEND_INTERVAL_SECONDS,
  secondsByClock,
  secondsFromFreshCode,
} from './code-deadlines';

// Hai bộ đếm của màn nhập mã (F2 xác minh email, F4 quên mật khẩu): "Mã hết hạn sau" và khoá "Gửi lại mã".

export interface CodeMarks {
  hetHanLuc: string | null;
  coTheGuiLaiLuc: string | null;
}

// `fresh`: mốc vừa nhận từ API thì đếm theo hiệu hai mốc; đọc lại từ `location.state` (tải lại) thì theo đồng hồ máy có kẹp
export function useCodeTimers(marks: CodeMarks, fresh: boolean) {
  const started = useRef(false);
  const expiry = useLockCountdown();
  const cooldown = useLockCountdown();
  const { start: startExpiry } = expiry;
  const { start: startCooldown } = cooldown;
  const { hetHanLuc, coTheGuiLaiLuc } = marks;

  // Trước khi vẽ: effect thường để lộ một khung hình "00:00" và nút Gửi lại mã bấm được
  useLayoutEffect(() => {
    if (started.current) return;
    started.current = true;

    const now = Date.now();
    if (hetHanLuc !== null) {
      startExpiry(
        fresh && coTheGuiLaiLuc !== null
          ? secondsFromFreshCode(hetHanLuc, coTheGuiLaiLuc, now)
          : secondsByClock(hetHanLuc, OTP_TTL_SECONDS, now),
      );
    }
    if (fresh) {
      startCooldown(RESEND_INTERVAL_SECONDS);
    } else if (coTheGuiLaiLuc !== null) {
      startCooldown(
        secondsByClock(coTheGuiLaiLuc, RESEND_INTERVAL_SECONDS, now),
      );
    }
  }, [coTheGuiLaiLuc, fresh, hetHanLuc, startCooldown, startExpiry]);

  return { expiry, cooldown };
}
