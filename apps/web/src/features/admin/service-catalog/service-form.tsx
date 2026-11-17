import { useId, useRef, useState, type FormEvent } from 'react';
import { useFocusFirstInvalid } from '../hooks/use-focus-first-invalid';
import type { FormFeedback } from './catalog-errors';
import {
  validateServiceInput,
  type ServiceFieldErrors,
} from './catalog-validation';
import { formatThousands, parseApiPrice } from './price-format';
import { PriceInput } from './price-input';
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
  // Trả Promise để form biết khi nào lần lưu xong (cờ chống bấm đúp)
  onSubmit: (value: ServiceInput) => Promise<void> | void;
}

// Ô nhập dùng chung; ô giá thay `px-*` bằng `pl-*` + `pr-9` để chừa chỗ cho hậu tố "đ" mà không để hai lớp padding phải cùng tồn tại
// (thứ tự trong CSS build quyết định lớp nào thắng, nên chỉ dùng MỘT lớp padding phải cho mỗi ô)
const FIELD_BASE =
  'mt-[3.75px] block min-h-[39.1px] w-full rounded-[13.375px] border border-[#e5e7eb] bg-white py-[9.375px] text-[13.125px] font-normal text-text-primary transition placeholder:text-text-muted disabled:bg-surface-muted';
const FIELD_CLASS = `${FIELD_BASE} px-[11.25px]`;
const PRICE_FIELD_CLASS = `${FIELD_BASE} pl-[11.25px] pr-9`;

const ERROR_CLASS = 'mt-1 block text-[11.25px] font-normal text-danger';
const HINT_CLASS = 'mt-1 block text-[11.25px] font-normal text-text-muted';

export function ServiceForm({
  service,
  groups,
  pending,
  feedback,
  onCancel,
  onSubmit,
}: ServiceFormProps) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  // Hạ xuống khi lần lưu trước xong: hai lần submit liên tiếp chỉ gửi MỘT yêu cầu
  const submittingRef = useRef(false);
  // Giá API ("150000.00", "350000.50") nạp vào ô dạng số nguyên đồng; phần lẻ khác 0 được báo rõ bằng một dòng gợi ý (không làm tròn thầm)
  const [legacyPrice] = useState(() =>
    service ? parseApiPrice(service.giaMacDinh) : null,
  );
  const [name, setName] = useState(service?.ten ?? '');
  const [groupId, setGroupId] = useState(service?.nhomDichVuId ?? '');
  const [duration, setDuration] = useState(
    service ? String(service.thoiLuong) : '',
  );
  const [price, setPrice] = useState(legacyPrice?.digits ?? '');
  // Lỗi phía form (admin PR2 mục 6.3); lỗi từ máy chủ đến qua `feedback`
  const [errors, setErrors] = useState<ServiceFieldErrors>({});
  const [attempt, setAttempt] = useState(0);
  // Chỉ chuyển focus khi vừa bấm lưu hỏng hoặc có feedback MỚI, không khi người dùng đang gõ (điều kiện B)
  useFocusFirstInvalid(formRef, attempt);
  useFocusFirstInvalid(formRef, feedback);

  const nameError = errors.ten ?? feedback?.fields.ten;
  const groupError = errors.nhomDichVuId ?? feedback?.fields.nhomDichVuId;
  const durationError = errors.thoiLuong ?? feedback?.fields.thoiLuong;
  const priceError = errors.giaMacDinh ?? feedback?.fields.giaMacDinh;
  const legacyHint =
    legacyPrice?.hasFraction && price === legacyPrice.digits
      ? `Giá cũ ${formatThousands(legacyPrice.digits)},${legacyPrice.fraction}đ có phần lẻ; lưu sẽ lưu thành ${formatThousands(legacyPrice.digits)}đ.`
      : '';
  const priceDescribedBy = [
    priceError ? `${id}-price-error` : `${id}-price-help`,
    legacyHint ? `${id}-price-legacy` : '',
  ]
    .filter(Boolean)
    .join(' ');

  function clearError(field: keyof ServiceFieldErrors) {
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current || pending) return;
    const result = validateServiceInput({
      name,
      groupId,
      duration,
      priceDigits: price,
    });
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

  return (
    <form
      ref={formRef}
      className={
        service
          ? 'bg-white px-[15px] pb-[15px]' // Figma 565:2: form sửa nằm phẳng trong hàng bảng
          : 'rounded-[13.375px] border border-[#e5e7eb] bg-white p-[18.75px]'
      }
      noValidate
      onSubmit={(event) => void submit(event)}
      aria-label={service ? 'Chỉnh sửa dịch vụ khám' : 'Thêm dịch vụ khám'}
      data-testid="AF3-service-form"
    >
      {!service && (
        <h2 className="mb-[15px] text-[13.125px] font-semibold text-text-primary">
          Thêm dịch vụ khám mới
        </h2>
      )}
      <div className="grid gap-[15px] sm:grid-cols-2">
        <label
          className="text-[11.25px] font-medium text-[#364153] sm:col-span-2"
          htmlFor={`${id}-name`}
        >
          Tên dịch vụ{' '}
          <span className="text-danger" aria-hidden="true">
            *
          </span>
          <input
            id={`${id}-name`}
            className={FIELD_CLASS}
            value={name}
            onChange={(event) => {
              setName(event.currentTarget.value);
              clearError('ten');
            }}
            maxLength={100}
            required
            autoFocus
            placeholder="Ví dụ: Khám tổng quát"
            aria-invalid={Boolean(nameError)}
            aria-describedby={nameError ? `${id}-name-error` : undefined}
          />
          {nameError && (
            <span id={`${id}-name-error`} role="alert" className={ERROR_CLASS}>
              {nameError}
            </span>
          )}
        </label>
        <label
          className="text-[11.25px] font-medium text-[#364153]"
          htmlFor={`${id}-group`}
        >
          Nhóm dịch vụ{' '}
          <span className="text-danger" aria-hidden="true">
            *
          </span>
          <select
            id={`${id}-group`}
            className={FIELD_CLASS}
            value={groupId}
            onChange={(event) => {
              setGroupId(event.currentTarget.value);
              clearError('nhomDichVuId');
            }}
            required
            disabled={groups.length === 0 || pending}
            aria-invalid={Boolean(groupError)}
            aria-describedby={groupError ? `${id}-group-error` : undefined}
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
          {groups.length === 0 && !groupError && (
            <span className="mt-1 block text-[11.25px] font-normal text-[#99a1af]">
              Chưa có nhóm dịch vụ để chọn.
            </span>
          )}
          {groupError && (
            <span id={`${id}-group-error`} role="alert" className={ERROR_CLASS}>
              {groupError}
            </span>
          )}
        </label>
        <label
          className="text-[11.25px] font-medium text-[#364153]"
          htmlFor={`${id}-duration`}
        >
          Thời lượng (phút){' '}
          <span className="text-danger" aria-hidden="true">
            *
          </span>
          <input
            id={`${id}-duration`}
            className={FIELD_CLASS}
            type="number"
            inputMode="numeric"
            min={1}
            max={2147483647}
            step={1}
            value={duration}
            onChange={(event) => {
              setDuration(event.currentTarget.value);
              clearError('thoiLuong');
            }}
            required
            aria-invalid={Boolean(durationError)}
            aria-describedby={
              durationError ? `${id}-duration-error` : undefined
            }
          />
          {durationError && (
            <span
              id={`${id}-duration-error`}
              role="alert"
              className={ERROR_CLASS}
            >
              {durationError}
            </span>
          )}
        </label>
        <label
          className="text-[11.25px] font-medium text-[#364153]"
          htmlFor={`${id}-price`}
        >
          Giá mặc định (VND){' '}
          <span className="text-danger" aria-hidden="true">
            *
          </span>
          <PriceInput
            id={`${id}-price`}
            className={PRICE_FIELD_CLASS}
            digits={price}
            onDigitsChange={(digits) => {
              setPrice(digits);
              clearError('giaMacDinh');
            }}
            onTooLong={() =>
              setErrors((current) => ({
                ...current,
                giaMacDinh: 'Giá tối đa 10 chữ số.',
              }))
            }
            invalid={Boolean(priceError)}
            describedBy={priceDescribedBy}
          />
          {priceError ? (
            <span id={`${id}-price-error`} role="alert" className={ERROR_CLASS}>
              {priceError}
            </span>
          ) : (
            <span id={`${id}-price-help`} className={HINT_CLASS}>
              Chỉ nhập số, đơn vị đồng. Ví dụ 150.000
            </span>
          )}
          {legacyHint && (
            <span id={`${id}-price-legacy`} className={HINT_CLASS}>
              {legacyHint}
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
        {/* Không mờ khi tên trống (Đại chọn 16/11/2026): bấm Lưu thì câu lỗi hiện dưới ô. Chỉ mờ khi đang lưu hoặc chưa có nhóm nào để chọn */}
        <button
          type="submit"
          className="inline-flex items-center gap-[7.5px] rounded-[13.375px] bg-brand px-[15px] py-[7.5px] text-[13.125px] font-medium text-white hover:bg-brand-hover disabled:cursor-wait disabled:opacity-60"
          disabled={pending || groups.length === 0}
        >
          <img
            src="/assets/admin/branches/save.svg"
            alt=""
            width={15}
            height={15}
          />
          {pending ? 'Đang lưu…' : 'Lưu dịch vụ'}
        </button>
      </div>
    </form>
  );
}
