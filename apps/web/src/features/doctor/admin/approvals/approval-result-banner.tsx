import { CircleAlert, CircleCheck, X } from 'lucide-react';
import type { ApprovalOutcome } from '../../api/admin-leave-api';
import { describeCancellation } from './approvals-format';

interface BannerProps {
  outcome: ApprovalOutcome;
  retrying: boolean;
  // Lỗi của lần "Xử lý lại" vừa rồi (câu đã chọn sẵn); `null` = chưa lỗi
  retryError: string | null;
  onRetry: () => void;
  onDismiss: () => void;
}

// Banner kết quả sau khi Duyệt (Figma `586:2`: nền xanh, "Đã duyệt nghỉ phép. Đã hủy N lịch hẹn."; WA-11, WA-12). Duyệt luôn thành công khi tới đây:
// phần huỷ lịch hẹn có thể dang dở (`hoanTat: false`) hoặc có lịch không huỷ được (`khongHuyDuoc`), lúc đó banner chuyển vàng, liệt kê mã lịch
// và (chỉ khi dang dở) có nút "Xử lý lại". Lịch "không huỷ được" (ví dụ vừa được tiếp đón) chạy lại cũng không đổi, nên không có nút cho trường hợp đó.
export function ApprovalResultBanner({
  outcome,
  retrying,
  retryError,
  onRetry,
  onDismiss,
}: BannerProps) {
  const { tone, message } = describeCancellation(outcome.huyLichHen);
  const success = tone === 'success';
  const Icon = success ? CircleCheck : CircleAlert;
  return (
    <div
      role={success ? 'status' : 'alert'}
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-4 py-3 text-sm ${
        success
          ? 'border-success-line bg-success-soft text-success'
          : 'border-warning-line bg-warning-soft text-warning'
      }`}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <p className="min-w-0 flex-1 break-words">{message}</p>
      {!outcome.huyLichHen.hoanTat && (
        <button
          type="button"
          disabled={retrying}
          onClick={onRetry}
          className="min-h-9 rounded-lg border border-warning-line bg-white px-3 text-xs font-semibold text-warning hover:bg-warning-soft disabled:opacity-50"
        >
          {retrying ? 'Đang xử lý…' : 'Xử lý lại'}
        </button>
      )}
      <button
        type="button"
        aria-label="Đóng thông báo"
        onClick={onDismiss}
        className="inline-flex size-8 items-center justify-center rounded-lg hover:bg-white/60"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
      {retryError !== null && (
        <p role="alert" className="basis-full text-xs text-danger-strong">
          {retryError}
        </p>
      )}
    </div>
  );
}
