import { Clock, Mail } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import { FormAlert, WARNING_BOX } from '../auth-form-parts';
import { formatCountdown, useLockCountdown } from '../login/use-lock-countdown';
import type { CodeMarks } from '../otp/use-code-timers';
import { RegisterFieldInput } from '../register/register-field';
import { TOO_SOON_MESSAGE } from '../register/register-errors';
import { LOGIN_PATH } from '../roles';
import { usePageActive } from '../use-page-active';
import {
  isPlausibleEmail,
  trimAsciiWhitespace,
} from '../validation/account-policy';
import {
  describeCodeRequestError,
  type CodeRequestFailure,
} from './forgot-errors';
import { requestForgotCode } from './forgot-service';

export interface CodeSent {
  email: string;
  marks: CodeMarks;
  fresh: boolean;
  mailFailed: boolean;
}

interface EmailStepProps {
  initialEmail: string;
  // Câu mang về từ bước 2 hoặc 3 (token hết hiệu lực, email không còn…)
  notice: string | null;
  onSent: (sent: CodeSent) => void;
}

// Bước 1 (frame `643:2`, `644:2`). Mọi lỗi của bước này dùng hộp vàng như `644:2` và mã Make (D4).
export function EmailStep({ initialEmail, notice, onSent }: EmailStepProps) {
  const alertRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  // State chưa kịp render giữa hai lần gửi liên tiếp, nên chống gửi đúp bằng ref
  const submitting = useRef(false);
  const active = usePageActive();

  const [email, setEmail] = useState(initialEmail);
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [failure, setFailure] = useState<CodeRequestFailure | null>(
    notice === null ? null : { kind: 'message', message: notice },
  );
  const wait = useLockCountdown();
  const waiting = wait.remaining > 0;

  useEffect(() => {
    if (fieldError !== null) emailRef.current?.focus();
  }, [fieldError]);

  useEffect(() => {
    if (failure !== null) alertRef.current?.focus();
  }, [failure]);

  function update(value: string) {
    setEmail(value);
    setFieldError(null);
    // Hộp đếm ngược phải còn khi nút đang khoá, nếu không nút khoá mà không có lời giải thích
    setFailure((current) => (current?.kind === 'tooSoon' ? current : null));
  }

  function applyFailure(next: CodeRequestFailure, sentEmail: string) {
    if (next.kind === 'ignored') return;
    if (next.kind === 'mailFailed') {
      // D9: thư không đi nhưng mã cũ (nếu còn hạn) vẫn nhập được, nên vẫn sang bước 2
      onSent({
        email: sentEmail,
        marks: { hetHanLuc: null, coTheGuiLaiLuc: next.coTheGuiLaiLuc },
        fresh: false,
        mailFailed: true,
      });
      return;
    }
    if (next.kind === 'emailField') {
      setFieldError(next.message);
      return;
    }
    if (next.kind === 'tooSoon') wait.start(next.seconds);
    setFailure(next);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || waiting) return;

    const sentEmail = trimAsciiWhitespace(email);
    if (sentEmail === '') {
      setFieldError('Vui lòng nhập email.');
      return;
    }
    if (!isPlausibleEmail(sentEmail)) {
      setFieldError('Email không hợp lệ.');
      return;
    }

    submitting.current = true;
    setPending(true);
    setFailure(null);
    try {
      const code = await requestForgotCode(sentEmail);
      // Đã rời trang trong lúc chờ: không đổi bước, không đổi state của lịch sử (D13)
      if (!active.current) return;
      onSent({ email: sentEmail, marks: code, fresh: true, mailFailed: false });
    } catch (error) {
      if (active.current) {
        applyFailure(describeCodeRequestError(error), sentEmail);
      }
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate>
      <div className="space-y-4">
        {failure?.kind === 'tooSoon' && waiting && (
          <>
            {/* Câu tĩnh đọc một lần; số đếm nằm ngoài vùng live */}
            <p role="alert" className="sr-only">
              {TOO_SOON_MESSAGE}
            </p>
            <div ref={alertRef} tabIndex={-1} className={WARNING_BOX}>
              <Clock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span aria-hidden="true">
                {TOO_SOON_MESSAGE}{' '}
                <strong>{formatCountdown(wait.remaining)}</strong>
              </span>
            </div>
          </>
        )}
        {(failure?.kind === 'message' || failure?.kind === 'backToEmail') && (
          <FormAlert alertRef={alertRef} tone="warning">
            {failure.message}
          </FormAlert>
        )}

        <RegisterFieldInput
          label="Email đăng ký"
          icon={Mail}
          type="email"
          autoComplete="email"
          placeholder="email@example.com"
          value={email}
          error={fieldError ?? undefined}
          inputRef={emailRef}
          onChange={(event) => update(event.target.value)}
        />

        <button
          type="submit"
          disabled={pending || waiting}
          className="w-full rounded-xl bg-brand-strong py-3 font-medium text-white transition-colors hover:bg-cyan-800 disabled:opacity-50 disabled:hover:bg-brand-strong"
        >
          Gửi mã OTP
        </button>

        <Link
          to={LOGIN_PATH}
          className="block text-center text-sm text-gray-500 hover:text-gray-700"
        >
          Quay về đăng nhập
        </Link>
      </div>
    </form>
  );
}
