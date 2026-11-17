import { AlertTriangle, Plus, Save, Trash2, X } from 'lucide-react';
import { useId, useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../../../shared/api/errors';
import { useRemote } from '../../../shared/hooks/use-remote';
import { formatVnd } from '../../../shared/money/format-vnd';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import {
  getServicePolicy,
  saveServicePolicy,
  type PolicyServiceItem,
  type ServicePolicy,
} from './api/policy-api';
import {
  MAX_TIERS,
  buildInput,
  draftFromPolicy,
  emptyTier,
  noRefundWarning,
  saveFeedbackFor,
  templateTiers,
  type FieldErrors,
  type PolicyDraft,
} from './policy-form';
import { POLICY_TEXT } from './policy-text';

// Khung phải: chính sách RIÊNG của dịch vụ đang chọn (payment F5). Figma chưa có frame (PLAN 4.5): bố cục "cọc + mốc một khung" Trung chọn 18/11/2026, ô nhập và nút theo `569:316`.
// Tải chi tiết theo id (đổi dịch vụ thì huỷ yêu cầu cũ: `useRemote`), rồi dựng biểu mẫu. Lưu là MỘT lời gọi PUT thay toàn bộ cọc và mốc; nút Lưu tắt khi đang gửi (WCP-02).

const INPUT =
  'h-[35.35px] w-full rounded-[9.375px] border bg-white py-2 pr-7 pl-3 text-sm text-slate-900';
const SUFFIX =
  'pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-gray-400';

export function PolicyEditor({
  service,
  onSaved,
}: {
  service: PolicyServiceItem;
  onSaved: (policy: ServicePolicy) => void;
}) {
  const { state, retry } = useRemote(
    (signal) => getServicePolicy(service.dichVuKhamId, signal),
    [service.dichVuKhamId],
  );

  if (state.status === 'loading')
    return (
      <div className="p-5">
        <LoadingState message={POLICY_TEXT.editorLoading} />
      </div>
    );
  if (state.status === 'error') {
    // Dịch vụ bị xoá giữa chừng: câu riêng, không gợi ý thử lại (thử lại vẫn 404)
    if (state.error instanceof ApiError && state.error.status === 404)
      return (
        <p
          role="alert"
          className="m-5 rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong"
        >
          {POLICY_TEXT.notFound}
        </p>
      );
    return (
      <div className="p-5">
        <ErrorState error={state.error} onRetry={retry} />
      </div>
    );
  }
  return (
    <PolicyForm
      key={service.dichVuKhamId}
      service={service}
      initial={state.data}
      onSaved={onSaved}
    />
  );
}

function PolicyForm({
  service,
  initial,
  onSaved,
}: {
  service: PolicyServiceItem;
  initial: ServicePolicy;
  onSaved: (policy: ServicePolicy) => void;
}) {
  const baseId = useId();
  // Bản đã lưu gần nhất: "Hủy" quay về đây
  const [baseline, setBaseline] = useState(initial);
  const [draft, setDraft] = useState<PolicyDraft>(() =>
    draftFromPolicy(initial),
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  // Chặn bấm đúp TRƯỚC khi React kịp vẽ lại nút tắt (hai lần submit trong cùng một khung hình)
  const inFlight = useRef(false);

  const edit = (next: PolicyDraft) => {
    setDraft(next);
    setSaved(false);
  };
  const setTier = (
    index: number,
    patch: Partial<{ hours: string; rate: string }>,
  ) =>
    edit({
      ...draft,
      tiers: draft.tiers.map((tier, i) =>
        i === index ? { ...tier, ...patch } : tier,
      ),
    });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    const { errors: found, input } = buildInput(draft, service.giaMacDinh);
    setErrors(found);
    setBanner('');
    if (input === null) return;
    inFlight.current = true;
    setSaving(true);
    try {
      const result = await saveServicePolicy(service.dichVuKhamId, input);
      setBaseline(result);
      setDraft(draftFromPolicy(result));
      setSaved(true);
      onSaved(result);
    } catch (error) {
      // Giữ nguyên nội dung đang gõ, chỉ gắn lỗi (WCP-03)
      const feedback = saveFeedbackFor(error);
      setErrors(feedback.fields);
      setBanner(feedback.message);
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  const reset = () => {
    setDraft(draftFromPolicy(baseline));
    setErrors({});
    setBanner('');
    setSaved(false);
  };

  const errorId = (key: string) => `${baseId}-${key.replace(/\./g, '-')}-error`;
  const fieldError = (key: string) =>
    errors[key] === undefined ? null : (
      <p id={errorId(key)} className="pt-1 text-xs text-danger">
        {errors[key]}
      </p>
    );
  const invalidProps = (key: string) =>
    errors[key] === undefined
      ? { className: `${INPUT} border-gray-300` }
      : {
          className: `${INPUT} border-danger`,
          'aria-invalid': true,
          'aria-describedby': errorId(key),
        };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-100 pb-3">
        <h2 className="text-base font-semibold text-gray-800">{service.ten}</h2>
        <p className="text-sm text-gray-600">
          {POLICY_TEXT.price} {formatVnd(service.giaMacDinh)}
        </p>
      </div>

      <div>
        <label
          htmlFor={`${baseId}-deposit`}
          className="text-xs font-medium text-gray-500"
        >
          {POLICY_TEXT.depositLabel}
        </label>
        <div className="relative pt-1">
          <input
            id={`${baseId}-deposit`}
            inputMode="numeric"
            autoComplete="off"
            value={draft.deposit}
            onChange={(event) =>
              edit({ ...draft, deposit: event.target.value })
            }
            {...invalidProps('deposit')}
          />
          <span className={SUFFIX} aria-hidden="true">
            đ
          </span>
        </div>
        {fieldError('deposit') ?? (
          <p className="pt-1 text-xs text-gray-500">
            {POLICY_TEXT.depositHint}
          </p>
        )}
      </div>

      <fieldset>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <legend className="text-sm font-semibold text-gray-800">
            {POLICY_TEXT.tiersTitle}
          </legend>
          <button
            type="button"
            onClick={() => edit({ ...draft, tiers: templateTiers() })}
            className="text-sm font-medium text-brand-strong hover:underline"
          >
            {POLICY_TEXT.applyTemplate}
          </button>
        </div>

        {draft.tiers.length === 0 ? (
          <p className="pt-2 text-sm text-gray-500">{POLICY_TEXT.noTiers}</p>
        ) : (
          <div className="pt-2">
            <div
              className="grid grid-cols-[1fr_1fr_30px] gap-2 px-1 text-xs font-medium text-gray-500"
              aria-hidden="true"
            >
              <span>{POLICY_TEXT.cancelBefore}</span>
              <span>{POLICY_TEXT.rateLabel}</span>
              <span />
            </div>
            <ul className="flex flex-col gap-2 pt-2">
              {draft.tiers.map((tier, index) => (
                <li
                  key={tier.key}
                  className="grid grid-cols-[1fr_1fr_30px] items-start gap-2"
                >
                  <div>
                    <div className="relative">
                      <input
                        aria-label={POLICY_TEXT.hoursOf(index)}
                        inputMode="numeric"
                        autoComplete="off"
                        value={tier.hours}
                        onChange={(event) =>
                          setTier(index, { hours: event.target.value })
                        }
                        {...invalidProps(`tier.${index}.hours`)}
                      />
                      <span className={SUFFIX} aria-hidden="true">
                        h
                      </span>
                    </div>
                    {fieldError(`tier.${index}.hours`)}
                  </div>
                  <div>
                    <div className="relative">
                      <input
                        aria-label={POLICY_TEXT.rateOf(index)}
                        inputMode="numeric"
                        autoComplete="off"
                        value={tier.rate}
                        onChange={(event) =>
                          setTier(index, { rate: event.target.value })
                        }
                        {...invalidProps(`tier.${index}.rate`)}
                      />
                      <span className={SUFFIX} aria-hidden="true">
                        %
                      </span>
                    </div>
                    {fieldError(`tier.${index}.rate`)}
                  </div>
                  <button
                    type="button"
                    aria-label={POLICY_TEXT.removeTier(index)}
                    onClick={() =>
                      edit({
                        ...draft,
                        tiers: draft.tiers.filter((_, i) => i !== index),
                      })
                    }
                    className="flex size-[30px] items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-danger"
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {fieldError('tiers')}

        <button
          type="button"
          disabled={draft.tiers.length >= MAX_TIERS}
          onClick={() =>
            edit({ ...draft, tiers: [...draft.tiers, emptyTier()] })
          }
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand-strong disabled:cursor-not-allowed disabled:text-gray-400"
        >
          <Plus aria-hidden="true" className="size-4" />
          {POLICY_TEXT.addTier}
        </button>
      </fieldset>

      {noRefundWarning(draft) && (
        <p className="flex items-start gap-2 rounded-xl border border-warning-line bg-warning-soft px-3 py-2 text-sm text-warning">
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0"
          />
          {POLICY_TEXT.noRefundWarning}
        </p>
      )}

      {banner !== '' && (
        <p
          role="alert"
          className="rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong"
        >
          {banner}
        </p>
      )}
      {saved && (
        <p
          role="status"
          className="rounded-xl border border-success-line bg-success-soft px-3 py-2 text-sm text-success"
        >
          {POLICY_TEXT.saved}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex h-[45px] items-center gap-2 rounded-[13.375px] bg-brand-strong px-6 text-[15px] font-semibold text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save aria-hidden="true" className="size-4" />
          {saving ? POLICY_TEXT.saving : POLICY_TEXT.save}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={saving}
          className="inline-flex h-[45px] items-center gap-2 rounded-[13.375px] border border-gray-300 bg-white px-6 text-[15px] font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed"
        >
          <X aria-hidden="true" className="size-4" />
          {POLICY_TEXT.cancel}
        </button>
      </div>
    </form>
  );
}
