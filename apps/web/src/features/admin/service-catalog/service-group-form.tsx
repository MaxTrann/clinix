import { useId, useRef, useState, type FormEvent } from 'react';
import { useFocusFirstInvalid } from '../hooks/use-focus-first-invalid';
import type { FormFeedback } from './catalog-errors';
import {
  validateGroupInput,
  type GroupFieldErrors,
} from './catalog-validation';
import type { ServiceGroup, ServiceGroupInput } from './service-catalog-types';

interface ServiceGroupFormProps {
  group?: ServiceGroup;
  pending: boolean;
  feedback: FormFeedback | null;
  onCancel: () => void;
  // Trả Promise để form biết khi nào lần lưu xong (cờ chống bấm đúp)
  onSubmit: (value: ServiceGroupInput) => Promise<void> | void;
}

export function ServiceGroupForm({
  group,
  pending,
  feedback,
  onCancel,
  onSubmit,
}: ServiceGroupFormProps) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  // Hạ xuống khi lần lưu trước xong: hai lần submit liên tiếp (bấm đúp, Enter hai lần) chỉ gửi MỘT yêu cầu
  const submittingRef = useRef(false);
  const [name, setName] = useState(group?.ten ?? '');
  const [order, setOrder] = useState(String(group?.thuTuHienThi ?? 1));
  // Lỗi phía form (admin PR2 mục 6.3); lỗi từ máy chủ đến qua `feedback`
  const [errors, setErrors] = useState<GroupFieldErrors>({});
  const [attempt, setAttempt] = useState(0);
  // Chỉ chuyển focus khi vừa bấm lưu hỏng hoặc có feedback MỚI, không khi người dùng đang gõ (điều kiện B)
  useFocusFirstInvalid(formRef, attempt);
  useFocusFirstInvalid(formRef, feedback);

  const nameError = errors.ten ?? feedback?.fields.ten;
  const orderError = errors.thuTuHienThi ?? feedback?.fields.thuTuHienThi;

  function clearError(field: keyof GroupFieldErrors) {
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current || pending) return;
    const result = validateGroupInput(name, order);
    setErrors(result.errors);
    if (!result.value) {
      setAttempt((count) => count + 1);
      return;
    }
    submittingRef.current = true;
    try {
      await onSubmit(result.value);
    } finally {
      submittingRef.current = false;
    }
  }

  const fieldClass =
    'mt-[3.75px] block min-h-[39.1px] w-full rounded-[13.375px] border border-[#e5e7eb] bg-white px-[11.25px] py-[9.375px] text-[13.125px] font-normal text-text-primary transition placeholder:text-text-muted disabled:bg-surface-muted';

  return (
    <form
      ref={formRef}
      className={
        group
          ? 'bg-white px-[15px] pb-[15px]' // Figma 562:2: form sửa nằm phẳng trong hàng bảng
          : 'rounded-[13.375px] border border-[#e5e7eb] bg-white p-[18.75px]'
      }
      noValidate
      onSubmit={(event) => void submit(event)}
      aria-label={group ? 'Chỉnh sửa nhóm dịch vụ' : 'Thêm nhóm dịch vụ'}
      data-testid="AF3-group-form"
    >
      {!group && (
        <h2 className="mb-[15px] text-[13.125px] font-semibold text-text-primary">
          Thêm nhóm dịch vụ mới
        </h2>
      )}
      <div className="grid gap-[15px]">
        <label
          className="text-[11.25px] font-medium text-[#364153]"
          htmlFor={`${id}-name`}
        >
          Tên nhóm{' '}
          <span className="text-danger" aria-hidden="true">
            *
          </span>
          <input
            id={`${id}-name`}
            className={fieldClass}
            value={name}
            onChange={(event) => {
              setName(event.currentTarget.value);
              clearError('ten');
            }}
            maxLength={100}
            required
            autoFocus
            placeholder="Ví dụ: Khám theo chuyên khoa"
            aria-invalid={Boolean(nameError)}
            aria-describedby={nameError ? `${id}-name-error` : undefined}
          />
          {nameError && (
            <span
              id={`${id}-name-error`}
              role="alert"
              className="mt-1 block text-[11.25px] font-normal text-danger"
            >
              {nameError}
            </span>
          )}
        </label>
        <label
          className="max-w-[395px] text-[11.25px] font-medium text-[#364153]"
          htmlFor={`${id}-order`}
        >
          Thứ tự hiển thị
          <input
            id={`${id}-order`}
            className={fieldClass}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={order}
            onChange={(event) => {
              setOrder(event.currentTarget.value);
              clearError('thuTuHienThi');
            }}
            required
            aria-invalid={Boolean(orderError)}
            aria-describedby={
              orderError ? `${id}-order-error` : `${id}-order-help`
            }
          />
          {orderError ? (
            <span
              id={`${id}-order-error`}
              role="alert"
              className="mt-1 block text-[11.25px] font-normal text-danger"
            >
              {orderError}
            </span>
          ) : (
            <span
              id={`${id}-order-help`}
              className="mt-1 block text-[11.25px] font-normal text-[#99a1af]"
            >
              Số nhỏ hơn hiển thị trước.
            </span>
          )}
        </label>
      </div>
      {feedback?.message && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-danger"
        >
          {feedback.message}
        </p>
      )}
      <div className="mt-[18.75px] flex flex-wrap justify-end gap-[11.25px]">
        <button
          type="button"
          className="rounded-[13.375px] border border-[#e5e7eb] px-[15px] py-[7.5px] text-[13.125px] font-medium text-[#4a5565] hover:bg-surface-muted disabled:opacity-60"
          onClick={onCancel}
          disabled={pending}
        >
          Hủy
        </button>
        {/* Không mờ khi tên trống (Đại chọn 16/11/2026): bấm Lưu thì câu lỗi hiện dưới ô tên */}
        <button
          type="submit"
          className="inline-flex items-center gap-[7.5px] rounded-[13.375px] bg-brand px-[15px] py-[7.5px] text-[13.125px] font-medium text-white hover:bg-brand-hover disabled:cursor-wait disabled:opacity-60"
          disabled={pending}
        >
          <img
            src="/assets/admin/branches/save.svg"
            alt=""
            width={15}
            height={15}
          />
          {pending ? 'Đang lưu…' : 'Lưu nhóm'}
        </button>
      </div>
    </form>
  );
}
