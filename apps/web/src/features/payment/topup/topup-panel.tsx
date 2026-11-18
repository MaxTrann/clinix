import { useId, useRef, useState, type FormEvent } from 'react';
import {
  ApiError,
  NetworkError,
  TimeoutError,
} from '../../../shared/api/errors';
import { formatVnd } from '../../../shared/money/format-vnd';
import momoLogo from './assets/momo-logo.png';
import vnpayLogo from './assets/vnpay-logo.png';
import { createTopup } from './topup-api';
import {
  amountProblem,
  digitsOf,
  isAllowedRedirect,
  knownGateways,
  quickAmountsWithin,
  type TopupGateway,
} from './topup-form';
import { TOPUP_TEXT } from './topup-text';

// Nội dung tab "Nạp tiền" của trang "Ví của tôi" (payment F2; Figma `430:2`, khối `430:246`). Trang ví (`features/wallet`) truyền hạn mức và danh sách cổng của
// `GET /patient/wallet` vào đây; tab KHÔNG tự đọc ví (một nguồn số liệu, F1 đã tải).
//  - Chỉ hiện cổng đã cấu hình ở máy chủ (WNT-01). Mức nhanh ngoài hạn mức bị ẩn.
//  - Gửi: nút vô hiệu và khoá bằng `useRef` nên bấm đúp chỉ MỘT lời gọi (WNT-01). Ngoài hạn mức ⇒ lỗi dưới ô, không gửi (WNT-02).
//  - 201 ⇒ `window.location.assign(redirectUrl)` CHỈ khi URL `https:` và host thuộc danh sách cho phép (WNT-03). Không dựng URL cổng ở client.
//  - Lỗi theo `maLoi`, GIỮ nội dung đã nhập (WNT-04). Hết giờ, mất mạng ⇒ KHÔNG tự gửi lại, cảnh báo kiểm tra lịch sử (WNT-06).

export interface TopupPanelProps {
  limits: { toiThieu: string; toiDa: string };
  /** `congThanhToan` thô của API; tên cổng lạ bị bỏ qua. */
  gateways: readonly string[];
  /** Chỉ cho test: thay `window.location.assign`. */
  navigate?: (url: string) => void;
}

const LOGOS: Record<TopupGateway, { src: string; className: string }> = {
  VNPay: { src: vnpayLogo, className: 'h-[17.95px] w-[59px]' },
  MoMo: { src: momoLogo, className: 'size-[28px]' },
};

type FormError =
  | { kind: 'field'; message: string }
  | { kind: 'form'; message: string; tone: 'danger' | 'warning' };

function errorFrom(
  error: unknown,
  range: { min: string; max: string },
): FormError {
  if (error instanceof TimeoutError || error instanceof NetworkError)
    return { kind: 'form', message: TOPUP_TEXT.uncertain, tone: 'warning' };
  if (error instanceof ApiError) {
    switch (error.maLoi) {
      case 'SO_TIEN_NGOAI_HAN_MUC':
        return {
          kind: 'field',
          message: TOPUP_TEXT.amountOutOfRange(range.min, range.max),
        };
      case 'DU_LIEU_KHONG_HOP_LE':
        return { kind: 'field', message: TOPUP_TEXT.amountInvalid };
      case 'CONG_THANH_TOAN_CHUA_CAU_HINH':
        return {
          kind: 'form',
          message: TOPUP_TEXT.gatewayNotConfigured,
          tone: 'danger',
        };
      case 'CONG_THANH_TOAN_LOI':
        return {
          kind: 'form',
          message: TOPUP_TEXT.gatewayError,
          tone: 'danger',
        };
    }
  }
  return { kind: 'form', message: TOPUP_TEXT.genericError, tone: 'danger' };
}

function StepTitle({ index, label }: { index: number; label: string }) {
  return (
    <p className="flex items-center gap-[6px] text-[11px] leading-[16.5px] font-bold text-gray-700">
      <span
        aria-hidden="true"
        className="flex size-[18px] items-center justify-center rounded-[9px] bg-[#eff8ff] font-extrabold text-[#49bce2]"
      >
        {index}
      </span>
      {label}
    </p>
  );
}

export function TopupPanel({ limits, gateways, navigate }: TopupPanelProps) {
  const baseId = useId();
  const inputId = `${baseId}-amount`;
  const hintId = `${baseId}-hint`;
  const errorId = `${baseId}-error`;
  const available = knownGateways(gateways);
  const quick = quickAmountsWithin(limits);
  const range = {
    min: formatVnd(limits.toiThieu),
    max: formatVnd(limits.toiDa),
  };

  const [digits, setDigits] = useState('');
  const [chosen, setChosen] = useState<TopupGateway | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<FormError | null>(null);
  // Khoá đồng bộ: hai lần bấm trong cùng một lượt render vẫn chỉ gửi một lần (state chưa kịp cập nhật)
  const inFlight = useRef(false);
  const gateway = chosen ?? available[0] ?? null;

  const changeAmount = (next: string) => {
    setDigits(next);
    if (error?.kind === 'field') setError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current || gateway === null) return;
    const problem = amountProblem(digits, limits);
    if (problem !== null) {
      setError({
        kind: 'field',
        message:
          problem === 'required'
            ? TOPUP_TEXT.amountRequired
            : TOPUP_TEXT.amountOutOfRange(range.min, range.max),
      });
      return;
    }
    inFlight.current = true;
    setSending(true);
    setError(null);
    try {
      const { redirectUrl } = await createTopup({
        soTien: digits,
        phuongThuc: gateway,
      });
      if (isAllowedRedirect(redirectUrl)) {
        // Giữ nút vô hiệu và khoá trong lúc trình duyệt rời trang
        (navigate ?? ((url: string) => window.location.assign(url)))(
          redirectUrl,
        );
        return;
      }
      setError({
        kind: 'form',
        message: TOPUP_TEXT.badRedirect,
        tone: 'danger',
      });
    } catch (caught) {
      setError(errorFrom(caught, range));
    }
    inFlight.current = false;
    setSending(false);
  };

  const fieldError = error?.kind === 'field' ? error.message : null;

  return (
    <form noValidate onSubmit={(event) => void submit(event)}>
      <StepTitle index={1} label={TOPUP_TEXT.stepAmount} />
      <div className="grid grid-cols-3 gap-[8px] pt-[10px]">
        {quick.map((amount) => {
          const selected = digits === amount;
          return (
            <button
              key={amount}
              type="button"
              aria-pressed={selected}
              disabled={sending}
              onClick={() => changeAmount(amount)}
              className={`rounded-[8px] border px-[4px] py-[9px] text-center text-[13px] leading-[19.5px] font-semibold ${
                selected
                  ? 'border-[#49bce2] bg-[#eff8ff] text-[#1796be]'
                  : 'border-gray-200 bg-[#fafafa] text-gray-700'
              }`}
            >
              {formatVnd(amount)}
            </button>
          );
        })}
      </div>
      <div className="relative pt-[10px]">
        <label htmlFor={inputId} className="sr-only">
          {TOPUP_TEXT.amountLabel}
        </label>
        <input
          id={inputId}
          inputMode="numeric"
          autoComplete="off"
          value={digits === '' ? '' : formatVnd(digits).replace(/đ$/, '')}
          onChange={(event) => changeAmount(digitsOf(event.target.value))}
          disabled={sending}
          aria-invalid={fieldError !== null}
          aria-describedby={
            fieldError !== null ? `${errorId} ${hintId}` : hintId
          }
          className="h-[39.5px] w-full rounded-[8px] border border-gray-200 bg-[#fafafa] py-[9px] pr-[32px] pl-[12px] text-[13px] leading-[19.5px] text-gray-900"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-[19.75px] right-[13px] text-[13px] leading-[19.5px] font-bold text-gray-400"
        >
          đ
        </span>
      </div>
      {fieldError !== null && (
        <p
          id={errorId}
          role="alert"
          className="pt-[4px] text-[12px] leading-[18px] text-danger"
        >
          {fieldError}
        </p>
      )}
      <p
        id={hintId}
        className="pt-[4px] text-[11px] leading-[16.5px] text-gray-400"
      >
        {TOPUP_TEXT.limitHint(range.min, range.max)}
      </p>

      <div className="pt-[10px]">
        <StepTitle index={2} label={TOPUP_TEXT.stepGateway} />
      </div>
      {available.length === 0 ? (
        <p className="mt-[10px] rounded-[8px] border border-dashed border-gray-200 bg-gray-50 px-[12px] py-[16px] text-center text-[13px] text-gray-500">
          {TOPUP_TEXT.noGateway}
        </p>
      ) : (
        <div
          role="radiogroup"
          aria-label={TOPUP_TEXT.stepGateway}
          className="flex gap-[8px] pt-[10px]"
        >
          {available.map((item) => {
            const selected = item === gateway;
            const text = TOPUP_TEXT.gateways[item];
            return (
              <button
                key={item}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={sending}
                onClick={() => setChosen(item)}
                className={`flex min-h-[53.4px] flex-1 items-center gap-[10px] rounded-[8px] border-2 px-[12px] py-[10px] text-left ${
                  selected
                    ? 'border-[#49bce2] bg-[#eff8ff]'
                    : 'border-gray-200 bg-[#fafafa]'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex size-[14px] shrink-0 items-center justify-center rounded-[7px] border-2 bg-white ${
                    selected ? 'border-[#49bce2]' : 'border-gray-300'
                  }`}
                >
                  {selected && (
                    <span className="size-[6px] rounded-[3px] bg-[#49bce2]" />
                  )}
                </span>
                <img
                  src={LOGOS[item].src}
                  alt=""
                  className={`shrink-0 object-contain ${LOGOS[item].className}`}
                />
                <span className="flex flex-col">
                  <span className="text-[12px] leading-[14.4px] font-bold text-gray-900">
                    {text.name}
                  </span>
                  <span className="text-[10px] leading-[15px] font-medium text-gray-400">
                    {text.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {error?.kind === 'form' && (
        <p
          role="alert"
          className={`mt-[12px] rounded-[8px] border px-[12px] py-[8px] text-[13px] leading-[19.5px] ${
            error.tone === 'warning'
              ? 'border-warning-line bg-warning-soft text-warning'
              : 'border-danger-line bg-danger-soft text-danger-strong'
          }`}
        >
          {error.message}
        </p>
      )}
      <div className="pt-[16px]">
        <button
          type="submit"
          disabled={sending || gateway === null}
          className="flex h-[44px] w-full items-center justify-center rounded-[10px] bg-linear-[176.6deg,#49bce2_0%,#1796be_100%] text-[14px] leading-[21px] font-bold text-white drop-shadow-[0px_2px_5px_rgba(26,157,192,0.28)] disabled:opacity-60"
        >
          {sending ? TOPUP_TEXT.submitting : TOPUP_TEXT.submit}
        </button>
      </div>
    </form>
  );
}
