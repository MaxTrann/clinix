import { CheckCircle2, Clock, XCircle, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ApiError } from '../../../shared/api/errors';
import { useRemote } from '../../../shared/hooks/use-remote';
import { formatVnd } from '../../../shared/money/format-vnd';
import { PATIENT_WALLET_PATH } from '../../../shared/routes/wallet-paths';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { getTopupStatus, type TopupStatus } from './topup-api';
import { POLL_DELAYS_MS } from './topup-form';
import { TOPUP_TEXT } from './topup-text';

// Trang kết quả nạp (payment F2; nơi cổng đưa Bệnh nhân quay về; CHƯA có frame Figma: dùng thành phần có sẵn theo PLAN 4.5, Trung chọn 18/11/2026).
//  - Chỉ lấy MÃ giao dịch (`vnp_TxnRef`) từ chuỗi truy vấn để hỏi `GET /patient/wallet/topups/:maGiaoDich`; mọi tham số khác của cổng (mã phản hồi, chữ ký…) bị BỎ QUA:
//    kết quả chỉ tin máy chủ (WNT-05; người dùng tự sửa được chuỗi truy vấn).
//  - `DangXuLy` ⇒ hỏi lại sau `POLL_DELAYS_MS` (giãn dần) rồi DỪNG, cho nút "Kiểm tra lại" (WNT-05).
//  - 404 (của người khác, không tồn tại, thiếu mã) ⇒ "Không tìm thấy" (WNT-07). Lỗi khác ⇒ câu lỗi chung kèm "Thử lại".

const TXN_REF = /^[1-9]\d{0,18}$/;

function ResultCard({
  icon: Icon,
  tone,
  title,
  hint,
  status,
  extra,
}: {
  icon: LucideIcon;
  tone: string;
  title: string;
  hint: string;
  status?: TopupStatus;
  extra?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-[12px] border border-gray-200 bg-white px-[24px] py-[28px] text-center">
      <Icon aria-hidden="true" className={`size-[40px] ${tone}`} />
      <h2 className="pt-[12px] text-[18px] leading-[27px] font-bold text-gray-900">
        {title}
      </h2>
      {hint !== '' && (
        <p className="pt-[4px] text-[13px] leading-[19.5px] text-gray-500">
          {hint}
        </p>
      )}
      {status && (
        <dl className="mt-[16px] grid w-full max-w-[360px] grid-cols-2 gap-y-[6px] text-left text-[13px] leading-[19.5px]">
          <dt className="text-gray-500">{TOPUP_TEXT.resultAmount}</dt>
          <dd className="text-right font-bold text-gray-900">
            {formatVnd(status.soTien)}
          </dd>
          <dt className="text-gray-500">{TOPUP_TEXT.resultCode}</dt>
          <dd className="text-right font-medium text-gray-700">
            {status.maGiaoDich}
          </dd>
        </dl>
      )}
      {extra}
      <Link
        to={PATIENT_WALLET_PATH}
        className="mt-[20px] rounded-[10px] bg-brand px-[20px] py-[10px] text-[14px] leading-[21px] font-bold text-white hover:bg-brand-hover"
      >
        {TOPUP_TEXT.backToWallet}
      </Link>
    </div>
  );
}

function TopupResult({ maGiaoDich }: { maGiaoDich: string }) {
  const [round, setRound] = useState(0);
  const { state, retry } = useRemote(
    (signal) => getTopupStatus(maGiaoDich, signal),
    [maGiaoDich, round],
  );
  const pending =
    state.status === 'ready' && state.data.trangThai === 'DangXuLy';
  const delay = POLL_DELAYS_MS[round];
  const exhausted = pending && delay === undefined;

  useEffect(() => {
    if (!pending || delay === undefined) return;
    const timer = setTimeout(() => setRound((n) => n + 1), delay);
    return () => clearTimeout(timer);
  }, [pending, delay]);

  if (state.status === 'loading' && round === 0)
    return <LoadingState message={TOPUP_TEXT.resultLoading} />;
  if (state.status === 'error') {
    if (state.error instanceof ApiError && state.error.status === 404)
      return <NotFound />;
    return <ErrorState error={state.error} onRetry={retry} />;
  }
  if (state.status === 'loading')
    return <LoadingState message={TOPUP_TEXT.resultLoading} />;

  const status = state.data;
  if (status.trangThai === 'ThanhCong')
    return (
      <ResultCard
        icon={CheckCircle2}
        tone="text-success"
        title={TOPUP_TEXT.resultSuccess}
        hint={TOPUP_TEXT.resultSuccessHint}
        status={status}
      />
    );
  if (status.trangThai === 'ThatBai')
    return (
      <ResultCard
        icon={XCircle}
        tone="text-danger"
        title={TOPUP_TEXT.resultFailed}
        hint={TOPUP_TEXT.resultFailedHint}
        status={status}
      />
    );
  return (
    <ResultCard
      icon={Clock}
      tone="text-warning"
      title={TOPUP_TEXT.resultPending}
      hint={TOPUP_TEXT.resultPendingHint}
      status={status}
      extra={
        exhausted && (
          <div className="pt-[12px]">
            <p
              role="status"
              className="text-[13px] leading-[19.5px] text-gray-500"
            >
              {TOPUP_TEXT.resultStillPending}
            </p>
            <button
              type="button"
              onClick={() => setRound(0)}
              className="mt-[8px] text-[13px] font-semibold text-brand-strong underline"
            >
              {TOPUP_TEXT.checkAgain}
            </button>
          </div>
        )
      }
    />
  );
}

function NotFound() {
  return (
    <ResultCard
      icon={XCircle}
      tone="text-gray-400"
      title={TOPUP_TEXT.resultNotFound}
      hint=""
    />
  );
}

export function TopupResultPage() {
  const [params] = useSearchParams();
  const ref = params.get('vnp_TxnRef') ?? '';
  return (
    <section className="mx-auto w-full max-w-[640px]">
      <h1 className="text-[24px] leading-[36px] font-extrabold tracking-[-0.3px] text-gray-900">
        {TOPUP_TEXT.resultTitle}
      </h1>
      <div className="pt-[20px]">
        {TXN_REF.test(ref) ? (
          <TopupResult key={ref} maGiaoDich={ref} />
        ) : (
          <NotFound />
        )}
      </div>
    </section>
  );
}
