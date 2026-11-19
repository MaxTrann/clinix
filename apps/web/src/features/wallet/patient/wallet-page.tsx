import { useState } from 'react';
import { useRemote } from '../../../shared/hooks/use-remote';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { TopupPanel } from '../../payment';
import { getWalletOverview } from '../api/wallet-api';
import type { CreatedWithdrawal } from '../api/wallet-types';
import { BalanceCards } from './balance-cards';
import { TransactionHistory } from './transaction-history';
import { WalletActions } from './wallet-actions';
import { LatestWithdrawal, SupportLinks } from './wallet-side-panel';
import { WALLET_TEXT } from './wallet-text';
import { WithdrawPanel } from './withdraw-panel';
import { WithdrawSuccess } from './withdraw-success';
import { WITHDRAW_TEXT } from './withdraw-text';

// Trang "Ví của tôi" của Bệnh nhân (payment F1; Figma `417:2`). Số dư và lịch sử tải RIÊNG: lỗi một bên không che bên kia,
// và thẻ "Thao tác ví" luôn hiện nên tab đang chọn không mất khi một bên lỗi (WVI-07). Không lưu số dư hay dữ liệu ví ở `localStorage`, URL, log (WVI-06).
// payment F6: tab Rút tiền. Gửi thành công ⇒ tải lại số dư, khối "Yêu cầu rút gần nhất" và lịch sử từ API (WRT-01). Kết quả 201 giữ ở state CỦA TRANG nên màn
// "Yêu cầu đã được ghi nhận!" không mất khi phần số dư đang tải lại (lần tải đó đưa số dư về trạng thái đang tải).
export function WalletPage() {
  const { state: overview, retry } = useRemote(
    (signal) => getWalletOverview(signal),
    [],
  );
  const [submitted, setSubmitted] = useState<CreatedWithdrawal | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const refreshHistory = () => setHistoryKey((n) => n + 1);

  const withdrawContent =
    submitted !== null ? (
      <WithdrawSuccess result={submitted} />
    ) : overview.status === 'ready' ? (
      <WithdrawPanel
        available={overview.data.soDuKhaDung}
        held={overview.data.soTienDangGiu}
        latest={overview.data.yeuCauRutGanNhat}
        onSubmitted={(result) => {
          setSubmitted(result);
          retry();
          refreshHistory();
        }}
        // Hết giờ, mất mạng: chưa rõ yêu cầu đã tạo chưa ⇒ tải lại lịch sử để người dùng kiểm tra (không tải lại số dư: sẽ gỡ form và mất cảnh báo)
        onUncertain={refreshHistory}
      />
    ) : overview.status === 'loading' ? (
      <LoadingState message={WITHDRAW_TEXT.loading} />
    ) : (
      <p className="rounded-[8px] border border-dashed border-gray-200 bg-gray-50 px-[12px] py-[40px] text-center text-[13px] text-gray-500">
        {WITHDRAW_TEXT.unavailable}
      </p>
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
        <WalletActions
          topup={
            // Tab nạp cần hạn mức và cổng của CÙNG lần tải số dư (payment F2); lỗi thì nút "Thử lại" nằm ở phần số dư phía trên
            overview.status === 'ready' ? (
              <TopupPanel
                limits={overview.data.hanMucNap}
                gateways={overview.data.congThanhToan}
              />
            ) : overview.status === 'loading' ? (
              <LoadingState message={WALLET_TEXT.topupLoading} />
            ) : (
              <p className="rounded-[8px] border border-dashed border-gray-200 bg-gray-50 px-[12px] py-[40px] text-center text-[13px] text-gray-500">
                {WALLET_TEXT.topupUnavailable}
              </p>
            )
          }
          withdraw={withdrawContent}
        />
        <div className="flex flex-col gap-[14px]">
          {/* Khối rút gần nhất cùng nguồn với thẻ số dư: khi đang tải hay lỗi thì thông báo đã hiện ở trên, ở đây không lặp lại */}
          {overview.status === 'ready' && (
            <LatestWithdrawal withdrawal={overview.data.yeuCauRutGanNhat} />
          )}
          <SupportLinks />
        </div>
      </div>

      <div className="pt-[20px]">
        <TransactionHistory refreshKey={historyKey} />
      </div>
    </section>
  );
}
