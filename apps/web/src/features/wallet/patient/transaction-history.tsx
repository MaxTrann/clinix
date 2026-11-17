import {
  Banknote,
  ChevronDown,
  CircleArrowDown,
  CircleArrowUp,
  FileText,
} from 'lucide-react';
import { useState } from 'react';
import { useRemote, type RemoteState } from '../../../shared/hooks/use-remote';
import { EmptyState } from '../../../shared/ui/empty-state';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { getWalletTransactions } from '../api/wallet-api';
import type {
  WalletTransaction,
  WalletTransactionPage,
  WalletTransactionType,
} from '../api/wallet-types';
import { AMOUNT_TONE, BADGE_TONE } from './tone-classes';
import {
  TYPE_FILTER_OPTIONS,
  describeTransaction,
  formatVietnamDate,
  formatVietnamTime,
  type TypeIcon,
} from './wallet-labels';
import { WALLET_TEXT } from './wallet-text';

// "Lịch sử giao dịch" (payment F1; Figma `417:360`): lọc theo loại, bảng năm cột, chuyển trang. Bộ lọc và trang CHỈ ở bộ nhớ của component,
// không ở URL hay kho trình duyệt (WVI-06). Đổi loại thì về trang 1.

const TYPE_ICON: Record<
  TypeIcon,
  { icon: typeof CircleArrowUp; box: string; color: string }
> = {
  in: { icon: CircleArrowUp, box: 'bg-green-100', color: 'text-green-600' },
  out: { icon: CircleArrowDown, box: 'bg-red-100', color: 'text-red-600' },
  withdraw: { icon: Banknote, box: 'bg-amber-100', color: 'text-amber-600' },
};

const HEADER_CELL =
  'border-b border-[#f0f0f0] px-[14px] py-[9px] text-[10px] leading-[15px] font-bold tracking-[0.7px] text-gray-500 uppercase';
const BODY_CELL = 'h-[60px] px-[14px] py-[11px]';

export function TransactionHistory() {
  const [page, setPage] = useState(1);
  const [type, setType] = useState<WalletTransactionType | null>(null);
  const { state, retry } = useRemote(
    (signal) => getWalletTransactions({ trang: page, loai: type }, signal),
    [page, type],
  );

  const changeType = (value: string) => {
    const option = TYPE_FILTER_OPTIONS.find(
      (item) => (item.value ?? '') === value,
    );
    setType(option?.value ?? null);
    setPage(1);
  };

  return (
    <section
      aria-labelledby="wallet-history-title"
      className="overflow-hidden rounded-[12px] border border-gray-200 bg-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-[12px] border-b border-[#f0f0f0] px-[18px] py-[14px]">
        <div>
          <div className="flex items-center gap-[7px]">
            <FileText
              aria-hidden="true"
              className="size-[14px] text-[#49bce2]"
            />
            <h2
              id="wallet-history-title"
              className="text-[15px] leading-[22.5px] font-bold text-gray-900"
            >
              {WALLET_TEXT.historyTitle}
            </h2>
          </div>
          <p className="pt-[2px] text-[12px] leading-[18px] text-gray-500">
            {WALLET_TEXT.historySubtitle}
          </p>
        </div>
        <div className="relative">
          <select
            aria-label={WALLET_TEXT.historyFilterLabel}
            value={type ?? ''}
            onChange={(event) => changeType(event.target.value)}
            className="h-[31px] w-[137px] appearance-none rounded-[7px] border border-gray-200 bg-white pr-[24px] pl-[16px] text-[12px] text-gray-700"
          >
            {TYPE_FILTER_OPTIONS.map((option) => (
              <option key={option.label} value={option.value ?? ''}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-[8px] size-[12px] -translate-y-1/2 text-gray-700"
          />
        </div>
      </div>
      <HistoryBody
        state={state}
        retry={retry}
        filtered={type !== null}
        onPage={setPage}
      />
    </section>
  );
}

function HistoryBody({
  state,
  retry,
  filtered,
  onPage,
}: {
  state: RemoteState<WalletTransactionPage>;
  retry: () => void;
  filtered: boolean;
  onPage: (page: number) => void;
}) {
  if (state.status === 'loading')
    return (
      <div className="px-[18px] py-[12px]">
        <LoadingState message={WALLET_TEXT.historyLoading} />
      </div>
    );
  if (state.status === 'error')
    return (
      <div className="px-[18px] py-[12px]">
        <ErrorState error={state.error} onRetry={retry} />
      </div>
    );

  const { items, total, trang, kichThuoc } = state.data;
  const pages = Math.max(1, Math.ceil(total / kichThuoc));
  return (
    <>
      {items.length === 0 ? (
        <div className="px-[18px] py-[12px]">
          <EmptyState
            message={
              filtered
                ? WALLET_TEXT.historyEmptyFiltered
                : WALLET_TEXT.historyEmpty
            }
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr>
                <th scope="col" className={HEADER_CELL}>
                  {WALLET_TEXT.columnTime}
                </th>
                <th scope="col" className={HEADER_CELL}>
                  {WALLET_TEXT.columnType}
                </th>
                <th scope="col" className={HEADER_CELL}>
                  {WALLET_TEXT.columnContent}
                </th>
                <th scope="col" className={`${HEADER_CELL} text-right`}>
                  {WALLET_TEXT.columnAmount}
                </th>
                <th scope="col" className={HEADER_CELL}>
                  {WALLET_TEXT.columnStatus}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((tx) => (
                <TransactionRow key={tx.id} tx={tx} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <nav
          aria-label={WALLET_TEXT.historyTitle}
          className="flex items-center justify-end gap-[12px] border-t border-[#f0f0f0] px-[18px] py-[10px] text-[12px] text-gray-700"
        >
          <button
            type="button"
            disabled={trang <= 1}
            onClick={() => onPage(trang - 1)}
            className="rounded-[7px] border border-gray-200 px-[10px] py-[4px] disabled:cursor-not-allowed disabled:text-gray-400"
          >
            {WALLET_TEXT.previousPage}
          </button>
          <span aria-live="polite">{WALLET_TEXT.pageStatus(trang, pages)}</span>
          <button
            type="button"
            disabled={trang >= pages}
            onClick={() => onPage(trang + 1)}
            className="rounded-[7px] border border-gray-200 px-[10px] py-[4px] disabled:cursor-not-allowed disabled:text-gray-400"
          >
            {WALLET_TEXT.nextPage}
          </button>
        </nav>
      )}
    </>
  );
}

function TransactionRow({ tx }: { tx: WalletTransaction }) {
  const view = describeTransaction(tx);
  const { icon: Icon, box, color } = TYPE_ICON[view.typeIcon];
  return (
    <tr className="border-b border-[#f5f5f5] last:border-b-0">
      <td className={BODY_CELL}>
        <p className="text-[13px] leading-[19.5px] font-medium text-gray-700">
          {formatVietnamDate(tx.thoiDiem)}
        </p>
        <p className="pt-px text-[11px] leading-[16.5px] text-gray-500">
          {formatVietnamTime(tx.thoiDiem)}
        </p>
      </td>
      <td className={BODY_CELL}>
        <span className="flex items-center gap-[8px]">
          <span
            className={`flex size-[28px] shrink-0 items-center justify-center rounded-full ${box}`}
          >
            <Icon aria-hidden="true" className={`size-[14px] ${color}`} />
          </span>
          <span className="text-[13px] leading-[19.5px] font-semibold text-gray-900">
            {view.typeLabel}
          </span>
        </span>
      </td>
      <td className={`${BODY_CELL} text-[12px] leading-[18px] text-gray-500`}>
        {tx.noiDung}
      </td>
      <td
        className={`${BODY_CELL} text-right text-[13px] leading-[19.5px] font-bold whitespace-nowrap ${AMOUNT_TONE[view.amountTone]}`}
      >
        {view.amountText}
      </td>
      <td className={BODY_CELL}>
        <span
          className={`inline-block rounded-full px-[8px] py-[2px] text-[11px] leading-[16.5px] font-semibold whitespace-nowrap ${BADGE_TONE[view.statusTone]}`}
        >
          {view.statusLabel}
        </span>
      </td>
    </tr>
  );
}
