import { useId, useState, type FormEvent } from 'react';
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
    'mt-[3.75px] block min-h-[39.1px] w-full rounded-[13.375px] border border-[#e5e7eb] bg-white px-[11.25px] py-[9.375px] text-[13.125px] font-normal text-text-primary outline-none transition placeholder:text-text-muted focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:bg-surface-muted';

  return (
    <form
      className={
        group
          ? 'bg-white px-[15px] pb-[15px]' // Figma 562:2: form sửa nằm phẳng trong hàng bảng
          : 'rounded-[13.375px] border border-[#e5e7eb] bg-white p-[18.75px]'
      }
      onSubmit={submit}
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
              className="mt-1 block text-[11.25px] font-normal text-danger"
            >
              {feedback.fields.ten}
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
            onChange={(event) => setOrder(event.currentTarget.value)}
            required
            aria-invalid={Boolean(feedback?.fields.thuTuHienThi)}
          />
          <span className="mt-1 block text-[11.25px] font-normal text-[#99a1af]">
            Số nhỏ hơn hiển thị trước.
          </span>
          {feedback?.fields.thuTuHienThi && (
            <span className="mt-1 block text-[11.25px] font-normal text-danger">
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
      <div className="mt-[18.75px] flex flex-wrap justify-end gap-[11.25px]">
        <button
          type="button"
          className="rounded-[13.375px] border border-[#e5e7eb] px-[15px] py-[7.5px] text-[13.125px] font-medium text-[#4a5565] hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-60"
          onClick={onCancel}
          disabled={pending}
        >
          Hủy
        </button>
        <button
          type="submit"
          className="inline-flex items-center gap-[7.5px] rounded-[13.375px] bg-brand px-[15px] py-[7.5px] text-[13.125px] font-medium text-white hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-wait disabled:opacity-60"
          disabled={pending || !name.trim()}
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
