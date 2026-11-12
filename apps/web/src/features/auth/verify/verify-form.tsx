import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { FormAlert } from '../auth-form-parts';
import {
  RESEND_INTERVAL_SECONDS,
  secondsFromFreshCode,
} from '../otp/code-deadlines';
import {
  CodeAnnouncements,
  CodeExpiryNote,
  ResendRow,
} from '../otp/code-timers';
import { isCompleteOtp } from '../otp/otp-code';
import { OtpInput } from '../otp/otp-input';
import { useCodeTimers } from '../otp/use-code-timers';
import { MAIL_FAILED_MESSAGE } from '../register/register-errors';
import {
  resendRegisterOtp,
  verifyRegisterOtp,
} from '../register/register-service';
import { withReturnTo } from '../return-to';
import { REGISTER_PATH, VERIFY_EMAIL_PATH } from '../roles';
import { usePageActive } from '../use-page-active';
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
  const active = usePageActive();

  const { email, draft } = initial;
  // `initial` đã mang `from` (nếu có) qua mọi lần `persist`; ba chỗ dựng state mới dưới đây chuyển tiếp nó (booking F3)
  const from = initial.from ?? null;
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
  const { expiry, cooldown } = useCodeTimers(initial, initial.fresh);
  const { start: startExpiry } = expiry;
  const { start: startCooldown } = cooldown;

  // Chạy sau khi hai bộ đếm đã khởi động (cùng lượt vẽ, trước khi vẽ)
  useLayoutEffect(() => {
    if (started.current) return;
    started.current = true;
    if (initial.fresh) {
      // Từ đây tải lại trang là theo đồng hồ máy
      navigate(VERIFY_EMAIL_PATH, {
        replace: true,
        state: { ...initial, fresh: false },
      });
    }
  }, [initial, navigate]);

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
        state: withReturnTo({ ...draft, email, notice: next.message }, from),
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
      // Đã rời trang trong lúc chờ: không đổi trang hay state của lịch sử
      if (!active.current) return;
      navigate(VERIFY_EMAIL_PATH, {
        replace: true,
        state: withReturnTo({ verified: true, email }, from),
      });
    } catch (error) {
      if (active.current) applyFailure(describeVerifyError(error));
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
      if (!active.current) return;
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
      if (active.current) applyFailure(describeResendError(error));
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

      <CodeAnnouncements
        resent={resent}
        cooldown={cooldown}
        expiry={expiry}
        showExpiry={showExpiry}
      />

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

        <CodeExpiryNote expiry={expiry} show={showExpiry} />

        <button
          type="submit"
          disabled={!canType || pending || !isCompleteOtp(otp)}
          className="w-full rounded-xl bg-brand-strong py-3 font-medium text-white transition-colors hover:bg-cyan-800 disabled:opacity-50 disabled:hover:bg-brand-strong"
        >
          {pending ? 'Đang xử lý...' : 'Xác minh'}
        </button>
      </form>

      <ResendRow
        cooldown={cooldown}
        disabled={pending || suspended}
        onResend={() => void handleResend()}
      />

      <div className="mt-3 text-center">
        <Link
          to={REGISTER_PATH}
          state={withReturnTo(draft ?? { email }, from)}
          className="text-xs font-medium text-gray-500 hover:text-gray-700"
        >
          ← Quay lại đăng ký
        </Link>
      </div>
    </>
  );
}
