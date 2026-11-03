import { CircleCheck } from 'lucide-react';

const STEPS = ['Email', 'Mã OTP', 'Mật khẩu mới'];

// Thanh 3 bước (frame `643:28`). Màu theo ADR 0004 (D2): vòng hiện tại `brand-strong` 5,28:1, vòng đã qua `success` 4,95:1,
// số chưa tới `gray-700` trên `gray-200` 8,32:1, nhãn không phải bước hiện tại `gray-500` 4,84:1. Đường nối chỉ trang trí:
// trạng thái đã có ở vòng và ở chữ cho trình đọc màn hình.
export function StepBar({ current }: { current: number }) {
  return (
    <ol
      aria-label="Các bước đặt lại mật khẩu"
      className="mb-6 flex items-center"
    >
      {STEPS.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li
            key={label}
            aria-current={active ? 'step' : undefined}
            className="flex min-w-0 flex-1 items-center"
          >
            <span
              aria-hidden="true"
              className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                active
                  ? 'bg-brand-strong text-white'
                  : done
                    ? 'bg-success text-white'
                    : 'bg-gray-200 text-gray-700'
              }`}
            >
              {done ? <CircleCheck className="size-3.5" /> : index + 1}
            </span>
            {/* Dưới 360px ba nhãn không vừa một hàng (D3): chỉ hiện nhãn bước hiện tại, các nhãn khác vẫn đọc được */}
            <span
              className={`ml-1.5 truncate text-xs ${
                active
                  ? 'font-medium text-gray-900'
                  : 'text-gray-500 max-[359px]:sr-only'
              }`}
            >
              {label}
              {done && <span className="sr-only"> (đã xong)</span>}
            </span>
            {index < STEPS.length - 1 && (
              <span
                aria-hidden="true"
                className={`mx-2 h-px min-w-2 flex-1 ${
                  done ? 'bg-green-400' : 'bg-gray-200'
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
