import { Info } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { useRemote } from '../../../shared/hooks/use-remote';
import { formatVnd } from '../../../shared/money/format-vnd';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { AdminDetailPanel } from '../../admin';
import { formatDateTime } from './finance-format';
import { getRefundablePayments } from './special-refund-api';
import {
  SpecialRefundConfirm,
  type SpecialRefundDraft,
  type SpecialRefundOutcome,
} from './special-refund-confirm';
import {
  APPOINTMENT_CODE_MAX,
  REFUND_AMOUNT_PATTERN,
  SPECIAL_REFUND_REASON_MAX,
  SPECIAL_REFUND_REASON_MIN,
  SPECIAL_REFUND_TEXT,
} from './special-refund-text';
import type { DecisionNotice } from './withdrawal-decision';

// Tab "Hoàn tiền đặc biệt" (payment F8; Figma `550:2`; 2.4 HDB b5, A1, A2). Ba bước:
//  1. tra theo MÃ LỊCH HẸN (thay ô "Chọn bệnh nhân" của Figma, Trung chốt 20/11/2026) ⇒ danh sách khoản qua ví còn hoàn được của máy chủ;
//  2. chọn MỘT khoản, nhập số tiền và lý do, bấm "Xem xác nhận hoàn tiền" (kiểm ở web trước, máy chủ vẫn kiểm lại);
//  3. ngăn bên xác nhận gửi MỘT lời gọi ghi (`special-refund-confirm.tsx`).
// Số trần chỉ HIỂN THỊ `conCoTheHoan` máy chủ trả; web không tự tính hay chặn theo trần: máy chủ kiểm dưới khoá và trả 409 kèm số trần (WQL-05).
// Mọi giá trị là state của tab, KHÔNG vào URL hay kho trình duyệt (nếp WQL-08).

type FieldKey = 'code' | 'payment' | 'soTien' | 'lyDo';
type FieldErrors = Partial<Record<FieldKey, string>>;

const NOTICE_TONE: Record<DecisionNotice['tone'], string> = {
  success: 'border-success-line bg-success-soft text-success',
  warning: 'border-warning-line bg-warning-soft text-warning',
  danger: 'border-danger-line bg-danger-soft text-danger-strong',
};

const INPUT_CLASS =
  'w-full rounded-[8px] border border-gray-500 bg-white px-[12px] text-[13px] text-gray-900 disabled:bg-gray-50';

function FieldError({ id, message }: { id: string; message?: string }) {
  if (message === undefined) return null;
  return (
    <p id={id} role="alert" className="pt-[4px] text-[12px] text-danger">
      {message}
    </p>
  );
}

function RequiredMark() {
  return (
    <span aria-hidden="true" className="text-danger">
      {' *'}
    </span>
  );
}

export function SpecialRefundTab() {
  const baseId = useId();
  const ids = {
    code: `${baseId}-code`,
    codeHint: `${baseId}-code-hint`,
    amount: `${baseId}-amount`,
    amountHint: `${baseId}-amount-hint`,
    reason: `${baseId}-reason`,
    reasonHint: `${baseId}-reason-hint`,
    error: (key: FieldKey) => `${baseId}-${key}-error`,
  };

  const [code, setCode] = useState('');
  // Mã đã bấm "Tìm"; `null` = chưa tra lần nào (không gọi API)
  const [searched, setSearched] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<DecisionNotice | null>(null);
  const [draft, setDraft] = useState<SpecialRefundDraft | null>(null);

  const { state, retry } = useRemote(
    (signal) =>
      searched === null
        ? Promise.resolve([])
        : getRefundablePayments(searched, signal),
    [searched, refreshKey],
  );
  const payments = state.status === 'ready' ? state.data : [];
  // Khoản đang chọn suy ra từ danh sách MỚI NHẤT: khoản vừa biến mất (đã hoàn hết, đã hoàn đặc biệt) thì tự bỏ chọn
  const selected =
    payments.find((payment) => payment.maGiaoDich === selectedId) ?? null;

  const clearError = (key: FieldKey) =>
    setErrors((current) => ({ ...current, [key]: undefined }));

  const search = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = code.trim();
    if (text === '') {
      setErrors((current) => ({
        ...current,
        code: SPECIAL_REFUND_TEXT.codeRequired,
      }));
      return;
    }
    setNotice(null);
    setSelectedId(null);
    setSearched(text);
    // Tra lại cùng mã vẫn phải gọi API (dữ liệu có thể đã đổi)
    setRefreshKey((n) => n + 1);
  };

  const review = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const soTien = amount.trim();
    const lyDo = reason.trim();
    const next: FieldErrors = {};
    if (selected === null) next.payment = SPECIAL_REFUND_TEXT.paymentRequired;
    if (!REFUND_AMOUNT_PATTERN.test(soTien))
      next.soTien = SPECIAL_REFUND_TEXT.amountInvalid;
    if (lyDo.length < SPECIAL_REFUND_REASON_MIN)
      next.lyDo = SPECIAL_REFUND_TEXT.reasonRequired;
    else if (lyDo.length > SPECIAL_REFUND_REASON_MAX)
      next.lyDo = SPECIAL_REFUND_TEXT.reasonTooLong;
    setErrors(next);
    if (selected === null || Object.keys(next).length > 0) return;
    setNotice(null);
    setDraft({ payment: selected, soTien, lyDo });
  };

  const settle = (outcome: SpecialRefundOutcome) => {
    setDraft(null);
    if (outcome.kind === 'field') {
      setErrors({
        [outcome.field]:
          outcome.field === 'soTien'
            ? SPECIAL_REFUND_TEXT.amountInvalid
            : SPECIAL_REFUND_TEXT.reasonRejected,
      });
      return;
    }
    setNotice(outcome.notice);
    if (outcome.resetForm) {
      setSelectedId(null);
      setAmount('');
      setReason('');
    }
    setRefreshKey((n) => n + 1);
  };

  const describedBy = (key: FieldKey, hint?: string) =>
    [errors[key] !== undefined ? ids.error(key) : null, hint ?? null]
      .filter(Boolean)
      .join(' ') || undefined;

  const [info0, strong1, info2] = SPECIAL_REFUND_TEXT.infoParts;

  return (
    <div className="flex flex-col gap-[16px]">
      <p className="flex gap-[8px] rounded-[12px] border border-sky-200 bg-sky-50 px-[16px] py-[12px] text-[13px] leading-[20px] text-sky-800">
        <Info aria-hidden="true" className="mt-[3px] size-[14px] shrink-0" />
        <span>
          {info0}
          <strong>{strong1}</strong>
          {info2}
        </span>
      </p>

      {notice !== null && (
        <p
          role={notice.tone === 'success' ? 'status' : 'alert'}
          className={`rounded-[8px] border px-[12px] py-[8px] text-[13px] ${NOTICE_TONE[notice.tone]}`}
        >
          {notice.message}
        </p>
      )}

      <section
        aria-labelledby={`${baseId}-title`}
        className="flex flex-col gap-[16px] rounded-[16px] border border-gray-200 bg-white p-[22px]"
      >
        <h2
          id={`${baseId}-title`}
          className="text-[17px] font-semibold text-gray-900"
        >
          {SPECIAL_REFUND_TEXT.formTitle}
        </h2>

        <form noValidate onSubmit={search} role="search">
          <label
            htmlFor={ids.code}
            className="block text-[13px] font-medium text-gray-800"
          >
            {SPECIAL_REFUND_TEXT.codeLabel}
            <RequiredMark />
          </label>
          <p id={ids.codeHint} className="pt-[4px] text-[11px] text-gray-500">
            {SPECIAL_REFUND_TEXT.codeHint}
          </p>
          <div className="mt-[8px] flex gap-[8px]">
            <input
              id={ids.code}
              type="text"
              value={code}
              maxLength={APPOINTMENT_CODE_MAX}
              autoComplete="off"
              placeholder={SPECIAL_REFUND_TEXT.codePlaceholder}
              onChange={(event) => {
                setCode(event.target.value);
                clearError('code');
              }}
              aria-invalid={errors.code !== undefined}
              aria-describedby={describedBy('code', ids.codeHint)}
              className={`${INPUT_CLASS} h-[38px]`}
            />
            <button
              type="submit"
              className="h-[38px] shrink-0 rounded-[8px] border border-brand-strong px-[16px] text-[13px] font-semibold text-brand-strong"
            >
              {SPECIAL_REFUND_TEXT.search}
            </button>
          </div>
          <FieldError id={ids.error('code')} message={errors.code} />
        </form>

        <form noValidate onSubmit={review} className="flex flex-col gap-[16px]">
          {searched !== null && (
            <fieldset aria-describedby={describedBy('payment')}>
              <legend className="text-[13px] font-medium text-gray-800">
                {SPECIAL_REFUND_TEXT.paymentsLabel}
                <RequiredMark />
              </legend>
              <div className="mt-[8px]">
                {state.status === 'loading' && (
                  <LoadingState message={SPECIAL_REFUND_TEXT.paymentsLoading} />
                )}
                {state.status === 'error' && (
                  <ErrorState error={state.error} onRetry={retry} />
                )}
                {state.status === 'ready' && payments.length === 0 && (
                  <p className="rounded-[8px] border border-dashed border-gray-200 bg-gray-50 px-[12px] py-[16px] text-center text-[13px] text-gray-500">
                    {SPECIAL_REFUND_TEXT.paymentsEmpty}
                  </p>
                )}
                {payments.length > 0 && (
                  <ul className="flex flex-col gap-[8px]">
                    {payments.map((payment) => {
                      const checked = payment.maGiaoDich === selectedId;
                      return (
                        <li key={payment.maGiaoDich}>
                          <label
                            className={`flex cursor-pointer items-start gap-[10px] rounded-[10px] border px-[14px] py-[10px] text-[13px] ${
                              checked
                                ? 'border-brand-strong bg-cyan-50'
                                : 'border-gray-200 bg-white'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`${baseId}-payment`}
                              value={payment.maGiaoDich}
                              checked={checked}
                              onChange={() => {
                                setSelectedId(payment.maGiaoDich);
                                clearError('payment');
                              }}
                              aria-label={SPECIAL_REFUND_TEXT.paymentOf(
                                payment.maGiaoDich,
                                payment.maLichHen,
                              )}
                              className="mt-[3px]"
                            />
                            <span className="flex flex-1 flex-col gap-[2px]">
                              <span className="font-mono text-[12px] text-gray-600">
                                #{payment.maGiaoDich} · {payment.maLichHen} ·{' '}
                                {formatDateTime(payment.thoiDiem)}
                              </span>
                              <span className="flex flex-wrap gap-x-[16px] text-gray-700">
                                <span>
                                  {SPECIAL_REFUND_TEXT.paidLabel}:{' '}
                                  {formatVnd(payment.soTien)}
                                </span>
                                <span>
                                  {SPECIAL_REFUND_TEXT.refundedLabel}:{' '}
                                  {formatVnd(payment.daHoan)}
                                </span>
                                <span className="font-semibold text-success">
                                  {SPECIAL_REFUND_TEXT.refundableLabel}:{' '}
                                  {formatVnd(payment.conCoTheHoan)}
                                </span>
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <FieldError id={ids.error('payment')} message={errors.payment} />
            </fieldset>
          )}

          <div>
            <label
              htmlFor={ids.amount}
              className="block text-[13px] font-medium text-gray-800"
            >
              {SPECIAL_REFUND_TEXT.amountLabel}
              <RequiredMark />
            </label>
            <input
              id={ids.amount}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={amount}
              placeholder={SPECIAL_REFUND_TEXT.amountPlaceholder}
              onChange={(event) => {
                setAmount(event.target.value);
                clearError('soTien');
              }}
              aria-invalid={errors.soTien !== undefined}
              aria-describedby={describedBy(
                'soTien',
                selected !== null ? ids.amountHint : undefined,
              )}
              className={`${INPUT_CLASS} mt-[8px] h-[38px]`}
            />
            {selected !== null && (
              <p
                id={ids.amountHint}
                className="pt-[4px] text-[11px] text-gray-500"
              >
                {SPECIAL_REFUND_TEXT.amountHint(
                  formatVnd(selected.conCoTheHoan),
                )}
              </p>
            )}
            <FieldError id={ids.error('soTien')} message={errors.soTien} />
          </div>

          <div>
            <label
              htmlFor={ids.reason}
              className="block text-[13px] font-medium text-gray-800"
            >
              {SPECIAL_REFUND_TEXT.reasonLabel}
              <RequiredMark />
            </label>
            <p
              id={ids.reasonHint}
              className="pt-[4px] text-[11px] text-gray-500"
            >
              {SPECIAL_REFUND_TEXT.reasonHint}
            </p>
            <textarea
              id={ids.reason}
              rows={3}
              value={reason}
              placeholder={SPECIAL_REFUND_TEXT.reasonPlaceholder}
              onChange={(event) => {
                setReason(event.target.value);
                clearError('lyDo');
              }}
              aria-invalid={errors.lyDo !== undefined}
              aria-describedby={describedBy('lyDo', ids.reasonHint)}
              className={`${INPUT_CLASS} mt-[8px] resize-none py-[8px]`}
            />
            <FieldError id={ids.error('lyDo')} message={errors.lyDo} />
          </div>

          <button
            type="submit"
            className="h-[38px] rounded-[10px] bg-brand-strong text-[13px] font-semibold text-white"
          >
            {SPECIAL_REFUND_TEXT.review}
          </button>
        </form>
      </section>

      <AdminDetailPanel
        open={draft !== null}
        title={SPECIAL_REFUND_TEXT.confirmTitle}
        onClose={() => setDraft(null)}
      >
        {draft !== null && (
          <SpecialRefundConfirm
            draft={draft}
            onSettled={settle}
            onCancel={() => setDraft(null)}
          />
        )}
      </AdminDetailPanel>
    </div>
  );
}
