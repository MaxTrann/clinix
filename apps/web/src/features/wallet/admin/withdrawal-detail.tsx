import { CircleAlert } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useRemote } from '../../../shared/hooks/use-remote';
import { formatSignedVnd, formatVnd } from '../../../shared/money/format-vnd';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { BADGE_TONE } from '../patient/tone-classes';
import {
  TYPE_FILTER_OPTIONS,
  withdrawalStatusLabel,
} from '../patient/wallet-labels';
import {
  getAdminWithdrawal,
  type AdminWithdrawalDetail,
} from './admin-withdrawal-api';
import { FINANCE_TEXT } from './finance-text';
import { formatDateTime } from './finance-format';
import { WithdrawalDecision, type DecisionNotice } from './withdrawal-decision';

// Nội dung ngăn "Chi tiết yêu cầu rút tiền" (payment F7; Figma `566:2`). Tải chi tiết riêng (`GET …/:maYeuCau`), có "Thử lại" riêng.
// Khối ví CHỈ hiện hai số máy chủ trả (Số dư thực tế, Đang giữ); bỏ "Khả dụng" và "Sau khi duyệt, còn lại" của Figma vì web không tự trừ tiền (Trung chốt 19/11/2026).
// Thêm khối "Giao dịch gần đây" (2.4 XRT b2; [đề xuất], Figma không vẽ). Nút duyệt và từ chối CHỈ khi `ChoDuyet` (WQL-07). Xử lý xong ⇒ tải lại ngăn và báo trang tải lại danh sách.

const NOTICE_TONE: Record<DecisionNotice['tone'], string> = {
  success: 'border-green-200 bg-green-50 text-green-700',
  warning: 'border-warning-line bg-warning-soft text-warning',
  danger: 'border-danger-line bg-danger-soft text-danger-strong',
};

const TYPE_LABEL = new Map(
  TYPE_FILTER_OPTIONS.map((option) => [option.value, option.label]),
);

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-[12px] py-[5px] text-[13px]">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right text-gray-900">{children}</dd>
    </div>
  );
}

function StatusBadge({ request }: { request: AdminWithdrawalDetail }) {
  const status = withdrawalStatusLabel(request.trangThai);
  return (
    <span
      className={`rounded-full px-[8px] py-[2px] text-[11px] font-semibold ${BADGE_TONE[status.tone]}`}
    >
      {status.label}
    </span>
  );
}

function DetailBody({
  request,
  onSettled,
}: {
  request: AdminWithdrawalDetail;
  onSettled: (notice: DecisionNotice, reload: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-[14px]">
      <p className="text-[11px] text-gray-400">
        {FINANCE_TEXT.requestCode(request.maYeuCau)}
      </p>
      <dl className="rounded-[12px] bg-gray-50 px-[14px] py-[8px]">
        <Row label={FINANCE_TEXT.columnPatient}>{request.benhNhan.hoTen}</Row>
        <Row label={FINANCE_TEXT.amountRequested}>
          <strong className="text-[16px]">{formatVnd(request.soTien)}</strong>
        </Row>
        <Row label={FINANCE_TEXT.status}>
          <StatusBadge request={request} />
        </Row>
        <Row label={FINANCE_TEXT.sentAt}>
          {formatDateTime(request.thoiDiemYeuCau)}
        </Row>
        {request.thoiDiemXuLy !== null && (
          <Row label={FINANCE_TEXT.handledAt}>
            {formatDateTime(request.thoiDiemXuLy)}
          </Row>
        )}
      </dl>

      <section
        aria-label={FINANCE_TEXT.walletTitle}
        className="rounded-[12px] border border-gray-200"
      >
        <h3 className="border-b border-gray-100 px-[14px] py-[8px] text-[11px] font-semibold tracking-[0.5px] text-gray-500 uppercase">
          {FINANCE_TEXT.walletTitle}
        </h3>
        <dl className="px-[14px] py-[4px]">
          <Row label={FINANCE_TEXT.actualBalance}>
            <strong>{formatVnd(request.soDuHienTai)}</strong>
          </Row>
          <Row label={FINANCE_TEXT.heldBalance}>
            <strong className="text-amber-700">
              {formatVnd(request.soTienDangGiu)}
            </strong>
          </Row>
        </dl>
      </section>

      <section
        aria-label={FINANCE_TEXT.recentTitle}
        className="rounded-[12px] border border-gray-200"
      >
        <h3 className="border-b border-gray-100 px-[14px] py-[8px] text-[11px] font-semibold tracking-[0.5px] text-gray-500 uppercase">
          {FINANCE_TEXT.recentTitle}
        </h3>
        {request.giaoDichGanDay.length === 0 ? (
          <p className="px-[14px] py-[10px] text-[12px] text-gray-500">
            {FINANCE_TEXT.recentEmpty}
          </p>
        ) : (
          <ul className="px-[14px] py-[4px]">
            {request.giaoDichGanDay.map((entry, index) => (
              <li
                key={`${entry.thoiDiem}-${index}`}
                className="flex justify-between gap-[12px] py-[5px] text-[12px]"
              >
                <span className="text-gray-700">
                  {TYPE_LABEL.get(entry.loai) ?? entry.loai}
                  <span className="pl-[6px] text-gray-400">
                    {formatDateTime(entry.thoiDiem)}
                  </span>
                </span>
                <span className="text-gray-900">
                  {formatSignedVnd(entry.soTien)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="flex gap-[8px] rounded-[10px] bg-gray-50 px-[12px] py-[10px] text-[11px] leading-[16px] text-gray-500">
        <CircleAlert
          aria-hidden="true"
          className="mt-[1px] size-[12px] shrink-0"
        />
        {FINANCE_TEXT.manualNotice}
      </p>

      {request.trangThai === 'ChoDuyet' && (
        // `key`: mỗi lần tải lại là một hộp mới (đóng hộp cũ, xoá lý do đã nhập)
        <WithdrawalDecision
          key={`${request.maYeuCau}-${request.trangThai}`}
          request={request}
          onSettled={onSettled}
        />
      )}
    </div>
  );
}

export function WithdrawalDetail({
  maYeuCau,
  onChanged,
}: {
  maYeuCau: string;
  /** Đã xử lý (hay có thể đã đổi): trang tải lại danh sách và số đếm. */
  onChanged: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState<DecisionNotice | null>(null);
  const { state, retry } = useRemote(
    (signal) => getAdminWithdrawal(maYeuCau, signal),
    [maYeuCau, attempt],
  );

  const settled = (next: DecisionNotice, reload: boolean) => {
    setNotice(next);
    if (!reload) return;
    setAttempt((n) => n + 1);
    onChanged();
  };

  return (
    <div className="flex flex-col gap-[14px]">
      {notice !== null && (
        <p
          role={notice.tone === 'success' ? 'status' : 'alert'}
          className={`rounded-[8px] border px-[12px] py-[8px] text-[13px] ${NOTICE_TONE[notice.tone]}`}
        >
          {notice.message}
        </p>
      )}
      {state.status === 'loading' && (
        <LoadingState message={FINANCE_TEXT.detailLoading} />
      )}
      {state.status === 'error' && (
        <ErrorState error={state.error} onRetry={retry} />
      )}
      {state.status === 'ready' && (
        <DetailBody request={state.data} onSettled={settled} />
      )}
    </div>
  );
}
