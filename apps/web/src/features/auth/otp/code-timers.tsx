import {
  formatCountdown,
  type LockCountdown,
} from '../login/use-lock-countdown';
import { ResendButton } from './resend-button';

// Phần hiển thị của hai bộ đếm trên màn nhập mã (F2, F4); hook khởi động ở `use-code-timers.ts`.

// Câu tĩnh đọc một lần; số đếm nằm ngoài vùng live để không bị đọc lại mỗi giây
export function CodeAnnouncements({
  resent,
  cooldown,
  expiry,
  showExpiry,
}: {
  resent: boolean;
  cooldown: LockCountdown;
  expiry: LockCountdown;
  showExpiry: boolean;
}) {
  return (
    <>
      {resent && (
        <p role="status" className="sr-only">
          Đã gửi mã mới đến email của bạn.
        </p>
      )}
      {cooldown.expired && (
        <p role="status" className="sr-only">
          Bạn có thể gửi lại mã.
        </p>
      )}
      {expiry.expired && showExpiry && (
        <p role="status" className="sr-only">
          Mã đã hết hạn.
        </p>
      )}
    </>
  );
}

export function CodeExpiryNote({
  expiry,
  show,
}: {
  expiry: LockCountdown;
  show: boolean;
}) {
  return (
    <>
      {show && <p className="sr-only">Mã có hiệu lực 10 phút kể từ lúc gửi.</p>}
      <div aria-hidden="true" className="py-5 text-center text-xs">
        {show && !expiry.expired && (
          <p className="text-gray-500">
            Mã hết hạn sau{' '}
            <span className="font-semibold text-gray-700">
              {formatCountdown(expiry.remaining)}
            </span>
          </p>
        )}
        {show && expiry.expired && (
          <p className="font-medium text-danger">
            Mã đã hết hạn. Vui lòng gửi lại.
          </p>
        )}
      </div>
    </>
  );
}

export function ResendRow({
  cooldown,
  disabled,
  onResend,
}: {
  cooldown: LockCountdown;
  disabled: boolean;
  onResend: () => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-x-1 text-sm">
      <span className="text-gray-500">Không nhận được mã?</span>
      <ResendButton
        remaining={cooldown.remaining}
        disabled={disabled}
        onClick={onResend}
      />
    </div>
  );
}
