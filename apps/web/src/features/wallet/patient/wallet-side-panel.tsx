import {
  Banknote,
  ChevronRight,
  CircleHelp,
  FileText,
  Shield,
  type LucideIcon,
} from 'lucide-react';
import { formatVnd } from '../../../shared/money/format-vnd';
import type { LatestWithdrawal as Withdrawal } from '../api/wallet-types';
import { BADGE_TONE } from './tone-classes';
import {
  formatVietnamDate,
  formatVietnamTime,
  withdrawalStatusLabel,
} from './wallet-labels';
import { WALLET_TEXT } from './wallet-text';

// Cột phải của trang ví (payment F1): "Yêu cầu rút gần nhất" (Figma `417:310` khi chưa có, `437:292` khi có) và "Hỗ trợ & hướng dẫn" (`417:322`).

export function LatestWithdrawal({
  withdrawal,
}: {
  withdrawal: Withdrawal | null;
}) {
  return (
    <section
      aria-labelledby="wallet-latest-withdrawal"
      className="overflow-hidden rounded-[12px] border border-gray-200 bg-white"
    >
      <div className="flex items-center gap-[7px] border-b border-[#f0f0f0] px-[16px] py-[13px]">
        <Banknote aria-hidden="true" className="size-[14px] text-[#49bce2]" />
        <h2
          id="wallet-latest-withdrawal"
          className="text-[13px] leading-[19.5px] font-bold text-gray-900"
        >
          {WALLET_TEXT.latestWithdrawal}
        </h2>
      </div>
      {withdrawal === null ? (
        <p className="px-[16px] py-[20px] text-center text-[12px] leading-[18px] text-gray-500">
          {WALLET_TEXT.noWithdrawal}
        </p>
      ) : (
        <WithdrawalRow withdrawal={withdrawal} />
      )}
    </section>
  );
}

function WithdrawalRow({ withdrawal }: { withdrawal: Withdrawal }) {
  const status = withdrawalStatusLabel(withdrawal.trangThai);
  return (
    <div className="flex items-center justify-between gap-[8px] px-[16px] py-[11px]">
      <div className="flex items-center gap-[10px]">
        <span className="flex size-[32px] shrink-0 items-center justify-center rounded-full bg-amber-100">
          <Banknote aria-hidden="true" className="size-[14px] text-amber-600" />
        </span>
        <div>
          <p className="text-[13px] leading-[19.5px] font-bold text-gray-900">
            {formatVnd(withdrawal.soTien)}
          </p>
          <p className="text-[10px] leading-[15px] text-gray-500">
            {formatVietnamDate(withdrawal.thoiDiemYeuCau)} ·{' '}
            {formatVietnamTime(withdrawal.thoiDiemYeuCau)}
          </p>
        </div>
      </div>
      <span
        className={`shrink-0 rounded-full px-[8px] py-[2px] text-[10px] leading-[15px] font-bold ${BADGE_TONE[status.tone]}`}
      >
        {status.label}
      </span>
    </div>
  );
}

const SUPPORT_ITEMS: { label: string; icon: LucideIcon }[] = [
  { label: WALLET_TEXT.supportTerms, icon: FileText },
  { label: WALLET_TEXT.supportSecurity, icon: Shield },
  { label: WALLET_TEXT.supportFaq, icon: CircleHelp },
];

// Ba mục chưa có trang đích: nút vô hiệu, chữ phụ cho trình đọc màn hình như mục menu chưa có `to` (Trung chọn 17/11/2026)
export function SupportLinks() {
  return (
    <section
      aria-labelledby="wallet-support"
      className="overflow-hidden rounded-[10px] border border-gray-200 bg-white"
    >
      <div className="flex items-center gap-[6px] border-b border-[#f0f0f0] px-[14px] py-[11px]">
        <CircleHelp aria-hidden="true" className="size-[13px] text-[#49bce2]" />
        <h2
          id="wallet-support"
          className="text-[12px] leading-[18px] font-bold text-gray-700"
        >
          {WALLET_TEXT.supportTitle}
        </h2>
      </div>
      <ul>
        {SUPPORT_ITEMS.map(({ label, icon: Icon }) => (
          <li key={label} className="border-b border-[#f5f5f5] last:border-b-0">
            <button
              type="button"
              disabled
              className="flex w-full items-center justify-between px-[14px] py-[10px] text-left disabled:cursor-not-allowed"
            >
              <span className="flex items-center gap-[9px] text-[12px] leading-[18px] text-gray-700">
                <Icon
                  aria-hidden="true"
                  className="size-[13px] text-[#49bce2]"
                />
                {label}
                <span className="sr-only"> {WALLET_TEXT.notAvailable}</span>
              </span>
              <ChevronRight
                aria-hidden="true"
                className="size-[13px] text-gray-300"
              />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
