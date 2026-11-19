import { Banknote, CreditCard, type LucideIcon } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { WALLET_TEXT } from './wallet-text';

// Thẻ "Thao tác ví" với hai tab Nạp tiền, Rút tiền (payment F1; Figma `417:222`). Nội dung tab do trang truyền vào: F2 (`TopupPanel` của payment) cho tab nạp,
// F6 (`WithdrawPanel`) cho tab rút; tab không được truyền thì hiện câu "đang phát triển" (Trung chọn 17/11/2026). Tab đang chọn là trạng thái RIÊNG của thẻ này: lỗi tải số dư hay
// lịch sử, hay lần tải lại sau khi gửi rút, không gỡ thẻ nên không làm mất tab (WVI-07).
type TabKey = 'topup' | 'withdraw';

const TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: 'topup', label: WALLET_TEXT.topupTab, icon: CreditCard },
  { key: 'withdraw', label: WALLET_TEXT.withdrawTab, icon: Banknote },
];

export function WalletActions({
  topup,
  withdraw,
}: {
  /** Nội dung tab Nạp tiền; `undefined` ⇒ câu "đang phát triển". */
  topup?: ReactNode;
  /** Nội dung tab Rút tiền; `undefined` ⇒ câu "đang phát triển". */
  withdraw?: ReactNode;
}) {
  const content: Record<TabKey, ReactNode> = { topup, withdraw };
  const [active, setActive] = useState<TabKey>('topup');
  const baseId = useId();
  const tabId = (key: TabKey) => `${baseId}-tab-${key}`;
  const panelId = (key: TabKey) => `${baseId}-panel-${key}`;

  return (
    <section
      aria-labelledby={`${baseId}-title`}
      className="overflow-hidden rounded-[12px] border border-gray-200 bg-white"
    >
      <div className="px-[18px] pt-[16px]">
        <h2
          id={`${baseId}-title`}
          className="text-[15px] leading-[22.5px] font-bold text-gray-900"
        >
          {WALLET_TEXT.actionsTitle}
        </h2>
        <p className="pt-[2px] text-[12px] leading-[18px] text-gray-500">
          {WALLET_TEXT.actionsSubtitle}
        </p>
      </div>
      <div
        role="tablist"
        aria-label={WALLET_TEXT.actionsTitle}
        className="mt-[12px] flex border-b border-gray-200"
      >
        {TABS.map(({ key, label, icon: Icon }) => {
          const selected = key === active;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              id={tabId(key)}
              aria-selected={selected}
              aria-controls={panelId(key)}
              onClick={() => setActive(key)}
              className={`-mb-px flex items-center gap-[6px] border-b-2 px-[20px] py-[11px] text-[14px] leading-[21px] font-semibold ${
                selected
                  ? 'border-[#49bce2] text-brand-strong'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon aria-hidden="true" className="size-[14px]" />
              {label}
            </button>
          );
        })}
      </div>
      {TABS.map(({ key }) => (
        <div
          key={key}
          role="tabpanel"
          id={panelId(key)}
          aria-labelledby={tabId(key)}
          hidden={key !== active}
          className="p-[18px]"
        >
          {content[key] ?? (
            <p className="rounded-[8px] border border-dashed border-gray-200 bg-gray-50 px-[12px] py-[40px] text-center text-[13px] text-gray-500">
              {WALLET_TEXT.tabComingSoon}
            </p>
          )}
        </div>
      ))}
    </section>
  );
}
