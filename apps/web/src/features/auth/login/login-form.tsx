import {
  ArrowRight,
  CircleAlert,
  Clock,
  Eye,
  EyeOff,
  Lock,
  Mail,
} from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import { login } from '../auth-session';
import {
  FORGOT_PASSWORD_PATH,
  REGISTER_PATH,
  VERIFY_EMAIL_PATH,
} from '../roles';
import {
  describeLoginError,
  lockAnnouncement,
  validateLoginForm,
  verifyEmailHandoff,
  type LoginFailure,
} from './login-errors';
import { formatCountdown, useLockCountdown } from './use-lock-countdown';

const ALERT_BOX =
  'flex items-start gap-2 rounded-xl border border-danger-line bg-danger-soft p-3 text-sm text-danger-strong';
const FIELD_ICON =
  'pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400';
const FIELD_INPUT = 'w-full py-3 pl-10';

interface LoginFormProps {
  // Chỉ hiện khi biểu mẫu chưa có lỗi nào, để không chồng hai thông báo
  sessionEnded: boolean;
}

export function LoginForm({ sessionEnded }: LoginFormProps) {
  const emailId = useId();
  const passwordId = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  // State chưa kịp render giữa hai lần gửi liên tiếp, nên chống gửi đúp bằng ref
  const submitting = useRef(false);

  const [email, setEmail] = useState('');
  const [matKhau, setMatKhau] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<LoginFailure | null>(null);
  const { remaining, expired, start: startLock } = useLockCountdown();

  const locked = remaining > 0;
  const fieldErrors = failure?.kind === 'fields' ? failure.fields : {};

  useEffect(() => {
    if (!failure) return;
    if (failure.kind === 'fields') {
      (failure.fields.email ? emailRef : passwordRef).current?.focus();
    } else if (failure.kind === 'message' && failure.clearPassword) {
      passwordRef.current?.focus();
    } else {
      // Khoá thì mọi ô đều vô hiệu; các lỗi còn lại không gắn với ô nào
      alertRef.current?.focus();
    }
  }, [failure]);

  useEffect(() => {
    // Hộp khoá vừa biến mất cùng phần tử đang focus: đưa bàn phím về ô nhập
    if (expired && document.activeElement === document.body) {
      passwordRef.current?.focus();
    }
  }, [expired]);

  function clearFailure() {
    setFailure(null);
  }

  function applyFailure(next: LoginFailure) {
    if (next.kind === 'ignored') return;
    if (next.kind === 'locked') startLock(next.seconds);
    if (
      next.kind === 'locked' ||
      (next.kind === 'message' && next.clearPassword)
    ) {
      setMatKhau('');
    }
    setFailure(next);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || locked) return;

    const fields = validateLoginForm(email, matKhau);
    if (Object.keys(fields).length > 0) {
      setFailure({ kind: 'fields', fields });
      return;
    }

    submitting.current = true;
    setPending(true);
    setFailure(null);
    try {
      // Thành công thì `LoginPage` chuyển hướng theo vai trò, ở đây không làm gì thêm
      await login(email, matKhau);
    } catch (error) {
      applyFailure(describeLoginError(error));
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <div className="space-y-4">
          {locked && failure?.kind === 'locked' && (
            <>
              {/* Câu tĩnh đọc một lần; số đếm nằm ngoài vùng live để không bị đọc lại mỗi giây */}
              <p role="alert" className="sr-only">
                {lockAnnouncement(failure.seconds)}
              </p>
              <div ref={alertRef} tabIndex={-1} className={ALERT_BOX}>
                <Clock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  <span aria-hidden="true">
                    Tài khoản bị khóa tạm thời do nhập sai nhiều lần. Thử lại
                    sau <strong>{formatCountdown(remaining)}</strong>.{' '}
                  </span>
                  <Link to={FORGOT_PASSWORD_PATH} className="underline">
                    Quên mật khẩu?
                  </Link>
                </span>
              </div>
            </>
          )}

          {failure?.kind === 'message' && (
            <FormAlert alertRef={alertRef}>{failure.message}</FormAlert>
          )}

          {failure?.kind === 'unverified' && (
            <FormAlert alertRef={alertRef}>
              {failure.message}{' '}
              <Link
                to={VERIFY_EMAIL_PATH}
                state={verifyEmailHandoff(email, failure.chiTiet)}
                className="font-medium underline"
              >
                Nhập mã xác minh
              </Link>
            </FormAlert>
          )}

          {failure?.kind === 'reregister' && (
            <FormAlert alertRef={alertRef}>
              {failure.message}{' '}
              <Link
                to={REGISTER_PATH}
                state={{ email }}
                className="font-medium underline"
              >
                Đăng ký lại
              </Link>
            </FormAlert>
          )}

          {sessionEnded && !failure && !locked && (
            <p
              role="status"
              className="rounded-xl border border-warning-line bg-warning-soft p-3 text-sm text-warning"
            >
              Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.
            </p>
          )}

          {expired && (
            <p role="status" className="sr-only">
              Bạn có thể đăng nhập lại.
            </p>
          )}

          <div>
            <label
              htmlFor={emailId}
              className="mb-1.5 block text-sm font-medium text-gray-600"
            >
              Email
            </label>
            <div className="relative">
              <Mail className={FIELD_ICON} aria-hidden="true" />
              <input
                ref={emailRef}
                id={emailId}
                type="email"
                autoComplete="username"
                placeholder="email@example.com"
                required
                disabled={locked}
                value={email}
                aria-invalid={fieldErrors.email ? true : undefined}
                aria-describedby={
                  fieldErrors.email ? `${emailId}-error` : undefined
                }
                onChange={(event) => {
                  setEmail(event.target.value);
                  clearFailure();
                }}
                className={`${FIELD_INPUT} pr-4`}
              />
            </div>
            {fieldErrors.email && (
              <FieldError id={`${emailId}-error`}>
                {fieldErrors.email}
              </FieldError>
            )}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label
                htmlFor={passwordId}
                className="text-sm font-medium text-gray-600"
              >
                Mật khẩu
              </label>
              <Link
                to={FORGOT_PASSWORD_PATH}
                className="text-xs text-brand-strong hover:underline"
              >
                Quên mật khẩu?
              </Link>
            </div>
            <div className="relative">
              <Lock className={FIELD_ICON} aria-hidden="true" />
              <input
                ref={passwordRef}
                id={passwordId}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Nhập mật khẩu"
                required
                disabled={locked}
                value={matKhau}
                aria-invalid={fieldErrors.matKhau ? true : undefined}
                aria-describedby={
                  fieldErrors.matKhau ? `${passwordId}-error` : undefined
                }
                onChange={(event) => {
                  setMatKhau(event.target.value);
                  clearFailure();
                }}
                className={`${FIELD_INPUT} pr-10`}
              />
              <button
                type="button"
                aria-label="Hiện mật khẩu"
                aria-pressed={showPassword}
                disabled={locked}
                onClick={() => setShowPassword((shown) => !shown)}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-gray-500 disabled:opacity-60"
              >
                {showPassword ? (
                  <EyeOff className="size-4" aria-hidden="true" />
                ) : (
                  <Eye className="size-4" aria-hidden="true" />
                )}
              </button>
            </div>
            {fieldErrors.matKhau && (
              <FieldError id={`${passwordId}-error`}>
                {fieldErrors.matKhau}
              </FieldError>
            )}
          </div>

          <button
            type="submit"
            disabled={locked || pending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-strong py-3 font-medium text-white transition-colors hover:bg-cyan-800 disabled:opacity-50 disabled:hover:bg-brand-strong"
          >
            Đăng nhập
            <ArrowRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </form>

      <p className="mt-4 text-center text-sm text-gray-500">
        Chưa có tài khoản?{' '}
        <Link
          to={REGISTER_PATH}
          className="font-medium text-brand-strong hover:underline"
        >
          Đăng ký ngay
        </Link>
      </p>
    </>
  );
}

function FormAlert({
  alertRef,
  children,
}: {
  alertRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  return (
    <div ref={alertRef} role="alert" tabIndex={-1} className={ALERT_BOX}>
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

function FieldError({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return (
    <p id={id} className="mt-1 text-xs text-danger">
      {children}
    </p>
  );
}
