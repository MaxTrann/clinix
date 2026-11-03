import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { FormAlert } from '../auth-form-parts';
import { formatCountdown, useLockCountdown } from '../login/use-lock-countdown';
import {
  OTP_TTL_SECONDS,
  RESEND_INTERVAL_SECONDS,
  secondsByClock,
  secondsFromFreshCode,
} from '../otp/code-deadlines';
import { isCompleteOtp } from '../otp/otp-code';
import { OtpInput } from '../otp/otp-input';
import { ResendButton } from '../otp/resend-button';
import { MAIL_FAILED_MESSAGE } from '../register/register-errors';
import {
  resendRegisterOtp,
  verifyRegisterOtp,
} from '../register/register-service';
import { REGISTER_PATH, VERIFY_EMAIL_PATH } from '../roles';
import {
  describeResendError,
  describeVerifyError,
  type VerifyFailure,
} from './verify-errors';
import type { PendingVerification } from './verify-state';

const NOTICE_BOX =
  'mb-4 rounded-xl border border-warning-line bg-warning-soft p-3 text-sm text-warning';

function failureText(failure: VerifyFailure | null): string | null {
  if (failure === null) return null;
  if (failure.kind === 'tooSoon') return 'Vui lòng thử lại sau.';
  if (failure.kind === 'mailFailed') return MAIL_FAILED_MESSAGE;
  return failure.kind === 'ignored' ? null : failure.message;
}

export function VerifyForm({ initial }: { initial: PendingVerification }) {
  const navigate = useNavigate();
  const alertId = useId();
  const alertRef = useRef<HTMLDivElement>(null);
  const firstCellRef = useRef<HTMLInputElement>(null);
  // State chưa kịp render giữa hai lần bấm liên tiếp, nên chống gửi đúp bằng ref
  const busy = useRef(false);
  const started = useRef(false);

  const { email, draft } = initial;
  const [verifyId, setVerifyId] = useState(initial.verifyId);
  const [resendId, setResendId] = useState(initial.resendId);
  const [hasExpiry, setHasExpiry] = useState(initial.hetHanLuc !== null);
  const [otp, setOtp] = useState('');
  const [notice, setNotice] = useState(initial.notice);
  const [codeDead, setCodeDead] = useState(false);
  const [suspended, setSuspended] = useState(false);
  const [pending, setPending] = useState(false);
  const [resent, setResent] = useState(false);
  const [failure, setFailure] = useState<VerifyFailure | null>(null);
  const expiry = useLockCountdown();
  const cooldown = useLockCountdown();
  const { start: startExpiry } = expiry;
  const { start: startCooldown } = cooldown;

  // Trước khi vẽ: effect thường để lộ một khung hình "00:00" và nút Gửi lại mã bấm được
  useLayoutEffect(() => {
    if (started.current) return;
    started.current = true;

    const now = Date.now();
    const { hetHanLuc, coTheGuiLaiLuc, fresh } = initial;
    if (hetHanLuc !== null) {
      startExpiry(
        fresh && coTheGuiLaiLuc !== null
          ? secondsFromFreshCode(hetHanLuc, coTheGuiLaiLuc, now)
          : secondsByClock(hetHanLuc, OTP_TTL_SECONDS, now),
      );
    }
    if (fresh) {
      startCooldown(RESEND_INTERVAL_SECONDS);
      // Từ đây tải lại trang là theo đồng hồ máy
      navigate(VERIFY_EMAIL_PATH, {
        replace: true,
        state: { ...initial, fresh: false },
      });
    } else if (coTheGuiLaiLuc !== null) {
      startCooldown(
        secondsByClock(coTheGuiLaiLuc, RESEND_INTERVAL_SECONDS, now),
      );
    }
  }, [initial, navigate, startCooldown, startExpiry]);

  const canType = verifyId !== null && !codeDead && !suspended;
  const message = failureText(failure);

  useEffect(() => {
    if (failure === null) return;
    if (failure.kind === 'wrongCode') firstCellRef.current?.focus();
    else alertRef.current?.focus();
  }, [failure]);

  function persist(next: Partial<PendingVerification>) {
    const state: PendingVerification = {
      ...initial,
      verifyId,
      resendId,
      fresh: false,
      notice: null,
      ...next,
    };
    navigate(VERIFY_EMAIL_PATH, { replace: true, state });
  }

  function applyFailure(next: VerifyFailure) {
    if (next.kind === 'ignored') return;
    if (next.kind === 'reregister') {
      navigate(REGISTER_PATH, {
        replace: true,
        state: { ...draft, email, notice: next.message },
      });
      return;
    }
    if (next.kind === 'wrongCode') setOtp('');
    if (next.kind === 'deadCode') setCodeDead(true);
    if (next.kind === 'suspended') setSuspended(true);
    if (next.kind === 'tooSoon') startCooldown(next.seconds);
    if (next.kind === 'mailFailed') {
      // Hàng lỗi chỉ dùng để gửi lại; mã cũ còn hạn vẫn nhập được bằng `verifyId` đang giữ
      setResendId(next.maXacThucId);
      startCooldown(RESEND_INTERVAL_SECONDS);
      persist({
        resendId: next.maXacThucId,
        coTheGuiLaiLuc: next.coTheGuiLaiLuc,
      });
    }
    setFailure(next);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !canType || !isCompleteOtp(otp) || verifyId === null) {
      return;
    }

    busy.current = true;
    setPending(true);
    setFailure(null);
    setResent(false);
    try {
      await verifyRegisterOtp(email, verifyId, otp);
      navigate(VERIFY_EMAIL_PATH, {
        replace: true,
        state: { verified: true, email },
      });
    } catch (error) {
      applyFailure(describeVerifyError(error));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function handleResend() {
    if (busy.current || suspended || cooldown.remaining > 0) return;

    busy.current = true;
    setPending(true);
    setFailure(null);
    setResent(false);
    try {
      const code = await resendRegisterOtp(email, resendId);
      // `maXacThucId` đổi mỗi lần gửi, mã cũ đã bị thay thế
      setVerifyId(code.maXacThucId);
      setResendId(code.maXacThucId);
      setHasExpiry(true);
      setCodeDead(false);
      setNotice(null);
      setOtp('');
      setResent(true);
      startExpiry(
        secondsFromFreshCode(code.hetHanLuc, code.coTheGuiLaiLuc, Date.now()),
      );
      startCooldown(RESEND_INTERVAL_SECONDS);
      persist({
        verifyId: code.maXacThucId,
        resendId: code.maXacThucId,
        hetHanLuc: code.hetHanLuc,
        coTheGuiLaiLuc: code.coTheGuiLaiLuc,
      });
    } catch (error) {
      applyFailure(describeResendError(error));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  useEffect(() => {
    if (resent) firstCellRef.current?.focus();
  }, [resent]);

  const showExpiry = canType && hasExpiry;

  return (
    <>
      {notice && !message && (
        <p role="status" className={NOTICE_BOX}>
          {notice}
        </p>
      )}

      {message && (
        <div className="mb-4" id={alertId}>
          <FormAlert alertRef={alertRef}>{message}</FormAlert>
        </div>
      )}

      {/* Câu tĩnh đọc một lần; số đếm nằm ngoài vùng live để không bị đọc lại mỗi giây */}
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

      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <OtpInput
          value={otp}
          onChange={(value) => {
            setOtp(value);
            setFailure(null);
          }}
          disabled={!canType || pending}
          invalid={failure?.kind === 'wrongCode'}
          firstInputRef={firstCellRef}
          describedBy={message ? alertId : undefined}
        />

        {showExpiry && (
          <p className="sr-only">Mã có hiệu lực 10 phút kể từ lúc gửi.</p>
        )}
        <div aria-hidden="true" className="py-5 text-center text-xs">
          {showExpiry && !expiry.expired && (
            <p className="text-gray-500">
              Mã hết hạn sau{' '}
              <span className="font-semibold text-gray-700">
                {formatCountdown(expiry.remaining)}
              </span>
            </p>
          )}
          {showExpiry && expiry.expired && (
            <p className="font-medium text-danger">
              Mã đã hết hạn. Vui lòng gửi lại.
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={!canType || pending || !isCompleteOtp(otp)}
          className="w-full rounded-xl bg-brand-strong py-3 font-medium text-white transition-colors hover:bg-cyan-800 disabled:opacity-50 disabled:hover:bg-brand-strong"
        >
          {pending ? 'Đang xử lý...' : 'Xác minh'}
        </button>
      </form>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-1 text-sm">
        <span className="text-gray-500">Không nhận được mã?</span>
        <ResendButton
          remaining={cooldown.remaining}
          disabled={pending || suspended}
          onClick={() => void handleResend()}
        />
      </div>

      <div className="mt-3 text-center">
        <Link
          to={REGISTER_PATH}
          state={draft ?? { email }}
          className="text-xs font-medium text-gray-500 hover:text-gray-700"
        >
          ← Quay lại đăng ký
        </Link>
      </div>
    </>
  );
}
