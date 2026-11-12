import { Clock, Lock, Mail, Phone, User } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ALERT_BOX, FormAlert } from '../auth-form-parts';
import { formatCountdown, useLockCountdown } from '../login/use-lock-countdown';
import { withReturnTo } from '../return-to';
import { LOGIN_PATH, VERIFY_EMAIL_PATH } from '../roles';
import { usePageActive } from '../use-page-active';
import { trimAsciiWhitespace } from '../validation/account-policy';
import type { PendingVerification } from '../verify/verify-state';
import {
  MAIL_FAILED_MESSAGE,
  PASSWORD_RULE_MESSAGE,
  REGISTER_FIELDS,
  TOO_SOON_MESSAGE,
  describeRegisterError,
  validateRegisterForm,
  type RegisterFailure,
  type RegisterField,
} from './register-errors';
import { RegisterFieldInput } from './register-field';
import { registerAccount, type RegisterInput } from './register-service';

export interface RegisterPrefill {
  hoTen: string;
  email: string;
  soDienThoai: string;
  // Câu mang từ màn nhập mã khi phải đăng ký lại
  notice: string | null;
}

interface RegisterFormProps {
  prefill: RegisterPrefill;
  // Trang cần đăng nhập người dùng vừa rời (booking F3): chuyển tiếp sang xác minh và đăng nhập để quay lại sau đó
  returnTo?: string | null;
}

export function RegisterForm({ prefill, returnTo = null }: RegisterFormProps) {
  const navigate = useNavigate();
  const alertRef = useRef<HTMLDivElement>(null);
  const hoTenRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const soDienThoaiRef = useRef<HTMLInputElement>(null);
  const matKhauRef = useRef<HTMLInputElement>(null);
  const xacNhanRef = useRef<HTMLInputElement>(null);
  const fieldRefs: Record<RegisterField, typeof hoTenRef> = {
    hoTen: hoTenRef,
    email: emailRef,
    soDienThoai: soDienThoaiRef,
    matKhau: matKhauRef,
    xacNhan: xacNhanRef,
  };
  // State chưa kịp render giữa hai lần gửi liên tiếp, nên chống gửi đúp bằng ref
  const submitting = useRef(false);
  const active = usePageActive();

  // Mật khẩu chỉ ở đây, không vào `location.state`, lịch sử hay kho nào; rời trang là mất
  const [values, setValues] = useState<RegisterInput>({
    hoTen: prefill.hoTen,
    email: prefill.email,
    soDienThoai: prefill.soDienThoai,
    matKhau: '',
    xacNhan: '',
  });
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<RegisterFailure | null>(
    prefill.notice === null
      ? null
      : { kind: 'message', message: prefill.notice },
  );
  const wait = useLockCountdown();

  const waiting = wait.remaining > 0;
  const fieldErrors = failure?.kind === 'fields' ? failure.fields : {};

  useEffect(() => {
    if (failure === null) return;
    if (failure.kind === 'fields') {
      const first = REGISTER_FIELDS.find((field) => failure.fields[field]);
      fieldRefs[first as RegisterField].current?.focus();
      return;
    }
    alertRef.current?.focus();
    // `fieldRefs` tạo lại mỗi lần render nhưng các ref bên trong không đổi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failure]);

  function update(field: RegisterField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    // Hộp đếm ngược phải còn khi nút đang khoá, nếu không nút khoá mà không có lời giải thích
    setFailure((current) => (current?.kind === 'tooSoon' ? current : null));
  }

  function goToVerify(code: {
    verifyId: string | null;
    resendId: string;
    hetHanLuc: string | null;
    coTheGuiLaiLuc: string;
    notice: string | null;
  }) {
    const email = trimAsciiWhitespace(values.email);
    const { hoTen, soDienThoai } = values;
    const state: PendingVerification = {
      ...code,
      email,
      fresh: true,
      draft: { hoTen, email, soDienThoai },
      ...(returnTo === null ? {} : { from: returnTo }),
    };
    // `replace`: Back không quay về biểu mẫu đã gửi
    navigate(VERIFY_EMAIL_PATH, { replace: true, state });
  }

  function applyFailure(next: RegisterFailure) {
    if (next.kind === 'ignored') return;
    if (next.kind === 'mailFailed') {
      // Tài khoản đã lưu, chỉ thư không đi: không bắt nhập lại biểu mẫu
      goToVerify({
        verifyId: null,
        resendId: next.maXacThucId,
        hetHanLuc: null,
        coTheGuiLaiLuc: next.coTheGuiLaiLuc,
        notice: MAIL_FAILED_MESSAGE,
      });
      return;
    }
    if (next.kind === 'tooSoon') wait.start(next.seconds);
    setFailure(next);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || waiting) return;

    const fields = validateRegisterForm(values);
    if (Object.keys(fields).length > 0) {
      setFailure({ kind: 'fields', fields });
      return;
    }

    submitting.current = true;
    setPending(true);
    setFailure(null);
    try {
      const code = await registerAccount(values);
      // Đã rời trang trong lúc chờ: không kéo người dùng sang màn nhập mã
      if (!active.current) return;
      goToVerify({
        verifyId: code.maXacThucId,
        resendId: code.maXacThucId,
        hetHanLuc: code.hetHanLuc,
        coTheGuiLaiLuc: code.coTheGuiLaiLuc,
        notice: null,
      });
    } catch (error) {
      if (active.current) applyFailure(describeRegisterError(error));
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <div className="space-y-4">
          {failure?.kind === 'message' && (
            <FormAlert alertRef={alertRef}>{failure.message}</FormAlert>
          )}

          {failure?.kind === 'emailTaken' && (
            <FormAlert alertRef={alertRef}>
              {failure.message}{' '}
              <Link
                to={LOGIN_PATH}
                state={withReturnTo(
                  { email: trimAsciiWhitespace(values.email) },
                  returnTo,
                )}
                className="font-medium underline"
              >
                Đăng nhập
              </Link>
            </FormAlert>
          )}

          {failure?.kind === 'tooSoon' && waiting && (
            <>
              {/* Câu tĩnh đọc một lần; số đếm nằm ngoài vùng live */}
              <p role="alert" className="sr-only">
                {TOO_SOON_MESSAGE}
              </p>
              <div ref={alertRef} tabIndex={-1} className={ALERT_BOX}>
                <Clock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span aria-hidden="true">
                  {TOO_SOON_MESSAGE}{' '}
                  <strong>{formatCountdown(wait.remaining)}</strong>
                </span>
              </div>
            </>
          )}

          <RegisterFieldInput
            label="Họ và tên"
            icon={User}
            type="text"
            autoComplete="name"
            placeholder="Nguyễn Văn A"
            value={values.hoTen}
            error={fieldErrors.hoTen}
            inputRef={hoTenRef}
            onChange={(event) => update('hoTen', event.target.value)}
          />
          <RegisterFieldInput
            label="Email"
            icon={Mail}
            type="email"
            autoComplete="email"
            placeholder="email@example.com"
            value={values.email}
            error={fieldErrors.email}
            inputRef={emailRef}
            onChange={(event) => update('email', event.target.value)}
          />
          <RegisterFieldInput
            label="Số điện thoại"
            icon={Phone}
            type="tel"
            autoComplete="tel"
            placeholder="0901234567"
            value={values.soDienThoai}
            error={fieldErrors.soDienThoai}
            inputRef={soDienThoaiRef}
            onChange={(event) => update('soDienThoai', event.target.value)}
          />
          <RegisterFieldInput
            label="Mật khẩu"
            icon={Lock}
            secret
            autoComplete="new-password"
            placeholder="Nhập mật khẩu"
            value={values.matKhau}
            error={fieldErrors.matKhau}
            hint={PASSWORD_RULE_MESSAGE}
            inputRef={matKhauRef}
            onChange={(event) => update('matKhau', event.target.value)}
          />
          <RegisterFieldInput
            label="Xác nhận mật khẩu"
            icon={Lock}
            secret
            autoComplete="new-password"
            placeholder="Nhập lại mật khẩu"
            value={values.xacNhan}
            error={fieldErrors.xacNhan}
            inputRef={xacNhanRef}
            onChange={(event) => update('xacNhan', event.target.value)}
          />

          <button
            type="submit"
            disabled={pending || waiting}
            className="w-full rounded-xl bg-brand-strong py-3 font-medium text-white transition-colors hover:bg-cyan-800 disabled:opacity-50 disabled:hover:bg-brand-strong"
          >
            Tạo tài khoản
          </button>
        </div>
      </form>

      <p className="mt-4 text-center text-sm text-gray-500">
        Đã có tài khoản?{' '}
        <Link
          to={LOGIN_PATH}
          state={withReturnTo(undefined, returnTo)}
          className="font-medium text-brand-strong hover:underline"
        >
          Đăng nhập
        </Link>
      </p>
    </>
  );
}
