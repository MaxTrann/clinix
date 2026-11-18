import { useState } from 'react';
import { ApiError } from '../../../shared/api/errors';
import { useRemote } from '../../../shared/hooks/use-remote';
import { LoadingState } from '../../../shared/ui/loading-state';
import { AdminDetailPanel } from '../components/admin-detail-panel';
import { AdminTable, type AdminTableColumn } from '../components/admin-table';
import {
  formatChangeValue,
  formatThoiDiem,
  labelOfKey,
  summarizeChanges,
} from './history-format';
import { LoadError } from './load-error';
import { getSystemConfigHistory } from './system-config-service';
import type { HistoryItem, HistoryPage } from './system-config-types';

// Tab "Lịch sử thay đổi" (Figma 578:2, PLAN CH-19): bảng phân trang các lần lưu cấu hình, mới nhất trước, và panel xem chi tiết một lần đổi.
// Chỉ được dựng khi tab đang mở, nên mỗi lần mở lại là một lần tải mới (có cả lần lưu vừa xong).
// `lyDo` và `nguoiThucHien` là chữ tự do của người dùng: in bằng JSX thường (React tự thoát ký tự), KHÔNG dùng `dangerouslySetInnerHTML`.

function isPageOutOfRange(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.maLoi === 'DU_LIEU_KHONG_HOP_LE' &&
    (error.loi ?? []).some((item) => item.ma === 'TRANG_KHONG_HOP_LE')
  );
}

// Trang vượt quá số trang hiện có (dữ liệu vừa đổi): về trang 1 thay vì báo lỗi
async function loadPage(
  page: number,
  signal: AbortSignal,
): Promise<HistoryPage> {
  try {
    return await getSystemConfigHistory(page, signal);
  } catch (error) {
    if (page > 1 && isPageOutOfRange(error))
      return getSystemConfigHistory(1, signal);
    throw error;
  }
}

const detailButton =
  'rounded-[9.375px] border border-gray-300 bg-white px-3 py-1 text-xs font-medium whitespace-nowrap text-gray-700';

export function HistoryTab() {
  const [requestedPage, setRequestedPage] = useState(1);
  const [selected, setSelected] = useState<HistoryItem | null>(null);
  const { state, retry } = useRemote(
    (signal) => loadPage(requestedPage, signal),
    [requestedPage],
  );

  if (state.status === 'loading')
    return <LoadingState message="Đang tải lịch sử thay đổi…" />;
  if (state.status === 'error')
    return <LoadError error={state.error} onRetry={retry} />;

  const columns: AdminTableColumn<HistoryItem>[] = [
    {
      id: 'thoiDiem',
      header: 'Thời điểm',
      width: '17%',
      cell: (row) => formatThoiDiem(row.thoiDiem),
    },
    {
      id: 'nguoiThucHien',
      header: 'Người thực hiện',
      width: '17%',
      cell: (row) => row.nguoiThucHien,
    },
    {
      id: 'lyDo',
      header: 'Lý do',
      cell: (row) => (
        <span className="line-clamp-2 break-words whitespace-pre-wrap">
          {row.lyDo === '' ? '—' : row.lyDo}
        </span>
      ),
    },
    {
      id: 'thayDoi',
      header: 'Thay đổi',
      width: '26%',
      cell: (row) => summarizeChanges(row.thayDoi),
    },
    {
      id: 'chiTiet',
      header: 'Chi tiết',
      width: '12%',
      cell: (row) => (
        <button
          type="button"
          className={detailButton}
          aria-label={`Xem chi tiết thay đổi lúc ${formatThoiDiem(row.thoiDiem)}`}
          onClick={() => setSelected(row)}
        >
          Chi tiết
        </button>
      ),
    },
  ];

  return (
    <>
      <AdminTable
        label="Lịch sử thay đổi cấu hình"
        columns={columns}
        rows={state.data.items}
        getRowKey={(row) => row.id}
        page={state.data.page}
        pageSize={state.data.pageSize}
        total={state.data.total}
        onPageChange={setRequestedPage}
        emptyMessage="Chưa có thay đổi nào."
      />
      <AdminDetailPanel
        open={selected !== null}
        title="Chi tiết thay đổi cấu hình"
        onClose={() => setSelected(null)}
      >
        {selected !== null && <HistoryDetail item={selected} />}
      </AdminDetailPanel>
    </>
  );
}

function HistoryDetail({ item }: { item: HistoryItem }) {
  return (
    <div className="flex flex-col gap-4 text-sm text-gray-700">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        <dt className="text-gray-500">Người thực hiện</dt>
        <dd className="break-words">{item.nguoiThucHien}</dd>
        <dt className="text-gray-500">Thời điểm</dt>
        <dd>{formatThoiDiem(item.thoiDiem)}</dd>
        <dt className="text-gray-500">Lý do</dt>
        <dd className="break-words whitespace-pre-wrap">
          {item.lyDo === '' ? '—' : item.lyDo}
        </dd>
      </dl>
      <table aria-label="Các tham số đã đổi" className="w-full text-left">
        <thead>
          <tr className="border-b border-gray-200 text-xs text-gray-500">
            <th scope="col" className="py-2 pr-3 font-medium">
              Tham số
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Trước
            </th>
            <th scope="col" className="py-2 font-medium">
              Sau
            </th>
          </tr>
        </thead>
        <tbody>
          {item.thayDoi.map((change) => (
            <tr key={change.khoa} className="border-b border-gray-100">
              <td className="py-2 pr-3">{labelOfKey(change.khoa)}</td>
              <td className="py-2 pr-3 text-gray-500">
                {formatChangeValue(change.khoa, change.truoc)}
              </td>
              <td className="py-2 font-medium text-gray-900">
                {formatChangeValue(change.khoa, change.sau)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
