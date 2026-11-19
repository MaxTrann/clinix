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
import type { WithdrawalStatus } from '../api/wallet-types';
import { BADGE_TONE } from '../patient/tone-classes';
import { withdrawalStatusLabel } from '../patient/wallet-labels';
import {
  getAdminWithdrawals,
  type AdminWithdrawalItem,
  type WithdrawalCounts,
} from './admin-withdrawal-api';
import { formatDateTime } from './finance-format';
import { FINANCE_TEXT } from './finance-text';
import { WithdrawalDetail } from './withdrawal-detail';

// Tab "Yêu cầu rút tiền" (payment F7; Figma `549:2`): bốn bộ lọc kèm số đếm của máy chủ, bảng phân trang (`AdminTable` của admin), ngăn chi tiết (`AdminDetailPanel`).
// Bộ lọc, trang và yêu cầu đang mở là state của tab, KHÔNG đưa vào URL hay kho trình duyệt (tên và số tiền của Bệnh nhân). Xử lý xong ở ngăn ⇒ tải lại danh sách và số đếm.

const PAGE_SIZE = 20;

const FILTERS: {
  value: WithdrawalStatus | null;
  label: string;
  count: keyof WithdrawalCounts;
}[] = [
  { value: null, label: FINANCE_TEXT.filterAll, count: 'tatCa' },
  { value: 'ChoDuyet', label: 'Chờ duyệt', count: 'choDuyet' },
  { value: 'DaDuyet', label: 'Đã duyệt', count: 'daDuyet' },
  { value: 'TuChoi', label: 'Từ chối', count: 'tuChoi' },
];

export function WithdrawalTab() {
  const [status, setStatus] = useState<WithdrawalStatus | null>(null);
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selected, setSelected] = useState<AdminWithdrawalItem | null>(null);
  const { state, retry } = useRemote(
    (signal) => getAdminWithdrawals({ trangThai: status, trang: page }, signal),
    [status, page, refreshKey],
  );
  // Số đếm giữ lại từ lần tải trước khi đang tải lại, để bộ lọc không nhảy về 0
  const [counts, setCounts] = useState<WithdrawalCounts | null>(null);
  if (state.status === 'ready' && state.data.demTheoTrangThai !== counts)
    setCounts(state.data.demTheoTrangThai);

  const columns: AdminTableColumn<AdminWithdrawalItem>[] = [
    {
      id: 'patient',
      header: FINANCE_TEXT.columnPatient,
      width: '20%',
      cell: (row) => row.benhNhan.hoTen,
    },
    {
      id: 'amount',
      header: FINANCE_TEXT.columnAmount,
      width: '15%',
      cell: (row) => <strong>{formatVnd(row.soTien)}</strong>,
    },
    {
      id: 'sent',
      header: FINANCE_TEXT.columnSentAt,
      width: '19%',
      cell: (row) => formatDateTime(row.thoiDiemYeuCau),
    },
    {
      id: 'handled',
      header: FINANCE_TEXT.columnHandledAt,
      width: '19%',
      cell: (row) =>
        row.thoiDiemXuLy === null ? '—' : formatDateTime(row.thoiDiemXuLy),
    },
    {
      id: 'status',
      header: FINANCE_TEXT.columnStatus,
      width: '15%',
      cell: (row) => {
        const label = withdrawalStatusLabel(row.trangThai);
        return (
          <span
            className={`rounded-full px-[8px] py-[2px] text-[11px] font-semibold ${BADGE_TONE[label.tone]}`}
          >
            {label.label}
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      width: '12%',
      cell: (row) => (
        <button
          type="button"
          onClick={() => setSelected(row)}
          aria-label={FINANCE_TEXT.detailsOf(row.benhNhan.hoTen)}
          className="text-[13px] font-semibold text-[#0e8fb9]"
        >
          {FINANCE_TEXT.details}
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-[16px]">
      <div
        role="group"
        aria-label={FINANCE_TEXT.filterLabel}
        className="flex flex-wrap gap-[4px] border-b border-gray-200"
      >
        {FILTERS.map((filter) => {
          const active = filter.value === status;
          return (
            <button
              key={filter.label}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setStatus(filter.value);
                setPage(1);
              }}
              className={`-mb-px flex items-center gap-[6px] border-b-2 px-[6px] py-[8px] text-[13px] ${
                active
                  ? 'border-[#0e8fb9] font-semibold text-[#0e8fb9]'
                  : 'border-transparent text-gray-600'
              }`}
            >
              {filter.label}
              {counts !== null && (
                <span className="rounded-full bg-gray-100 px-[6px] text-[11px] text-gray-500">
                  {counts[filter.count]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {state.status === 'loading' && (
        <LoadingState message={FINANCE_TEXT.listLoading} />
      )}
      {state.status === 'error' && (
        <ErrorState error={state.error} onRetry={retry} />
      )}
      {state.status === 'ready' && (
        <AdminTable
          label={FINANCE_TEXT.tableLabel}
          columns={columns}
          rows={state.data.items}
          getRowKey={(row) => row.maYeuCau}
          page={page}
          pageSize={PAGE_SIZE}
          total={state.data.total}
          onPageChange={setPage}
          emptyMessage={
            status === null
              ? FINANCE_TEXT.listEmpty
              : FINANCE_TEXT.listEmptyFiltered
          }
        />
      )}

      <AdminDetailPanel
        open={selected !== null}
        title={FINANCE_TEXT.detailTitle}
        onClose={() => setSelected(null)}
      >
        {selected !== null && (
          <WithdrawalDetail
            key={selected.maYeuCau}
            maYeuCau={selected.maYeuCau}
            onChanged={() => setRefreshKey((n) => n + 1)}
          />
        )}
      </AdminDetailPanel>
    </div>
  );
}
