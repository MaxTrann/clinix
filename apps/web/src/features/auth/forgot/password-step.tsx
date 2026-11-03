import { Lock } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { FormAlert } from '../auth-form-parts';
import { RegisterFieldInput } from '../register/register-field';
import {
  FIELD_MESSAGES,
  PASSWORD_RULE_MESSAGE,
} from '../register/register-errors';
import { usePageActive } from '../use-page-active';
import { checkPassword } from '../validation/password-policy';
import {
  describeResetError,
  type PasswordFieldErrors,
  type ResetFailure,
} from './forgot-errors';
import { resetPassword, type ResetResult } from './forgot-service';

interface PasswordStepProps {
  // Chỉ sống trong state của trang (D7): không vào `location.state`, kho trình duyệt, URL hay log
  resetToken: string;
  onDone: (result: ResetResult) => void;
  onBackToEmail: (notice: string) => void;
  onBackToCode: () => void;
}

// Kiểm ở biên bằng đúng quy tắc của API (Q11, N10); KHÔNG trim mật khẩu
function validate(matKhauMoi: string, xacNhan: string): PasswordFieldErrors {
  const errors: PasswordFieldErrors = {};
  const issue = checkPassword(matKhauMoi);
  if (issue) errors.matKhauMoi = FIELD_MESSAGES[issue];
  if (xacNhan !== matKhauMoi) {
    errors.xacNhan = FIELD_MESSAGES.XAC_NHAN_KHONG_KHOP;
  }
  return errors;
}

// Bước 3 (frame `651:2`): placeholder và câu quy tắc như F2 (Q11, N10), nút mắt cho cả hai ô
export function PasswordStep({
  resetToken,
  onDone,
  onBackToEmail,
  onBackToCode,
}: PasswordStepProps) {
  const alertRef = useRef<HTMLDivElement>(null);
  const newRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  // State chưa kịp render giữa hai lần gửi liên tiếp, nên chống gửi đúp bằng ref
  const submitting = useRef(false);
  const active = usePageActive();

  const [matKhauMoi, setMatKhauMoi] = useState('');
  const [xacNhan, setXacNhan] = useState('');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ResetFailure | null>(null);
  const fields = failure?.kind === 'fields' ? failure.fields : {};

  useEffect(() => {
    newRef.current?.focus();
  }, []);

  useEffect(() => {
    if (failure === null) return;
    if (failure.kind === 'fields') {
      (failure.fields.matKhauMoi ? newRef : confirmRef).current?.focus();
    } else {
      alertRef.current?.focus();
    }
  }, [failure]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;

    const errors = validate(matKhauMoi, xacNhan);
    if (Object.keys(errors).length > 0) {
      setFailure({ kind: 'fields', fields: errors });
      return;
    }

    submitting.current = true;
    setPending(true);
    setFailure(null);
    try {
      const result = await resetPassword({ resetToken, matKhauMoi, xacNhan });
      if (!active.current) return;
      onDone(result);
    } catch (error) {
      if (!active.current) return;
      const next = describeResetError(error);
      if (next.kind === 'backToEmail') {
        onBackToEmail(next.message);
        return;
      }
      // Lỗi còn lại: ở lại bước này, GIỮ token và dữ liệu đã nhập để thử lại (QM-08)
      if (next.kind !== 'ignored') setFailure(next);
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate>
      <div className="space-y-4">
        {failure?.kind === 'message' && (
          <FormAlert alertRef={alertRef}>{failure.message}</FormAlert>
        )}

        <RegisterFieldInput
          label="Mật khẩu mới"
          icon={Lock}
          secret
          autoComplete="new-password"
          placeholder="Nhập mật khẩu"
          value={matKhauMoi}
          error={fields.matKhauMoi}
          hint={PASSWORD_RULE_MESSAGE}
          inputRef={newRef}
          onChange={(event) => {
            setMatKhauMoi(event.target.value);
            setFailure(null);
          }}
        />
        <RegisterFieldInput
          label="Xác nhận mật khẩu mới"
          icon={Lock}
          secret
          autoComplete="new-password"
          placeholder="Nhập lại mật khẩu"
          value={xacNhan}
          error={fields.xacNhan}
          inputRef={confirmRef}
          onChange={(event) => {
            setXacNhan(event.target.value);
            setFailure(null);
          }}
        />

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-brand-strong py-3 font-medium text-white transition-colors hover:bg-cyan-800 disabled:opacity-50 disabled:hover:bg-brand-strong"
        >
          Đặt lại mật khẩu
        </button>

        {/* `flex`: tránh lệch khoảng 5px do khung dòng chữ so với `651:87` (đo Chrome) */}
        <div className="flex justify-center">
          <button
            type="button"
            disabled={pending}
            onClick={onBackToCode}
            className="text-xs font-medium text-gray-500 hover:text-gray-700"
          >
            ← Quay lại nhập mã
          </button>
        </div>
      </div>
    </form>
  );
}
