import { Info } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRemote } from '../../../shared/hooks/use-remote';
import { LoadingState } from '../../../shared/ui/loading-state';
import { AccountLoadError } from '../account-common/account-load-error';
import { AccountLockDialog } from '../account-common/account-lock-dialog';
import { AccountTabs } from '../account-common/account-tabs';
import {
  formatNoShowLock,
  formatStatus,
} from '../account-common/account-format';
import {
  getAccount,
  lockAccount,
  unlockAccount,
  unlockNoShow,
} from '../account-common/account-service';
import type {
  AccountStatus,
  PatientAccount,
} from '../account-common/account-types';
import { useAccountAction } from '../account-common/use-account-action';
import { AdminDetailPanel } from '../components/admin-detail-panel';
import { AdminTable, type AdminTableColumn } from '../components/admin-table';
import { useAdminScope } from '../use-admin-scope';
import { NoShowUnlockDialog } from './no-show-unlock-dialog';
import { PatientDetailBody } from './patient-detail-panel';
import {
  PatientFiltersBar,
  type NoShowFilter,
  type StatusFilter,
} from './patient-filters';
import { useDebouncedValue, usePatientAccounts } from './use-patient-accounts';

// Màn "Tài khoản bệnh nhân" (admin F9; PLAN TK b2 đến b7, A1; TK-26, TK-34; Figma 532:2 đến 534:2 chỉ là bản phác thảo).
// Route bọc `AdminScopeGuard policy="Any"`: Admin Chi nhánh vào xem được nhưng KHÔNG có bộ lọc no-show, bộ lọc chi nhánh, cột "Đặt lịch" hay nút hành động nào.
// Danh sách và chi tiết luôn lấy từ API; sau mỗi hành động ghi, chi tiết và danh sách được TẢI LẠI (không đổi trạng thái cục bộ).
// Dữ liệu chi tiết, thông báo và hộp xác nhận nằm ở trang này; panel chỉ vẽ, và tạm ẩn khi hộp xác nhận mở (xem `patient-detail-panel.tsx`).

const SEARCH_DELAY_MS = 250;

type Confirm = 'lock' | 'no-show' | null;

const STATUS_BADGE_BASE =
  'inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap';

function StatusBadge({ status }: { status: AccountStatus }) {
  const tone =
    status === 'DangHoatDong'
      ? 'bg-success-soft text-success'
      : 'bg-gray-100 text-gray-600';
  return (
    <span className={`${STATUS_BADGE_BASE} ${tone}`}>
      {formatStatus(status)}
    </span>
  );
}

function NoShowBadge({ account }: { account: PatientAccount }) {
  const locked = account.khoaDatLichDoNoShow === true;
  const tone = locked
    ? 'bg-warning-soft text-warning'
    : 'bg-gray-100 text-gray-600';
  const text =
    account.khoaDatLichDoNoShow === true
      ? 'Bị khoá do no-show'
      : account.khoaDatLichDoNoShow === false
        ? 'Bình thường'
        : formatNoShowLock(null);
  return <span className={`${STATUS_BADGE_BASE} ${tone}`}>{text}</span>;
}

export function PatientAccountsPage() {
  const scope = useAdminScope().phamVi;
  const isSystem = scope === 'ToanHeThong';

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [noShow, setNoShow] = useState<NoShowFilter>('all');
  const [branch, setBranch] = useState('all');
  const [page, setPage] = useState(1);
  const q = useDebouncedValue(search.trim(), SEARCH_DELAY_MS);
  const hasFilter =
    q !== '' || status !== 'all' || noShow !== 'all' || branch !== 'all';

  const list = usePatientAccounts(
    scope,
    {
      q,
      trangThai: status === 'all' ? undefined : status,
      khoaNoShow: noShow === 'all' ? undefined : noShow === 'true',
      chiNhanhId: branch === 'all' ? undefined : branch,
    },
    page,
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const detail = useRemote<PatientAccount | null>(
    (signal) =>
      selectedId === null
        ? Promise.resolve(null)
        : getAccount<PatientAccount>(selectedId, signal),
    [selectedId],
  );
  const reloadList = list.retry;
  const reloadDetail = detail.retry;

  const { pending, notice, run, clearNotice } = useAccountAction({
    onSettled: useCallback(
      ({ notFound }: { notFound: boolean }) => {
        setConfirm(null);
        // 404: tài khoản không còn (hoặc ra khỏi phạm vi): đóng chi tiết, chỉ tải lại danh sách. Còn lại: tải lại CẢ HAI từ API.
        if (notFound) setSelectedId(null);
        else reloadDetail();
        reloadList();
      },
      [reloadDetail, reloadList],
    ),
  });

  // D4: `id` của nút hàng đã mở panel. Hành động ghi làm danh sách tải lại và BẢNG ĐƯỢC DỰNG LẠI, nên nút đã mở panel là phần tử cũ đã bị gỡ; hook focus
  // dùng chung của F1 (không sửa ở đây) trả focus về phần tử đã gỡ và focus rơi về BODY (đo ở BR-8). Khi panel đã đóng, danh sách sẵn sàng và focus đang ở
  // BODY thì trang focus nút hàng cùng `id`; nút không còn (bị lọc loại, đã xoá, 404) thì focus ô tìm, điều khiển đầu tiên của vùng danh sách (đã chọn ô tìm
  // thay vì tiêu đề trang vì tiêu đề không phải điều khiển, muốn focus được phải thêm `tabIndex` và phải giấu viền focus: FG-05). Nếu focus đã ở một điều
  // khiển có nghĩa thì KHÔNG giành lại.
  const returnFocusId = useRef<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listStatus = list.state.status;
  useEffect(() => {
    const id = returnFocusId.current;
    if (
      id === null ||
      selectedId !== null ||
      confirm !== null ||
      listStatus !== 'ready'
    )
      return;
    returnFocusId.current = null;
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    const row = Array.from(
      document.querySelectorAll<HTMLElement>('[data-account-id]'),
    ).find((element) => element.dataset.accountId === id);
    (row ?? searchInputRef.current)?.focus();
  }, [selectedId, confirm, listStatus]);

  function openDetail(id: string) {
    clearNotice();
    returnFocusId.current = id;
    setSelectedId(id);
  }

  function closeDetail() {
    clearNotice();
    setSelectedId(null);
  }

  const account = detail.state.status === 'ready' ? detail.state.data : null;

  function updateFilter(apply: () => void) {
    apply();
    setPage(1);
  }

  // D3: KHÔNG đặt `width` cho cột. `AdminTable` dùng chung chuyển sang `table-layout: fixed` và không có `min-width` khi có cột đặt `width`, nên cột bị ép
  // (đo: nút tràn ô 4 px ở 1046 px, cột còn 34 đến 62 px ở 375 px). Không có `width` thì bảng dùng bố cục tự động: huy hiệu và nút một dòng (`whitespace-nowrap`),
  // họ tên và email có chiều rộng tối thiểu và ngắt chữ, màn hẹp thì bảng cuộn ngang trong khung riêng (`overflow-x: auto` của `AdminTable`).
  const columns: AdminTableColumn<PatientAccount>[] = [
    {
      id: 'hoTen',
      header: 'Họ tên',
      cell: (row) => (
        <span className="block min-w-[7rem] break-words">{row.hoTen}</span>
      ),
    },
    {
      id: 'email',
      header: 'Email',
      cell: (row) => (
        <span className="block min-w-[9rem] break-all">{row.email}</span>
      ),
    },
    {
      id: 'soDienThoai',
      header: 'Số điện thoại',
      cell: (row) => (
        <span className="whitespace-nowrap">{row.soDienThoai}</span>
      ),
    },
    {
      id: 'trangThai',
      header: 'Trạng thái',
      cell: (row) => <StatusBadge status={row.trangThai} />,
    },
    ...(isSystem
      ? [
          {
            id: 'datLich',
            header: 'Đặt lịch',
            cell: (row: PatientAccount) => <NoShowBadge account={row} />,
          },
        ]
      : []),
    {
      id: 'thaoTac',
      header: 'Thao tác',
      cell: (row) => (
        <button
          type="button"
          className="rounded-[9.375px] border border-gray-300 bg-white px-3 py-1 text-xs font-medium whitespace-nowrap text-gray-700"
          aria-label={`Xem chi tiết ${row.hoTen}`}
          data-account-id={row.taiKhoanId}
          onClick={() => openDetail(row.taiKhoanId)}
        >
          Xem chi tiết
        </button>
      ),
    },
  ];

  return (
    <section
      className="flex min-w-0 flex-col gap-4"
      aria-labelledby="patient-accounts-title"
    >
      <header>
        <h1
          id="patient-accounts-title"
          className="text-[22.5px] leading-[30px] font-bold text-gray-900"
        >
          Tài khoản bệnh nhân
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {list.state.status === 'ready'
            ? `${list.state.data.total} bệnh nhân`
            : 'Xem tài khoản của bệnh nhân.'}
        </p>
      </header>

      <AccountTabs current="patients" />

      {!isSystem && (
        <div
          role="note"
          className="flex items-start gap-2 rounded-xl border border-warning-line bg-warning-soft px-3 py-2 text-xs text-warning"
        >
          <Info size={13} aria-hidden="true" className="mt-0.5 flex-none" />
          Bạn chỉ có quyền xem tài khoản bệnh nhân. Chỉ Admin toàn hệ thống mới
          khoá hoặc mở khoá được.
        </div>
      )}

      <PatientFiltersBar
        scope={scope}
        search={search}
        status={status}
        noShow={noShow}
        branch={branch}
        searchInputRef={searchInputRef}
        onSearch={(value) => updateFilter(() => setSearch(value))}
        onStatus={(value) => updateFilter(() => setStatus(value))}
        onNoShow={(value) => updateFilter(() => setNoShow(value))}
        onBranch={(value) => updateFilter(() => setBranch(value))}
      />

      {/* 404 khi đang thao tác: panel đã đóng nên thông báo hiện ở đây */}
      {selectedId === null && notice !== null && (
        <p
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className="rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong"
        >
          {notice.text}
        </p>
      )}

      {list.state.status === 'loading' && (
        <LoadingState message="Đang tải danh sách bệnh nhân…" />
      )}
      {list.state.status === 'error' && (
        <AccountLoadError error={list.state.error} onRetry={list.retry} />
      )}
      {list.state.status === 'ready' && (
        <AdminTable
          label="Danh sách tài khoản bệnh nhân"
          columns={columns}
          rows={list.state.data.items}
          getRowKey={(row) => row.taiKhoanId}
          page={list.state.data.page}
          pageSize={list.state.data.pageSize}
          total={list.state.data.total}
          onPageChange={setPage}
          emptyMessage={
            hasFilter
              ? 'Không tìm thấy bệnh nhân phù hợp.'
              : 'Chưa có bệnh nhân nào.'
          }
        />
      )}

      <AdminDetailPanel
        open={selectedId !== null && confirm === null}
        title={account?.hoTen ?? 'Chi tiết tài khoản bệnh nhân'}
        onClose={closeDetail}
      >
        <PatientDetailBody
          scope={scope}
          state={detail.state}
          notice={notice}
          pending={pending}
          onRetry={detail.retry}
          onLock={() => setConfirm('lock')}
          onUnlock={() =>
            account !== null &&
            void run(
              () => unlockAccount(account.taiKhoanId),
              'Đã mở khoá tài khoản.',
            )
          }
          onUnlockNoShow={() => setConfirm('no-show')}
        />
      </AdminDetailPanel>

      {account !== null && confirm === 'lock' && (
        <AccountLockDialog
          open
          hoTen={account.hoTen}
          role={account.loaiTaiKhoan}
          pending={pending}
          onConfirm={() =>
            void run(
              () => lockAccount(account.taiKhoanId),
              'Đã khoá tài khoản.',
            )
          }
          onCancel={() => {
            if (!pending) setConfirm(null);
          }}
        />
      )}

      {account !== null && confirm === 'no-show' && (
        <NoShowUnlockDialog
          hoTen={account.hoTen}
          soLanNoShow={account.soLanNoShow}
          pending={pending}
          onConfirm={() =>
            void run(
              () => unlockNoShow(account.taiKhoanId),
              'Đã mở khoá no-show.',
            )
          }
          onCancel={() => {
            if (!pending) setConfirm(null);
          }}
        />
      )}
    </section>
  );
}
