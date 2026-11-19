import { CircleCheck } from 'lucide-react';
import { formatVnd } from '../../../shared/money/format-vnd';
import type { CreatedWithdrawal } from '../api/wallet-types';
import { AvailableBox } from './withdraw-panel';
import { WITHDRAW_TEXT } from './withdraw-text';

// Màn sau khi gửi yêu cầu rút (payment F6; Figma `437:2`). Số lấy từ phản hồi 201 (máy chủ tính dưới khoá ví), web không tự trừ.
// KHÔNG có nút "Gửi yêu cầu khác" của Figma: yêu cầu vừa gửi đang ChoDuyet nên chưa gửi được yêu cầu mới (WRT-04, Q8; Trung chốt 19/11/2026), thay bằng một câu hướng dẫn.
export function WithdrawSuccess({ result }: { result: CreatedWithdrawal }) {
  return (
    <div className="flex flex-col gap-[16px]">
      <AvailableBox
        available={result.soDuKhaDung}
        held={result.soTienDangGiu}
      />
      <div
        role="status"
        className="flex flex-col items-center gap-[6px] py-[8px] text-center"
      >
        <span className="flex size-[46px] items-center justify-center rounded-full bg-green-100">
          <CircleCheck
            aria-hidden="true"
            className="size-[24px] text-green-600"
          />
        </span>
        <p className="pt-[6px] text-[14px] leading-[21px] font-bold text-green-700">
          {WITHDRAW_TEXT.successTitle}
        </p>
        <p className="text-[20px] leading-[28px] font-extrabold text-gray-900">
          {formatVnd(result.soTien)}
        </p>
        <p className="text-[12px] leading-[18px] text-gray-500">
          {WITHDRAW_TEXT.successBalances}{' '}
          <strong className="text-gray-700">
            {formatVnd(result.soDuKhaDung)}
          </strong>
          {' · '}
          {WITHDRAW_TEXT.successHeld}{' '}
          <strong className="text-gray-700">
            {formatVnd(result.soTienDangGiu)}
          </strong>
        </p>
        <p className="pt-[6px] text-[12px] leading-[18px] text-gray-500">
          {WITHDRAW_TEXT.nextRequestHint}
        </p>
      </div>
    </div>
  );
}
