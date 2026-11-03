import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { FormAlert, WARNING_BOX } from '../auth-form-parts';
import {
  RESEND_INTERVAL_SECONDS,
  secondsByClock,
  secondsFromFreshCode,
} from '../otp/code-deadlines';
import {
  CodeAnnouncements,
  CodeExpiryNote,
  ResendRow,
} from '../otp/code-timers';
import { isCompleteOtp } from '../otp/otp-code';
import { OtpInput } from '../otp/otp-input';
import { useCodeTimers, type CodeMarks } from '../otp/use-code-timers';
import {
  INVALID_DATA_MESSAGE,
  MAIL_FAILED_MESSAGE,
  TOO_SOON_MESSAGE,
} from '../register/register-errors';
import { usePageActive } from '../use-page-active';
import {
  OLD_CODE_HINT,
  RESENT_MESSAGE,
  describeCodeError,
  describeCodeRequestError,
  type CodeFailure,
} from './forgot-errors';
import { resendForgotCode, verifyForgotCode } from './forgot-service';

const SUCCESS_BOX =
  'mb-4 rounded-xl border border-success-line bg-success-soft p-3 text-sm text-success';

interface CodeStepProps {
  email: string;
  marks: CodeMarks;
  fresh: boolean;
  mailFailed: boolean;
  onMarks: (marks: CodeMarks) => void;
  onVerified: (resetToken: string) => void;
  onBackToEmail: (notice: string | null) => void;
}

// Bước 2 (frame `645:2`, bỏ banner demo theo G3). Không tự gửi khi đủ 6 số; "Gửi lại mã" làm mã trong thư cũ chết.
export function CodeStep({
  email,
  marks,
  fresh,
  mailFailed,
  onMarks,
  onVerified,
  onBackToEmail,
}: CodeStepProps) {
  const alertId = useId();
  const alertRef = useRef<HTMLDivElement>(null);
  const firstCellRef = useRef<HTMLInputElement>(null);
  // State chưa kịp render giữa hai lần bấm liên tiếp, nên chống gửi đúp bằng ref
  const busy = useRef(false);
  const active = usePageActive();

  const [otp, setOtp] = useState('');
  const [hasExpiry, setHasExpiry] = useState(marks.hetHanLuc !== null);
  const [codeDead, setCodeDead] = useState(false);
  const [pending, setPending] = useState(false);
  const [resent, setResent] = useState(false);
  const [noticeShown, setNoticeShown] = useState(mailFailed);
  const [failure, setFailure] = useState<CodeFailure | null>(null);
  const { expiry, cooldown } = useCodeTimers(marks, fresh);
  const { start: startExpiry } = expiry;
  const { start: startCooldown } = cooldown;

  const message =
    failure === null || failure.kind === 'ignored' ? null : failure.message;

  useEffect(() => {
    firstCellRef.current?.focus();
  }, []);

  useEffect(() => {
    if (failure === null) return;
    if (failure.kind === 'wrongCode') firstCellRef.current?.focus();
    else alertRef.current?.focus();
  }, [failure]);

  useEffect(() => {
    if (resent) firstCellRef.current?.focus();
  }, [resent]);

  function applyCodeFailure(next: CodeFailure) {
    if (next.kind === 'ignored') return;
    if (next.kind === 'backToEmail') {
      onBackToEmail(next.message);
      return;
    }
    if (next.kind === 'wrongCode') setOtp('');
    if (next.kind === 'deadCode') setCodeDead(true);
    setFailure(next);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || codeDead || !isCompleteOtp(otp)) return;

    busy.current = true;
    setPending(true);
    setFailure(null);
    setResent(false);
    setNoticeShown(false);
    try {
      const grant = await verifyForgotCode(email, otp);
      if (!active.current) return;
      if (typeof grant.resetToken !== 'string' || grant.resetToken === '') {
        setFailure({ kind: 'message', message: INVALID_DATA_MESSAGE });
        return;
      }
      onVerified(grant.resetToken);
    } catch (error) {
      if (active.current) applyCodeFailure(describeCodeError(error));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function handleResend() {
    if (busy.current || cooldown.remaining > 0) return;

    busy.current = true;
    setPending(true);
    setFailure(null);
    setResent(false);
    setNoticeShown(false);
    try {
      const code = await resendForgotCode(email);
      if (!active.current) return;
      setHasExpiry(true);
      setCodeDead(false);
      setOtp('');
      setResent(true);
      startExpiry(
        secondsFromFreshCode(code.hetHanLuc, code.coTheGuiLaiLuc, Date.now()),
      );
      startCooldown(RESEND_INTERVAL_SECONDS);
      onMarks(code);
    } catch (error) {
      if (!active.current) return;
      const next = describeCodeRequestError(error);
      if (next.kind === 'tooSoon') {
        startCooldown(next.seconds);
        setFailure({ kind: 'message', message: TOO_SOON_MESSAGE });
      } else if (next.kind === 'mailFailed') {
        // Mã cũ vẫn dùng được: giữ bộ đếm hạn của nó, chỉ khoá nút tới mốc mới (D9)
        startCooldown(
          secondsByClock(
            next.coTheGuiLaiLuc,
            RESEND_INTERVAL_SECONDS,
            Date.now(),
          ),
        );
        setFailure({ kind: 'message', message: MAIL_FAILED_MESSAGE });
        onMarks({ ...marks, coTheGuiLaiLuc: next.coTheGuiLaiLuc });
      } else if (next.kind === 'emailField') {
        setFailure({ kind: 'message', message: next.message });
      } else {
        applyCodeFailure(next);
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  const showExpiry = !codeDead && hasExpiry;

  return (
    <>
      {noticeShown && !message && (
        <div className="mb-4">
          <p role="alert" className={WARNING_BOX}>
            {MAIL_FAILED_MESSAGE} {OLD_CODE_HINT}
          </p>
        </div>
      )}
      {resent && !message && (
        <p role="status" className={SUCCESS_BOX}>
          {RESENT_MESSAGE}
        </p>
      )}
      {message && (
        <div className="mb-4" id={alertId}>
          <FormAlert alertRef={alertRef}>{message}</FormAlert>
        </div>
      )}

      {/* Câu "đã gửi mã mới" hiện thành chữ ở trên (D10) nên không đọc lần nữa */}
      <CodeAnnouncements
        resent={false}
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
          disabled={codeDead || pending}
          invalid={failure?.kind === 'wrongCode'}
          firstInputRef={firstCellRef}
          describedBy={message ? alertId : undefined}
        />

        <CodeExpiryNote expiry={expiry} show={showExpiry} />

        <button
          type="submit"
          disabled={codeDead || pending || !isCompleteOtp(otp)}
          className="w-full rounded-xl bg-brand-strong py-3 font-medium text-white transition-colors hover:bg-cyan-800 disabled:opacity-50 disabled:hover:bg-brand-strong"
        >
          {pending ? 'Đang xử lý...' : 'Tiếp theo'}
        </button>
      </form>

      <ResendRow
        cooldown={cooldown}
        disabled={pending}
        onResend={() => void handleResend()}
      />

      {/* `flex`: khung dòng chữ 15px thì nút 15px bị đẩy xuống khoảng 5px so với `645:86` (đo Chrome) */}
      <div className="mt-3 flex justify-center">
        <button
          type="button"
          disabled={pending}
          onClick={() => onBackToEmail(null)}
          className="text-xs font-medium text-gray-500 hover:text-gray-700"
        >
          ← Đổi email
        </button>
      </div>
    </>
  );
}
