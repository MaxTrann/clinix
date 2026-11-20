import { Info } from 'lucide-react';
import { useState } from 'react';
import { useRemote } from '../../../shared/hooks/use-remote';
import { formatVnd } from '../../../shared/money/format-vnd';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import {
  AdminDetailPanel,
  AdminTable,
  type AdminTableColumn,
} from '../../admin';
import { formatDateTime } from './finance-format';
import {
  getUnpostedTopups,
  type UnpostedTopupItem,
} from './unposted-topup-api';
import {
  UnpostedTopupAction,
  type UnpostedMode,
} from './unposted-topup-action';
import { UNPOSTED_TEXT } from './unposted-topup-text';
import type { DecisionNotice } from './withdrawal-decision';

// Tab "Nạp ví chưa cộng" (payment F9; Figma `551:2`): dải thông tin, bảng các giao dịch nạp đã được cổng xác minh nhưng chưa vào ví sau ba lần đối soát tự động, và hai nút mỗi dòng.
// `Cộng ví` và `Không thể xử lý` mở ngăn bên (`AdminDetailPanel`): bước xác nhận hay ô lý do. Xong (hay dữ liệu máy chủ có thể đã đổi) ⇒ đóng ngăn, hiện câu kết quả, tải lại bảng.
// Danh sách, dòng đang mở và câu kết quả là state của tab, KHÔNG vào URL hay kho trình duyệt (WQL-08: tên và số tiền của Bệnh nhân).
// Máy chủ trả tối đa 200 dòng, không phân trang (B15): bảng hiện một trang.

const LIST_LIMIT = 200;

const NOTICE_TONE: Record<DecisionNotice['tone'], string> = {
  success: 'border-success-line bg-success-soft text-success',
  warning: 'border-warning-line bg-warning-soft text-warning',
  danger: 'border-danger-line bg-danger-soft text-danger-strong',
};

export function UnpostedTopupTab() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [open, setOpen] = useState<{
    topup: UnpostedTopupItem;
    mode: UnpostedMode;
  } | null>(null);
  const [notice, setNotice] = useState<DecisionNotice | null>(null);
  const { state, retry } = useRemote(
    (signal) => getUnpostedTopups(signal),
    [refreshKey],
  );

  const settle = (next: DecisionNotice) => {
    setOpen(null);
    setNotice(next);
    setRefreshKey((n) => n + 1);
  };

  const columns: AdminTableColumn<UnpostedTopupItem>[] = [
    {
      id: 'code',
      header: UNPOSTED_TEXT.columnCode,
      width: '22%',
      cell: (row) => (
        <span className="flex flex-col font-mono text-[11px] leading-[16px] text-gray-500">
          <span>#{row.maGiaoDich}</span>
          <span>
            {UNPOSTED_TEXT.gateway[row.phuongThuc]}
            {row.maGiaoDichCong !== null && `: ${row.maGiaoDichCong}`}
          </span>
        </span>
      ),
    },
    {
      id: 'patient',
      header: UNPOSTED_TEXT.columnPatient,
      width: '15%',
      cell: (row) => row.benhNhan.hoTen,
    },
    {
      id: 'amount',
      header: UNPOSTED_TEXT.columnAmount,
      width: '12%',
      cell: (row) => (
        <strong className="text-success">{formatVnd(row.soTien)}</strong>
      ),
    },
    {
      id: 'verified',
      header: UNPOSTED_TEXT.columnVerified,
      width: '18%',
      cell: (row) => (
        <span className="flex flex-col items-start gap-[2px] text-[11px] leading-[16px]">
          <span className="rounded-full bg-success-soft px-[8px] py-[1px] font-semibold text-success">
            {UNPOSTED_TEXT.verified}
          </span>
          <span className="text-gray-500">
            {formatDateTime(row.thoiDiemXacMinh)}
          </span>
          <span className="text-danger">
            {UNPOSTED_TEXT.attempts(row.soLanThuTuDong, row.toiDaThuTuDong)}
          </span>
        </span>
      ),
    },
    {
      id: 'handling',
      header: UNPOSTED_TEXT.columnHandling,
      width: '15%',
      cell: (row) => (
        <span className="flex flex-col items-start gap-[4px] text-[11px]">
          <span
            className={`rounded-full px-[8px] py-[2px] font-semibold ${
              row.trangThaiXuLy === 'KhongTheXuLy'
                ? 'bg-danger-soft text-danger-strong'
                : 'bg-warning-soft text-warning'
            }`}
          >
            {UNPOSTED_TEXT.handling[row.trangThaiXuLy]}
          </span>
          {row.lyDoKhongTheXuLy !== null && (
            <span className="text-gray-600">{row.lyDoKhongTheXuLy}</span>
          )}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      width: '18%',
      cell: (row) => (
        <span className="flex flex-wrap gap-[6px]">
          <button
            type="button"
            aria-label={UNPOSTED_TEXT.creditOf(row.benhNhan.hoTen)}
            onClick={() => setOpen({ topup: row, mode: 'credit' })}
            className="rounded-[8px] bg-brand-strong px-[10px] py-[5px] text-[12px] font-semibold text-white"
          >
            {UNPOSTED_TEXT.credit}
          </button>
          <button
            type="button"
            aria-label={UNPOSTED_TEXT.unprocessableOf(row.benhNhan.hoTen)}
            onClick={() => setOpen({ topup: row, mode: 'unprocessable' })}
            className="rounded-[8px] bg-warning px-[10px] py-[5px] text-[12px] font-semibold text-white"
          >
            {UNPOSTED_TEXT.unprocessable}
          </button>
        </span>
      ),
    },
  ];

  const [info0, strong1, info2, strong3, info4, strong5, info6] =
    UNPOSTED_TEXT.infoParts;

  return (
    <div className="flex flex-col gap-[16px]">
      <p className="flex gap-[8px] rounded-[12px] border border-sky-200 bg-sky-50 px-[16px] py-[12px] text-[13px] leading-[20px] text-sky-800">
        <Info aria-hidden="true" className="mt-[3px] size-[14px] shrink-0" />
        <span>
          {info0}
          <strong>{strong1}</strong>
          {info2}
          <strong>{strong3}</strong>
          {info4}
          <strong>{strong5}</strong>
          {info6}
        </span>
      </p>

      {notice !== null && (
        <p
          role={notice.tone === 'success' ? 'status' : 'alert'}
          className={`rounded-[8px] border px-[12px] py-[8px] text-[13px] ${NOTICE_TONE[notice.tone]}`}
        >
          {notice.message}
        </p>
      )}

      {state.status === 'loading' && (
        <LoadingState message={UNPOSTED_TEXT.loading} />
      )}
      {state.status === 'error' && (
        <ErrorState error={state.error} onRetry={retry} />
      )}
      {state.status === 'ready' && (
        <AdminTable
          label={UNPOSTED_TEXT.tableLabel}
          columns={columns}
          rows={state.data}
          getRowKey={(row) => row.maGiaoDich}
          page={1}
          pageSize={LIST_LIMIT}
          total={state.data.length}
          onPageChange={() => {}}
          emptyMessage={UNPOSTED_TEXT.empty}
        />
      )}

      <AdminDetailPanel
        open={open !== null}
        title={
          open?.mode === 'unprocessable'
            ? UNPOSTED_TEXT.unprocessableTitle
            : UNPOSTED_TEXT.creditTitle
        }
        onClose={() => setOpen(null)}
      >
        {open !== null && (
          <UnpostedTopupAction
            key={`${open.topup.maGiaoDich}-${open.mode}`}
            topup={open.topup}
            mode={open.mode}
            onSettled={settle}
            onCancel={() => setOpen(null)}
          />
        )}
      </AdminDetailPanel>
    </div>
  );
}
