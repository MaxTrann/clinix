import { CircleCheck, KeyRound, Lock } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { changePassword, type ChangePasswordInput } from '../auth-session';
import { FormAlert } from '../auth-form-parts';
import { RegisterFieldInput } from '../register/register-field';
import { PASSWORD_RULE_MESSAGE } from '../register/register-errors';
import { usePageActive } from '../use-page-active';
import {
  CHANGED_MESSAGE,
  CHANGE_PASSWORD_FIELDS,
  describeChangePasswordError,
  validateChangePassword,
  type ChangePasswordFailure,
} from './change-password-errors';

export interface ChangePasswordFormProps {
  // Gọi sau khi đổi thành công (người dùng vẫn ở lại trang, vẫn đăng nhập)
  onSuccess?: () => void;
  // Gọi sau khi bấm "Hủy" và ba ô đã được xoá
  onCancel?: () => void;
}

const EMPTY: ChangePasswordInput = {
  matKhauCu: '',
  matKhauMoi: '',
  xacNhan: '',
};

// Chữ green-700 trên green-50, cùng cặp màu với icon thành công của F2 (ADR 0004)
const SUCCESS_BOX =
  'flex items-start gap-2 rounded-xl border border-success-line bg-success-soft p-3 text-sm text-success';

// Khối "Đổi mật khẩu" (frame `416:366`; giống hệt ở `475:2`, `503:2`, `510:2`, `620:2`), bỏ dòng "mật khẩu demo" (G3).
// Trang chủ chỉ đặt khối này vào chỗ của nó: thẻ, tiêu đề, form đều ở đây để năm trang không chép lại.
// Mật khẩu chỉ nằm trong state của form: không `location.state`, kho trình duyệt, URL hay log; form không đọc token.
export function ChangePasswordForm({
  onSuccess,
  onCancel,
}: ChangePasswordFormProps) {
  const headingId = useId();
  const alertRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLInputElement>(null);
  const newRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  // State chưa kịp render giữa hai lần gửi liên tiếp, nên chống gửi đúp bằng ref
  const submitting = useRef(false);
  const active = usePageActive();

  const [values, setValues] = useState(EMPTY);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ChangePasswordFailure | null>(null);
  const [changed, setChanged] = useState(false);
  // Đổi `key` của ba ô để gắn lại: nút mắt về trạng thái ẩn khi xoá form
  const [generation, setGeneration] = useState(0);
  const fields = failure?.kind === 'fields' ? failure.fields : {};

  useEffect(() => {
    if (failure === null) return;
    if (failure.kind === 'fields') {
      const refs = {
        matKhauCu: currentRef,
        matKhauMoi: newRef,
        xacNhan: confirmRef,
      };
      const first = CHANGE_PASSWORD_FIELDS.find((name) => failure.fields[name]);
      if (first) refs[first].current?.focus();
    } else {
      alertRef.current?.focus();
    }
  }, [failure]);

  useEffect(() => {
    if (changed) statusRef.current?.focus();
  }, [changed]);

  function clearInputs() {
    setValues(EMPTY);
    setGeneration((value) => value + 1);
  }

  function update(name: keyof ChangePasswordInput, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    setFailure(null);
    setChanged(false);
  }

  function handleCancel() {
    clearInputs();
    setFailure(null);
    setChanged(false);
    onCancel?.();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;

    const errors = validateChangePassword(values);
    if (Object.keys(errors).length > 0) {
      setChanged(false);
      setFailure({ kind: 'fields', fields: errors });
      return;
    }

    submitting.current = true;
    setPending(true);
    setFailure(null);
    setChanged(false);
    try {
      await changePassword(values);
      // Đã rời trang: không đổi state, không gọi callback của trang đã gỡ (F2-J)
      if (!active.current) return;
      clearInputs();
      setChanged(true);
      onSuccess?.();
    } catch (error) {
      if (!active.current) return;
      const next = describeChangePasswordError(error);
      if (next.kind === 'ignored') return;
      // Không rõ kết quả: mật khẩu cũ có thể đã hết hiệu lực, giữ lại chỉ gây nhầm lẫn
      if (next.kind === 'unknown') clearInputs();
      setFailure(next);
    } finally {
      submitting.current = false;
      if (active.current) setPending(false);
    }
  }

  const alertMessage =
    failure?.kind === 'message' || failure?.kind === 'unknown'
      ? failure.message
      : null;

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-2xl border border-gray-200 bg-white p-6"
    >
      <div className="flex items-center gap-2">
        {/* Bo góc 9,375px đúng `416:368`: không có trong thang chuẩn */}
        <span className="flex size-8 shrink-0 items-center justify-center rounded-[0.625rem] bg-brand-soft">
          <KeyRound className="size-4 text-brand-strong" aria-hidden="true" />
        </span>
        <h3 id={headingId} className="text-sm font-semibold text-gray-900">
          Đổi mật khẩu
        </h3>
      </div>

      <form
        onSubmit={(event) => void handleSubmit(event)}
        noValidate
        aria-labelledby={headingId}
        className="w-full max-w-sm pt-5"
      >
        <div className="space-y-3">
          {alertMessage !== null && (
            <FormAlert alertRef={alertRef}>{alertMessage}</FormAlert>
          )}
          {changed && (
            <div
              ref={statusRef}
              role="status"
              tabIndex={-1}
              className={SUCCESS_BOX}
            >
              <CircleCheck
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              <span>{CHANGED_MESSAGE}</span>
            </div>
          )}

          <RegisterFieldInput
            key={`cu-${generation}`}
            label="Mật khẩu hiện tại"
            icon={Lock}
            secret
            compact
            autoComplete="current-password"
            placeholder="Nhập mật khẩu hiện tại"
            value={values.matKhauCu}
            error={fields.matKhauCu}
            inputRef={currentRef}
            onChange={(event) => update('matKhauCu', event.target.value)}
          />
          <RegisterFieldInput
            key={`moi-${generation}`}
            label="Mật khẩu mới"
            icon={Lock}
            secret
            compact
            autoComplete="new-password"
            placeholder="Nhập mật khẩu mới"
            value={values.matKhauMoi}
            error={fields.matKhauMoi}
            hint={PASSWORD_RULE_MESSAGE}
            inputRef={newRef}
            onChange={(event) => update('matKhauMoi', event.target.value)}
          />
          <RegisterFieldInput
            key={`xn-${generation}`}
            label="Xác nhận mật khẩu mới"
            icon={Lock}
            secret
            compact
            autoComplete="new-password"
            placeholder="Nhập lại mật khẩu mới"
            value={values.xacNhan}
            error={fields.xacNhan}
            inputRef={confirmRef}
            onChange={(event) => update('xacNhan', event.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-2 pt-4">
          {/* Viền trong suốt để hai nút cao bằng nhau như `416:421` */}
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl border border-transparent bg-brand-strong px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-800 disabled:opacity-50 disabled:hover:bg-brand-strong"
          >
            {pending ? 'Đang cập nhật…' : 'Cập nhật mật khẩu'}
          </button>
          {/* Không huỷ được request đang bay (có thể mất Set-Cookie của lần xoay), nên khoá khi đang gửi */}
          <button
            type="button"
            disabled={pending}
            onClick={handleCancel}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            Hủy
          </button>
        </div>
      </form>
    </section>
  );
}
