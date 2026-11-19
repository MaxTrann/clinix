import { CircleAlert, CircleDollarSign, TriangleAlert } from 'lucide-react';
import { useId, useRef, useState, type FormEvent } from 'react';
import {
  ApiError,
  NetworkError,
  TimeoutError,
} from '../../../shared/api/errors';
import { formatVnd } from '../../../shared/money/format-vnd';
import { createWithdrawal } from '../api/wallet-api';
import type { CreatedWithdrawal, LatestWithdrawal } from '../api/wallet-types';
import { digitsOf, withdrawProblem } from './withdraw-form';
import { WITHDRAW_TEXT } from './withdraw-text';

// Nội dung tab "Rút tiền" của trang "Ví của tôi" (payment F6; Figma `431:2`, `436:2`; trạng thái chờ duyệt theo `437:2`). Số khả dụng, số đang giữ và yêu cầu gần nhất
// lấy từ CÙNG lần tải `GET /patient/wallet` của trang (một nguồn số liệu); tab KHÔNG tự đọc ví.
//  - Còn yêu cầu `ChoDuyet` ⇒ KHÔNG có ô nhập, chỉ báo đang chờ (Q8, WRT-04; Trung chốt 19/11/2026): máy chủ sẽ trả 409 nếu gửi thêm.
//  - Gửi: nút vô hiệu và khoá bằng `useRef` nên bấm đúp chỉ MỘT lời gọi (WRT-03). Trống hay vượt số khả dụng ⇒ lỗi dưới ô, không gửi.
//  - Lỗi theo `maLoi`, GIỮ số đã nhập (WRT-02). Hết giờ, mất mạng ⇒ KHÔNG tự gửi lại, cảnh báo kiểm tra lịch sử (WRT-03).
//  - Không lưu số tiền ở `localStorage`, `sessionStorage` hay URL (WRT-05): chỉ state của component.

export interface WithdrawPanelProps {
  available: string;
  held: string;
  latest: LatestWithdrawal | null;
  /** 201: trang hiện màn "Yêu cầu đã được ghi nhận!" và tải lại số dư, lịch sử. */
  onSubmitted: (result: CreatedWithdrawal) => void;
  /** Hết giờ, mất mạng: trang tải lại lịch sử để người dùng kiểm tra. */
  onUncertain?: () => void;
}

type FormError =
  | { kind: 'field'; message: string }
  | { kind: 'form'; message: string; tone: 'danger' | 'warning' };

/** `chiTiet.toiThieu` của `SO_TIEN_NGOAI_HAN_MUC` (chuỗi decimal) nếu có đúng dạng. */
function minimumOf(error: ApiError): string | null {
  const detail = error.chiTiet;
  if (typeof detail !== 'object' || detail === null) return null;
  const min = (detail as Record<string, unknown>).toiThieu;
  return typeof min === 'string' && /^\d+(\.\d+)?$/.test(min) ? min : null;
}

function errorFrom(error: unknown): FormError {
  if (error instanceof TimeoutError || error instanceof NetworkError)
    return { kind: 'form', message: WITHDRAW_TEXT.uncertain, tone: 'warning' };
  if (error instanceof ApiError) {
    switch (error.maLoi) {
      case 'SO_DU_KHONG_DU':
        return { kind: 'field', message: WITHDRAW_TEXT.insufficient };
      case 'SO_TIEN_NGOAI_HAN_MUC': {
        const min = minimumOf(error);
        return {
          kind: 'field',
          message:
            min === null
              ? WITHDRAW_TEXT.outOfRange
              : WITHDRAW_TEXT.belowMinimum(formatVnd(min)),
        };
      }
      case 'DU_LIEU_KHONG_HOP_LE':
        return { kind: 'field', message: WITHDRAW_TEXT.amountInvalid };
      case 'DA_CO_YEU_CAU_CHO_DUYET':
        return {
          kind: 'form',
          message: WITHDRAW_TEXT.pendingExists,
          tone: 'warning',
        };
    }
  }
  return { kind: 'form', message: WITHDRAW_TEXT.genericError, tone: 'danger' };
}

/** Ô "Số dư khả dụng" (Figma `431:2`); có số đang giữ thì thêm dải vàng của `437:2`. */
export function AvailableBox({
  available,
  held,
}: {
  available: string;
  held: string | null;
}) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-blue-200 bg-[#eff8ff]">
      <div className="flex items-center gap-[12px] px-[14px] py-[14px]">
        <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-blue-100">
          <CircleDollarSign
            aria-hidden="true"
            className="size-[18px] text-[#49bce2]"
          />
        </span>
        <div>
          <p className="text-[11px] leading-[16.5px] text-gray-500">
            {WITHDRAW_TEXT.available}
          </p>
          <p className="text-[20px] leading-[28px] font-extrabold text-[#1796be]">
            {formatVnd(available)}
          </p>
        </div>
      </div>
      {held !== null && (
        <p className="flex items-center gap-[6px] border-t border-amber-200 bg-amber-50 px-[14px] py-[8px] text-[11px] leading-[16.5px] text-amber-700">
          <TriangleAlert aria-hidden="true" className="size-[12px] shrink-0" />
          {WITHDRAW_TEXT.held(formatVnd(held))}
        </p>
      )}
    </div>
  );
}

export function WithdrawPanel({
  available,
  held,
  latest,
  onSubmitted,
  onUncertain,
}: WithdrawPanelProps) {
  const baseId = useId();
  const inputId = `${baseId}-amount`;
  const hintId = `${baseId}-hint`;
  const errorId = `${baseId}-error`;
  const max = formatVnd(available);

  const [digits, setDigits] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<FormError | null>(null);
  // Khoá đồng bộ: hai lần bấm trong cùng một lượt render vẫn chỉ gửi một lần (state chưa kịp cập nhật)
  const inFlight = useRef(false);

  // Q8: mỗi Bệnh nhân một yêu cầu chờ duyệt. Còn chờ ⇒ chỉ báo, không có ô nhập (WRT-04)
  if (latest?.trangThai === 'ChoDuyet')
    return (
      <div className="flex flex-col gap-[12px]">
        <AvailableBox available={available} held={held} />
        <p
          role="status"
          className="rounded-[8px] border border-gray-200 bg-gray-50 px-[12px] py-[16px] text-center text-[13px] leading-[19.5px] text-gray-600"
        >
          {WITHDRAW_TEXT.pendingExists} {WITHDRAW_TEXT.nextRequestHint}
        </p>
      </div>
    );

  const changeAmount = (next: string) => {
    setDigits(next);
    if (error?.kind === 'field') setError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current) return;
    const problem = withdrawProblem(digits, available);
    if (problem !== null) {
      setError({
        kind: 'field',
        message:
          problem === 'required'
            ? WITHDRAW_TEXT.amountRequired
            : WITHDRAW_TEXT.overAvailable(max),
      });
      return;
    }
    inFlight.current = true;
    setSending(true);
    setError(null);
    try {
      const result = await createWithdrawal({ soTien: digits });
      // Trang thay tab bằng màn thành công nên không mở khoá lại ở đây
      onSubmitted(result);
      return;
    } catch (caught) {
      const next = errorFrom(caught);
      setError(next);
      if (next.kind === 'form' && next.tone === 'warning') onUncertain?.();
    }
    inFlight.current = false;
    setSending(false);
  };

  const fieldError = error?.kind === 'field' ? error.message : null;

  return (
    <form noValidate onSubmit={(event) => void submit(event)}>
      <AvailableBox available={available} held={null} />
      <label
        htmlFor={inputId}
        className="block pt-[16px] text-[13px] leading-[19.5px] font-bold text-gray-900"
      >
        {WITHDRAW_TEXT.amountLabel}
      </label>
      <div className="relative pt-[8px]">
        <input
          id={inputId}
          inputMode="numeric"
          autoComplete="off"
          placeholder={WITHDRAW_TEXT.amountPlaceholder}
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
          className="pointer-events-none absolute top-[17.75px] right-[13px] text-[13px] leading-[19.5px] font-bold text-gray-400"
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
        {WITHDRAW_TEXT.maxHint(max)}
      </p>

      <p className="mt-[12px] flex items-start gap-[8px] rounded-[8px] border border-amber-200 bg-amber-50 px-[12px] py-[8px] text-[11px] leading-[16.5px] text-amber-700">
        <CircleAlert
          aria-hidden="true"
          className="mt-[2px] size-[12px] shrink-0"
        />
        {WITHDRAW_TEXT.notice}
      </p>

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
          disabled={sending}
          className="flex h-[44px] w-full items-center justify-center rounded-[10px] bg-linear-[176.6deg,#49bce2_0%,#1796be_100%] text-[14px] leading-[21px] font-bold text-white drop-shadow-[0px_2px_5px_rgba(26,157,192,0.28)] disabled:opacity-60"
        >
          {sending ? WITHDRAW_TEXT.submitting : WITHDRAW_TEXT.submit}
        </button>
      </div>
    </form>
  );
}
