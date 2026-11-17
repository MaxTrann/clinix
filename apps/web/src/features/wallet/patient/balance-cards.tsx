import { Clock, Wallet, type LucideIcon } from 'lucide-react';
import { formatVndDigits } from '../../../shared/money/format-vnd';
import type { WalletOverview } from '../api/wallet-types';
import { WALLET_TEXT } from './wallet-text';

// Ba thẻ số dư (payment F1; Figma `417:164`, thẻ thứ ba theo `437:186`). Số lấy NGUYÊN từ API: web không cộng trừ tiền, không tự lọc nạp quá cửa sổ (WVI-01).
// Không có thẻ "Tổng số dư": PLAN L9 không gọi khả dụng + nạp chờ là số dư.
interface CardProps {
  icon: LucideIcon;
  iconClass: string;
  label: string;
  amount: string;
  amountClass: string;
  hint: string;
  last?: boolean;
}

function BalanceCard({
  icon: Icon,
  iconClass,
  label,
  amount,
  amountClass,
  hint,
  last = false,
}: CardProps) {
  return (
    <div
      className={`flex items-center gap-[12px] bg-[#eff8ff] px-[22px] pt-[18px] pb-[16px] ${
        last ? '' : 'border-b border-blue-100 sm:border-r sm:border-b-0'
      }`}
    >
      <span className="flex size-[40px] shrink-0 items-center justify-center rounded-[10px] bg-blue-100">
        <Icon aria-hidden="true" className={`size-[20px] ${iconClass}`} />
      </span>
      <div className="min-w-0">
        <dt className="text-[11px] leading-[16.5px] font-semibold text-gray-500">
          {label}
        </dt>
        <dd className="pt-[4px] whitespace-nowrap">
          <span
            className={`text-[22px] leading-[22px] font-extrabold tracking-[-0.5px] ${amountClass}`}
          >
            {formatVndDigits(amount)}
          </span>
          <span className="ml-[2px] text-[13px] leading-[13px] font-semibold text-gray-400">
            đ
          </span>
        </dd>
        <dd className="pt-[3px] text-[11px] leading-[16.5px] text-gray-500">
          {hint}
        </dd>
      </div>
    </div>
  );
}

export function BalanceCards({ overview }: { overview: WalletOverview }) {
  return (
    <dl
      aria-label={WALLET_TEXT.balancesLabel}
      className="grid overflow-hidden rounded-[12px] border border-blue-200 bg-white sm:grid-cols-3"
    >
      <BalanceCard
        icon={Wallet}
        iconClass="text-[#49bce2]"
        label={WALLET_TEXT.available}
        amount={overview.soDuKhaDung}
        amountClass="text-gray-900"
        hint={WALLET_TEXT.availableHint}
      />
      <BalanceCard
        icon={Clock}
        iconClass="text-amber-600"
        label={WALLET_TEXT.pendingTopup}
        amount={overview.napChoXacNhan}
        amountClass="text-gray-900"
        hint={WALLET_TEXT.pendingTopupHint}
      />
      {/* Figma `437:196` chữ `#d97706` (amber-600) chỉ ≈ 3:1 trên nền xanh nhạt: dùng token `warning` (amber-700) của ADR 0004 */}
      <BalanceCard
        icon={Clock}
        iconClass="text-amber-600"
        label={WALLET_TEXT.held}
        amount={overview.soTienDangGiu}
        amountClass="text-warning"
        hint={WALLET_TEXT.heldHint}
        last
      />
    </dl>
  );
}
