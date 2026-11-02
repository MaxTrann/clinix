import { useId, useState, type FormEvent } from 'react';
import { Check, X } from 'lucide-react';
import type { FormFeedback } from './catalog-errors';
import type {
  ServiceCatalogItem,
  ServiceGroup,
  ServiceInput,
} from './service-catalog-types';

interface ServiceFormProps {
  service?: ServiceCatalogItem;
  groups: ServiceGroup[];
  pending: boolean;
  feedback: FormFeedback | null;
  onCancel: () => void;
  onSubmit: (value: ServiceInput) => void;
}

export function ServiceForm({
  service,
  groups,
  pending,
  feedback,
  onCancel,
  onSubmit,
}: ServiceFormProps) {
  const id = useId();
  const [name, setName] = useState(service?.ten ?? '');
  const [groupId, setGroupId] = useState(service?.nhomDichVuId ?? '');
  const [duration, setDuration] = useState(
    service ? String(service.thoiLuong) : '',
  );
  const [price, setPrice] = useState(service?.giaMacDinh ?? '');
  const fieldClass =
    'mt-1.5 block w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:bg-surface-muted';

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedDuration = Number(duration);
    if (
      !name.trim() ||
      !groupId ||
      !Number.isInteger(parsedDuration) ||
      parsedDuration < 1 ||
      !/^\d{1,10}(?:\.\d{1,2})?$/u.test(price) ||
      Number(price) <= 0
    )
      return;
    onSubmit({
      nhomDichVuId: groupId,
      ten: name,
      thoiLuong: parsedDuration,
      giaMacDinh: price,
    });
  }

  return (
    <form
      className="rounded-xl border border-border bg-white p-5 shadow-sm"
      onSubmit={submit}
      aria-label={service ? 'Chỉnh sửa dịch vụ khám' : 'Thêm dịch vụ khám'}
      data-testid="AF3-service-form"
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-text-primary">
            {service ? 'Chỉnh sửa dịch vụ khám' : 'Thêm dịch vụ khám mới'}
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Nhập các thông tin theo danh mục dịch vụ hiện có.
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
      <div className="grid gap-4 sm:grid-cols-2">
        <label
          className="text-sm font-medium text-text-primary sm:col-span-2"
          htmlFor={`${id}-name`}
        >
          Tên dịch vụ{' '}
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
            placeholder="Ví dụ: Khám tổng quát"
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
          htmlFor={`${id}-group`}
        >
          Nhóm dịch vụ{' '}
          <span className="text-danger" aria-hidden="true">
            *
          </span>
          <select
            id={`${id}-group`}
            className={fieldClass}
            value={groupId}
            onChange={(event) => setGroupId(event.currentTarget.value)}
            required
            disabled={groups.length === 0 || pending}
            aria-invalid={Boolean(feedback?.fields.nhomDichVuId)}
            aria-describedby={
              feedback?.fields.nhomDichVuId ? `${id}-group-error` : undefined
            }
          >
            <option value="" disabled>
              Chọn nhóm dịch vụ
            </option>
            {groups.map((group) => (
              <option key={group.nhomDichVuId} value={group.nhomDichVuId}>
                {group.ten}
              </option>
            ))}
          </select>
          {groups.length === 0 && !feedback?.fields.nhomDichVuId && (
            <span className="mt-1 block text-xs font-normal text-text-muted">
              Chưa có nhóm dịch vụ để chọn.
            </span>
          )}
          {feedback?.fields.nhomDichVuId && (
            <span
              id={`${id}-group-error`}
              className="mt-1 block text-xs font-normal text-danger"
            >
              {feedback.fields.nhomDichVuId}
            </span>
          )}
        </label>
        <label
          className="text-sm font-medium text-text-primary"
          htmlFor={`${id}-duration`}
        >
          Thời lượng (phút){' '}
          <span className="text-danger" aria-hidden="true">
            *
          </span>
          <input
            id={`${id}-duration`}
            className={fieldClass}
            type="number"
            inputMode="numeric"
            min={1}
            max={2147483647}
            step={1}
            value={duration}
            onChange={(event) => setDuration(event.currentTarget.value)}
            required
            aria-invalid={Boolean(feedback?.fields.thoiLuong)}
            aria-describedby={
              feedback?.fields.thoiLuong ? `${id}-duration-error` : undefined
            }
          />
          {feedback?.fields.thoiLuong && (
            <span
              id={`${id}-duration-error`}
              className="mt-1 block text-xs font-normal text-danger"
            >
              {feedback.fields.thoiLuong}
            </span>
          )}
        </label>
        <label
          className="text-sm font-medium text-text-primary sm:col-span-2"
          htmlFor={`${id}-price`}
        >
          Giá mặc định (VND){' '}
          <span className="text-danger" aria-hidden="true">
            *
          </span>
          <input
            id={`${id}-price`}
            className={fieldClass}
            inputMode="decimal"
            pattern="[0-9]{1,10}([.][0-9]{1,2})?"
            value={price}
            onChange={(event) => setPrice(event.currentTarget.value)}
            required
            placeholder="0.00"
            aria-invalid={Boolean(feedback?.fields.giaMacDinh)}
            aria-describedby={
              feedback?.fields.giaMacDinh
                ? `${id}-price-error`
                : `${id}-price-help`
            }
          />
          {feedback?.fields.giaMacDinh ? (
            <span
              id={`${id}-price-error`}
              className="mt-1 block text-xs font-normal text-danger"
            >
              {feedback.fields.giaMacDinh}
            </span>
          ) : (
            <span
              id={`${id}-price-help`}
              className="mt-1 block text-xs font-normal text-text-muted"
            >
              Dùng dấu chấm cho phần thập phân, ví dụ 100000.00.
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
          disabled={pending || groups.length === 0 || !name.trim()}
        >
          <Check size={16} aria-hidden="true" />
          {pending ? 'Đang lưu…' : 'Lưu dịch vụ'}
        </button>
      </div>
    </form>
  );
}
