import { useId, useState, type FormEvent } from 'react';
import { Check, X } from 'lucide-react';
import type { FormFeedback } from './catalog-errors';
import type { ServiceGroup, ServiceGroupInput } from './service-catalog-types';

interface ServiceGroupFormProps {
  group?: ServiceGroup;
  pending: boolean;
  feedback: FormFeedback | null;
  onCancel: () => void;
  onSubmit: (value: ServiceGroupInput) => void;
}

export function ServiceGroupForm({
  group,
  pending,
  feedback,
  onCancel,
  onSubmit,
}: ServiceGroupFormProps) {
  const id = useId();
  const [name, setName] = useState(group?.ten ?? '');
  const [order, setOrder] = useState(String(group?.thuTuHienThi ?? 1));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedOrder = Number(order);
    if (!name.trim() || !Number.isInteger(parsedOrder) || parsedOrder < 0)
      return;
    onSubmit({ ten: name, thuTuHienThi: parsedOrder });
  }

  const fieldClass =
    'mt-1.5 block w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:bg-surface-muted';

  return (
    <form
      className="rounded-xl border border-border bg-white p-5 shadow-sm"
      onSubmit={submit}
      aria-label={group ? 'Chỉnh sửa nhóm dịch vụ' : 'Thêm nhóm dịch vụ'}
      data-testid="AF3-group-form"
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-text-primary">
            {group ? 'Chỉnh sửa nhóm dịch vụ' : 'Thêm nhóm dịch vụ mới'}
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Nhóm dịch vụ dùng chung toàn hệ thống.
          </p>
        </div>
        <button
          type="button"
          className="rounded-md p-1.5 text-text-muted hover:bg-surface-muted hover:text-text-primary focus-visible:outline-2 focus-visible:outline-brand"
          aria-label="Đóng biểu mẫu"
          onClick={onCancel}
          disabled={pending}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(140px,1fr)]">
        <label
          className="text-sm font-medium text-text-primary"
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
            onChange={(event) => setName(event.currentTarget.value)}
            maxLength={100}
            required
            autoFocus
            placeholder="Ví dụ: Khám theo chuyên khoa"
            aria-invalid={Boolean(feedback?.fields.ten)}
            aria-describedby={
              feedback?.fields.ten ? `${id}-name-error` : undefined
            }
          />
          {feedback?.fields.ten && (
            <span
              id={`${id}-name-error`}
              className="mt-1 block text-xs font-normal text-danger"
            >
              {feedback.fields.ten}
            </span>
          )}
        </label>
        <label
          className="text-sm font-medium text-text-primary"
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
            onChange={(event) => setOrder(event.currentTarget.value)}
            required
            aria-invalid={Boolean(feedback?.fields.thuTuHienThi)}
          />
          <span className="mt-1 block text-xs font-normal text-text-muted">
            Số nhỏ hơn hiển thị trước.
          </span>
          {feedback?.fields.thuTuHienThi && (
            <span className="mt-1 block text-xs font-normal text-danger">
              {feedback.fields.thuTuHienThi}
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
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-60"
          onClick={onCancel}
          disabled={pending}
        >
          Hủy
        </button>
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-wait disabled:opacity-60"
          disabled={pending || !name.trim()}
        >
          <Check size={16} aria-hidden="true" />
          {pending ? 'Đang lưu…' : 'Lưu nhóm'}
        </button>
      </div>
    </form>
  );
}
