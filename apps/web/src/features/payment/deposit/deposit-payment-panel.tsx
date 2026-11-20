import { useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  ApiError,
  NetworkError,
  TimeoutError,
} from '../../../shared/api/errors';
import { useRemote } from '../../../shared/hooks/use-remote';
import { formatVnd } from '../../../shared/money/format-vnd';
import { PATIENT_WALLET_PATH } from '../../../shared/routes/wallet-paths';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import {
  getDepositPreview,
  payDeposit,
  type DepositPaymentResult,
  type DepositPreview,
} from './deposit-api';
import { DEPOSIT_TEXT, type DepositErrorCode } from './deposit-text';

// Thành phần thanh toán cọc bằng ví (payment F3; Figma `452:2`, khối "Số tiền cần thanh toán" `452:185` và nút `452:207`). Trang Bước Thanh toán của booking F6 (Đại) gắn
// thành phần này và tự lo đồng hồ giữ chỗ, khung tóm tắt lịch, nút "Quay lại xác nhận" (Q19). Hai thẻ "Thanh toán cọc / toàn bộ" của Figma KHÔNG làm: chỉ cọc (Q14).
//  - Số tiền, số dư, số dư sau thanh toán đều do máy chủ tính (`payment-preview`); client KHÔNG tự trừ (WTT-01).
//  - `duSoDu = false` ⇒ gợi ý nạp thêm kèm liên kết tới ví, nút vô hiệu (WTT-02).
//  - Gửi: nút vô hiệu và khoá bằng `useRef` nên bấm đúp chỉ MỘT lời gọi; `daXuLyTruocDo` ⇒ vẫn là đã thanh toán (WTT-03).
//  - Lỗi theo `maLoi` (WTT-04). Hết giờ chờ hay mất mạng lúc gửi ⇒ cho bấm lại vì máy chủ idempotent (TLK-04), không tự gửi lại.
//  - Thành công ⇒ gọi `onPaid` qua props; thành phần KHÔNG import `features/booking` (WTT-05).

export interface DepositPaymentPanelProps {
  maLichHen: string;
  /** Gọi một lần khi lịch đã được xác nhận (kể cả `daXuLyTruocDo`); booking chuyển sang bước Hoàn tất. */
  onPaid: (result: DepositPaymentResult) => void;
}

type Outcome =
  | { kind: 'paid'; result: DepositPaymentResult }
  // Không thanh toán tiếp được ở trang này (hết giờ, sai trạng thái, thiếu tiền…): nút vô hiệu
  | { kind: 'blocked'; message: string; topup: boolean }
  // Có thể bấm lại
  | { kind: 'retry'; message: string; tone: 'danger' | 'warning' };

function isKnownCode(code: string): code is DepositErrorCode {
  return Object.hasOwn(DEPOSIT_TEXT.errors, code);
}

// Câu theo mã cho lỗi đã lường trước; `null` nếu không phải lỗi nghiệp vụ biết trước
function knownMessage(error: unknown): string | null {
  return error instanceof ApiError && isKnownCode(error.maLoi)
    ? DEPOSIT_TEXT.errors[error.maLoi]
    : null;
}

function outcomeFromPayError(error: unknown): Outcome {
  if (error instanceof TimeoutError || error instanceof NetworkError)
    return { kind: 'retry', message: DEPOSIT_TEXT.uncertain, tone: 'warning' };
  const message = knownMessage(error);
  if (message !== null)
    return {
      kind: 'blocked',
      message,
      topup: error instanceof ApiError && error.maLoi === 'SO_DU_KHONG_DU',
    };
  return { kind: 'retry', message: DEPOSIT_TEXT.genericError, tone: 'danger' };
}

function Notice({
  tone,
  children,
}: {
  tone: 'danger' | 'warning' | 'success';
  children: ReactNode;
}) {
  const toneClass = {
    danger: 'border-danger-line bg-danger-soft text-danger-strong',
    warning: 'border-warning-line bg-warning-soft text-warning',
    success: 'border-success-line bg-success-soft text-success',
  }[tone];
  return (
    <div
      role={tone === 'success' ? 'status' : 'alert'}
      className={`mt-[18.75px] rounded-[10px] border px-[15px] py-[11.25px] text-[13px] leading-[19.5px] ${toneClass}`}
    >
      {children}
    </div>
  );
}

function TopupLink() {
  return (
    <Link
      to={PATIENT_WALLET_PATH}
      className="mt-[4px] block font-semibold text-brand-strong underline"
    >
      {DEPOSIT_TEXT.topupLink}
    </Link>
  );
}

function MoneyRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass: string;
}) {
  return (
    <div className="flex h-[37.5px] items-center justify-between text-[15px] leading-[22.5px]">
      <dt className="text-gray-700">{label}</dt>
      <dd className={`text-right font-semibold ${valueClass}`}>{value}</dd>
    </div>
  );
}

function AmountCard({
  preview,
  paid,
}: {
  preview: DepositPreview;
  paid: DepositPaymentResult | null;
}) {
  // Sau khi thanh toán: số dư hiện tại lấy từ kết quả của máy chủ, bỏ dòng "sau thanh toán" (đã xảy ra)
  const balance = paid?.soDuKhaDung ?? preview.soDuKhaDung;
  const after = paid === null ? preview.soDuSauThanhToan : null;
  return (
    <div className="rounded-[15px] border border-gray-200 bg-white p-[22.5px]">
      <p className="text-[13px] leading-[19.5px] text-gray-600">
        {DEPOSIT_TEXT.amountLabel}
      </p>
      <p className="pt-[3.75px] text-[33.75px] leading-[37.5px] font-bold text-gray-900">
        {formatVnd(preview.soTienCan)}
      </p>
      <dl className="mt-[15px] border-t border-gray-100 pt-[11.25px]">
        <MoneyRow
          label={DEPOSIT_TEXT.currentBalance}
          value={formatVnd(balance)}
          valueClass="text-success"
        />
        {after !== null && (
          <MoneyRow
            label={DEPOSIT_TEXT.balanceAfter}
            value={formatVnd(after)}
            valueClass="text-gray-900"
          />
        )}
      </dl>
    </div>
  );
}

export function DepositPaymentPanel({
  maLichHen,
  onPaid,
}: DepositPaymentPanelProps) {
  const { state, retry } = useRemote(
    (signal) => getDepositPreview(maLichHen, signal),
    [maLichHen],
  );
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // Khoá đồng bộ: hai lần bấm trong cùng một lượt render vẫn chỉ gửi một lần (state chưa kịp cập nhật)
  const inFlight = useRef(false);

  if (state.status === 'loading')
    return <LoadingState message={DEPOSIT_TEXT.loading} />;
  if (state.status === 'error') {
    // Lỗi nghiệp vụ (hết giờ giữ chỗ, sai trạng thái, không cần cọc, không tìm thấy): thử lại cũng vậy nên không có nút "Thử lại"
    const message = knownMessage(state.error);
    if (message !== null) return <Notice tone="danger">{message}</Notice>;
    return <ErrorState error={state.error} onRetry={retry} />;
  }

  const preview = state.data;
  const paid = outcome?.kind === 'paid' ? outcome.result : null;
  const canPay =
    preview.duSoDu &&
    !sending &&
    (outcome === null || outcome.kind === 'retry');

  const pay = async () => {
    if (inFlight.current || !canPay) return;
    inFlight.current = true;
    setSending(true);
    setOutcome(null);
    try {
      const result = await payDeposit(maLichHen);
      setOutcome({ kind: 'paid', result });
      setSending(false);
      // Giữ khoá: lịch đã xác nhận, không còn gì để gửi
      onPaid(result);
      return;
    } catch (caught) {
      setOutcome(outcomeFromPayError(caught));
    }
    inFlight.current = false;
    setSending(false);
  };

  return (
    <div>
      <AmountCard preview={preview} paid={paid} />

      {!preview.duSoDu && paid === null && outcome?.kind !== 'blocked' && (
        <Notice tone="warning">
          {DEPOSIT_TEXT.insufficient}
          <TopupLink />
        </Notice>
      )}
      {outcome?.kind === 'blocked' && (
        <Notice tone="danger">
          {outcome.message}
          {outcome.topup && <TopupLink />}
        </Notice>
      )}
      {outcome?.kind === 'retry' && (
        <Notice tone={outcome.tone}>{outcome.message}</Notice>
      )}

      {paid !== null ? (
        <Notice tone="success">
          {paid.daXuLyTruocDo ? DEPOSIT_TEXT.paidBefore : DEPOSIT_TEXT.paid}
        </Notice>
      ) : (
        <button
          type="button"
          disabled={!canPay}
          onClick={() => void pay()}
          className="mt-[18.75px] flex h-[45px] w-full items-center justify-center rounded-[13.375px] bg-brand-strong px-[22.5px] text-[15px] leading-[22.5px] font-semibold text-white hover:bg-brand-hover disabled:opacity-60"
        >
          {sending
            ? DEPOSIT_TEXT.submitting
            : DEPOSIT_TEXT.submit(formatVnd(preview.soTienCan))}
        </button>
      )}
    </div>
  );
}
