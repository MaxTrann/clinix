import { Lock } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  FormAlert,
  PASSWORD_RULE_MESSAGE,
  RegisterFieldInput,
  usePageActive,
  validateNewPassword,
} from '../auth';
import type { ActivationLink } from './activation-link';
import {
  describeCompleteError,
  type PasswordFieldErrors,
} from './activation-errors';
import { completeActivation } from './activation-service';

interface ActivationFormProps {
  // Chỉ sống trong state của trang cha: không vào `location.state`, kho trình duyệt, URL, DOM hay log
  link: ActivationLink;
  onActivated: () => void;
  // `complete` báo liên kết không còn dùng được (hết hạn giữa chừng, đã dùng): cha chuyển sang màn "không hợp lệ"
  onInvalid: () => void;
}

type Failure =
  | { kind: 'fields'; fields: PasswordFieldErrors }
  | { kind: 'message'; message: string };

// Form đặt mật khẩu (NS b10, A6): hai ô như bước 3 của Quên mật khẩu, không có ô email hay họ tên.
export function ActivationForm({
  link,
  onActivated,
  onInvalid,
}: ActivationFormProps) {
  const alertRef = useRef<HTMLDivElement>(null);
  const newRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  // State chưa kịp render giữa hai lần gửi liên tiếp, nên chống gửi đúp bằng ref
  const submitting = useRef(false);
  const active = usePageActive();

  const [matKhauMoi, setMatKhauMoi] = useState('');
  const [xacNhan, setXacNhan] = useState('');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
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

    // Kiểm ở biên bằng đúng validator của auth (Q11, N10; KHÔNG trim). Sai thì không gọi API: liên kết không bị đụng tới (A6)
    const errors = validateNewPassword(matKhauMoi, xacNhan);
    if (Object.keys(errors).length > 0) {
      setFailure({ kind: 'fields', fields: errors });
      return;
    }

    submitting.current = true;
    setPending(true);
    setFailure(null);
    try {
      await completeActivation(link, matKhauMoi, xacNhan);
      if (!active.current) return;
      onActivated();
    } catch (error) {
      if (!active.current) return;
      const next = describeCompleteError(error);
      if (next.kind === 'invalid') {
        onInvalid();
        return;
      }
      // Lỗi còn lại: ở lại form, GIỮ liên kết và dữ liệu đã nhập để sửa rồi gửi lại
      if (next.kind !== 'ignored') setFailure(next);
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
      aria-busy={pending}
    >
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
          Kích hoạt tài khoản
        </button>
      </div>
    </form>
  );
}
