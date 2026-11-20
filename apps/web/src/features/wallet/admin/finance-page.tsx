import { Wallet } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { FINANCE_TEXT } from './finance-text';
import { UnpostedTopupTab } from './unposted-topup-tab';
import { WithdrawalTab } from './withdrawal-tab';

// Màn "Quản lý tài chính ví" của Quản trị viên toàn hệ thống (payment F7; Figma `549:2`). Ba tab; F7 làm tab "Yêu cầu rút tiền", hai tab còn lại do F8 (hoàn tiền đặc biệt)
// và F9 (nạp ví chưa cộng, đã làm) thay câu "đang phát triển". Tab đang chọn là state của trang, không vào URL. Cổng `ToanHeThong` ở route (`finance-routes.tsx`, Q10).
type TabKey = 'withdrawals' | 'specialRefunds' | 'unpostedTopups';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'withdrawals', label: FINANCE_TEXT.tabWithdrawals },
  { key: 'specialRefunds', label: FINANCE_TEXT.tabSpecialRefunds },
  { key: 'unpostedTopups', label: FINANCE_TEXT.tabUnpostedTopups },
];

export function FinancePage() {
  const [active, setActive] = useState<TabKey>('withdrawals');
  const baseId = useId();
  const content: Record<TabKey, ReactNode> = {
    withdrawals: <WithdrawalTab />,
    specialRefunds: undefined,
    unpostedTopups: <UnpostedTopupTab />,
  };

  return (
    <section className="flex flex-col gap-[20px]">
      <div className="flex items-center gap-[12px]">
        <span className="flex size-[36px] items-center justify-center rounded-[10px] bg-cyan-50">
          <Wallet aria-hidden="true" className="size-[18px] text-[#0e8fb9]" />
        </span>
        <div>
          <h1 className="text-[20px] leading-[28px] font-bold text-gray-900">
            {FINANCE_TEXT.title}
          </h1>
          <p className="text-[13px] text-gray-500">{FINANCE_TEXT.subtitle}</p>
        </div>
      </div>

      <div>
        <div
          role="tablist"
          aria-label={FINANCE_TEXT.title}
          className="flex gap-[4px] border-b border-gray-200"
        >
          {TABS.map(({ key, label }) => {
            const selected = key === active;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                id={`${baseId}-tab-${key}`}
                aria-selected={selected}
                aria-controls={`${baseId}-panel-${key}`}
                onClick={() => setActive(key)}
                className={`-mb-px border-b-2 px-[14px] py-[10px] text-[14px] ${
                  selected
                    ? 'border-[#0e8fb9] font-semibold text-[#0e8fb9]'
                    : 'border-transparent text-gray-600'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        {TABS.map(({ key }) => (
          <div
            key={key}
            role="tabpanel"
            id={`${baseId}-panel-${key}`}
            aria-labelledby={`${baseId}-tab-${key}`}
            hidden={key !== active}
            className="pt-[16px]"
          >
            {/* Chỉ dựng tab đang mở: tab rút tiền không gọi API khi đang xem tab khác */}
            {key === active &&
              (content[key] ?? (
                <p className="rounded-[8px] border border-dashed border-gray-200 bg-gray-50 px-[12px] py-[40px] text-center text-[13px] text-gray-500">
                  {FINANCE_TEXT.tabComingSoon}
                </p>
              ))}
          </div>
        ))}
      </div>
    </section>
  );
}
