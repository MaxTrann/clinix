import { useRemote } from '../../../shared/hooks/use-remote';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { getWalletOverview } from '../api/wallet-api';
import { BalanceCards } from './balance-cards';
import { TransactionHistory } from './transaction-history';
import { WalletActions } from './wallet-actions';
import { LatestWithdrawal, SupportLinks } from './wallet-side-panel';
import { WALLET_TEXT } from './wallet-text';

// Trang "Ví của tôi" của Bệnh nhân (payment F1; Figma `417:2`). Chỉ ĐỌC (hai API GET của B1). Số dư và lịch sử tải RIÊNG: lỗi một bên không che bên kia,
// và thẻ "Thao tác ví" luôn hiện nên tab đang chọn không mất khi một bên lỗi (WVI-07). Không lưu số dư hay dữ liệu ví ở `localStorage`, URL, log (WVI-06).
export function WalletPage() {
  const { state: overview, retry } = useRemote(
    (signal) => getWalletOverview(signal),
    [],
  );

  return (
    <section className="mx-auto w-full max-w-[1120px]">
      <h1 className="text-[24px] leading-[36px] font-extrabold tracking-[-0.3px] text-gray-900">
        {WALLET_TEXT.title}
      </h1>
      <p className="pt-[4px] text-[13px] leading-[19.5px] text-gray-500">
        {WALLET_TEXT.subtitle}
      </p>

      <div className="pt-[20px]">
        {overview.status === 'loading' && (
          <LoadingState message={WALLET_TEXT.balanceLoading} />
        )}
        {overview.status === 'error' && (
          <ErrorState error={overview.error} onRetry={retry} />
        )}
        {overview.status === 'ready' && (
          <BalanceCards overview={overview.data} />
        )}
      </div>

      <div className="grid items-start gap-[18px] pt-[20px] lg:grid-cols-[minmax(0,1fr)_320px]">
        <WalletActions />
        <div className="flex flex-col gap-[14px]">
          {/* Khối rút gần nhất cùng nguồn với thẻ số dư: khi đang tải hay lỗi thì thông báo đã hiện ở trên, ở đây không lặp lại */}
          {overview.status === 'ready' && (
            <LatestWithdrawal withdrawal={overview.data.yeuCauRutGanNhat} />
          )}
          <SupportLinks />
        </div>
      </div>

      <div className="pt-[20px]">
        <TransactionHistory />
      </div>
    </section>
  );
}
