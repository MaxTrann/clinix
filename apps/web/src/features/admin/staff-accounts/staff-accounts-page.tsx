import { Info, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRemote } from '../../../shared/hooks/use-remote';
import { LoadingState } from '../../../shared/ui/loading-state';
import { AccountLoadError } from '../account-common/account-load-error';
import { AccountLockDialog } from '../account-common/account-lock-dialog';
import { describeActionFailure } from '../account-common/account-errors';
import { getAccount } from '../account-common/account-service';
import { AccountTabs } from '../account-common/account-tabs';
import { AdminDetailPanel } from '../components/admin-detail-panel';
import { AdminTable, type AdminTableColumn } from '../components/admin-table';
import { useAdminScope } from '../use-admin-scope';
import { useDebouncedValue } from '../patient-accounts/use-patient-accounts';
import { StaffCreateDialog } from './staff-create-dialog';
import { StaffDetailBody } from './staff-detail-panel';
import { describeResendFailure, describeResendOutcome } from './staff-errors';
import { StaffFiltersBar, type StaffStatusFilter } from './staff-filters';
import { StaffNoticeBox } from './staff-notice-box';
import {
  formatBranch,
  formatCreatedDate,
  formatRole,
  type RoleFilter,
} from './staff-rules';
import { lockStaff, resendActivation, unlockStaff } from './staff-service';
import { StaffStatusBadge } from './staff-status-badge';
import type { DoctorDependents, StaffAccount } from './staff-types';
import { useStaffAccounts } from './use-staff-accounts';
import { useStaffAction } from './use-staff-action';

// Màn "Nhân sự" (admin F8; PLAN NS, TK; TK-01, TK-02, TK-10 đến 26, TK-40 đến 47; Figma 522:2, 527:2, 530:2, 531:2, 625:2 chỉ là bản phác thảo).
// Route bọc `AdminScopeGuard policy="Any"`: Admin Chi nhánh vào được nhưng chỉ thấy Bác sĩ và Lễ tân của chi nhánh mình (Q27, L9), không có bộ lọc chi nhánh.
// Danh sách và chi tiết luôn lấy từ API; sau mỗi hành động ghi, chi tiết và danh sách được TẢI LẠI (không đổi trạng thái cục bộ).
// Dữ liệu chi tiết, thông báo và hộp xác nhận nằm ở trang này; panel chỉ vẽ, và tạm ẩn khi hộp xác nhận mở (xem `staff-detail-panel.tsx`).
// Nút "Tạo tài khoản nhân sự" mở hộp tạo (PR2): hộp tạo và panel chi tiết không bao giờ cùng mở; "Xem chi tiết" ở hộp đóng hộp rồi mới mở panel.

const SEARCH_DELAY_MS = 250;

const DOCTOR_LOCK_NOTE =
  'Bác sĩ còn lịch hẹn và ca làm việc sắp tới sẽ cần được bố trí lại; hệ thống không tự huỷ hay đổi lịch.';

export function StaffAccountsPage() {
  const me = useAdminScope();
  const scope = me.phamVi;
  const ownBranchName = me.phamVi === 'ChiNhanh' ? me.chiNhanh.ten : null;
  const isSystem = scope === 'ToanHeThong';

  const [search, setSearch] = useState('');
  const [role, setRole] = useState<RoleFilter>('all');
  const [status, setStatus] = useState<StaffStatusFilter>('all');
  const [branch, setBranch] = useState('all');
  const [page, setPage] = useState(1);
  const q = useDebouncedValue(search.trim(), SEARCH_DELAY_MS);
  const hasFilter =
    q !== '' || role !== 'all' || status !== 'all' || branch !== 'all';

  const list = useStaffAccounts(
    scope,
    {
      q,
      role,
      trangThai: status === 'all' ? undefined : status,
      chiNhanhId: isSystem && branch !== 'all' ? branch : undefined,
    },
    page,
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmLock, setConfirmLock] = useState(false);
  const [dependents, setDependents] = useState<DoctorDependents | null>(null);
  const detail = useRemote<StaffAccount | null>(
    (signal) =>
      selectedId === null
        ? Promise.resolve(null)
        : getAccount<StaffAccount>(selectedId, signal),
    [selectedId],
  );
  const reloadList = list.retry;
  const reloadDetail = detail.retry;

  const { pending, notice, run, clearNotice } = useStaffAction({
    onSettled: useCallback(
      ({ notFound }: { notFound: boolean }) => {
        setConfirmLock(false);
        // 404: tài khoản không còn (hoặc ra khỏi phạm vi): đóng chi tiết, chỉ tải lại danh sách. Còn lại: tải lại CẢ HAI từ API.
        if (notFound) setSelectedId(null);
        else reloadDetail();
        reloadList();
      },
      [reloadDetail, reloadList],
    ),
  });

  // Hành động ghi làm danh sách tải lại và BẢNG ĐƯỢC DỰNG LẠI, nên nút đã mở panel là phần tử cũ đã bị gỡ; hook focus dùng chung của khung Admin trả focus về
  // phần tử đã gỡ và focus rơi về BODY (bài học F9 D4). Khi panel đã đóng, danh sách sẵn sàng và focus đang ở BODY thì trang focus nút hàng cùng mã tài khoản;
  // nút không còn (bị lọc loại, 404) thì focus ô tìm, điều khiển đầu tiên của vùng danh sách. Focus đã ở một điều khiển có nghĩa thì KHÔNG giành lại.
  const returnFocusId = useRef<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listStatus = list.state.status;
  useEffect(() => {
    const id = returnFocusId.current;
    if (
      id === null ||
      selectedId !== null ||
      confirmLock ||
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
  }, [selectedId, confirmLock, listStatus]);

  function openDetail(id: string) {
    clearNotice();
    setDependents(null);
    returnFocusId.current = id;
    setSelectedId(id);
  }

  function closeDetail() {
    clearNotice();
    setDependents(null);
    setSelectedId(null);
  }

  const account = detail.state.status === 'ready' ? detail.state.data : null;

  function updateFilter(apply: () => void) {
    apply();
    setPage(1);
  }

  function lock(target: StaffAccount) {
    void run(async () => {
      setDependents(null);
      setDependents(await lockStaff(target.taiKhoanId));
      return { kind: 'success', text: 'Đã khoá tài khoản.' };
    }, describeActionFailure);
  }

  function unlock(target: StaffAccount) {
    void run(async () => {
      setDependents(null);
      await unlockStaff(target.taiKhoanId);
      return { kind: 'success', text: 'Đã mở khoá tài khoản.' };
    }, describeActionFailure);
  }

  function resend(target: StaffAccount) {
    void run(async () => {
      setDependents(null);
      return describeResendOutcome(await resendActivation(target.taiKhoanId));
    }, describeResendFailure);
  }

  // KHÔNG đặt `width` cho cột: `AdminTable` dùng chung chuyển sang `table-layout: fixed` và không có `min-width` khi có cột đặt `width`, nên cột bị ép (F9 D3,
  // TECH_DEBT 202, 209). Không có `width` thì bảng dùng bố cục tự động: huy hiệu và nút một dòng, họ tên và email có chiều rộng tối thiểu và ngắt chữ,
  // màn hẹp thì bảng cuộn ngang trong khung riêng.
  const columns: AdminTableColumn<StaffAccount>[] = [
    {
      id: 'hoTen',
      header: 'Họ tên',
      cell: (row) => (
        <>
          <span className="block min-w-[7rem] font-medium break-words">
            {row.hoTen}
          </span>
          <span className="block min-w-[9rem] text-xs break-all text-gray-500">
            {row.email}
          </span>
          <span className="block text-xs whitespace-nowrap text-gray-500">
            {row.soDienThoai}
          </span>
        </>
      ),
    },
    {
      id: 'vaiTro',
      header: 'Vai trò',
      cell: (row) => (
        // `min-w-[3.4rem]`: cột Vai trò không hẹp dưới 80 px (chữ 3,4 rem = 51 px cộng đệm 30 px); để tự nhiên đo được 68 px (T3, TRACKING admin 9A.20 mục 10)
        <span className="block min-w-[3.4rem] whitespace-nowrap">
          {formatRole(row.loaiTaiKhoan)}
        </span>
      ),
    },
    {
      id: 'chiNhanh',
      header: 'Chi nhánh',
      cell: (row) => (
        <span className="block min-w-[6rem] break-words">
          {formatBranch(row)}
        </span>
      ),
    },
    {
      id: 'trangThai',
      header: 'Trạng thái',
      cell: (row) => <StaffStatusBadge status={row.trangThai} />,
    },
    {
      id: 'ngayTao',
      header: 'Ngày tạo',
      cell: (row) => (
        <span className="whitespace-nowrap">
          {formatCreatedDate(row.thoiDiemTao)}
        </span>
      ),
    },
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
      aria-labelledby="staff-accounts-title"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1
            id="staff-accounts-title"
            className="text-[22.5px] leading-[30px] font-bold text-gray-900"
          >
            Nhân sự
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {list.state.status === 'ready'
              ? `${list.state.data.total} nhân sự`
              : 'Xem tài khoản của nhân sự.'}
          </p>
        </div>
        <button
          type="button"
          className="inline-flex min-h-[35px] flex-none items-center gap-1.5 rounded-[9.375px] bg-brand-strong px-3 py-1.5 text-sm font-medium whitespace-nowrap text-white"
          onClick={() => setCreating(true)}
        >
          <Plus size={15} aria-hidden="true" />
          Tạo tài khoản nhân sự
        </button>
      </header>

      <AccountTabs current="staff" />

      {!isSystem && (
        <div
          role="note"
          className="flex items-start gap-2 rounded-xl border border-warning-line bg-warning-soft px-3 py-2 text-xs text-warning"
        >
          <Info size={13} aria-hidden="true" className="mt-0.5 flex-none" />
          Bạn chỉ thấy Bác sĩ và Lễ tân của chi nhánh mình.
        </div>
      )}

      <StaffFiltersBar
        scope={scope}
        ownBranchName={ownBranchName}
        search={search}
        role={role}
        status={status}
        branch={branch}
        searchInputRef={searchInputRef}
        onSearch={(value) => updateFilter(() => setSearch(value))}
        onRole={(value) => updateFilter(() => setRole(value))}
        onStatus={(value) => updateFilter(() => setStatus(value))}
        onBranch={(value) => updateFilter(() => setBranch(value))}
      />

      {/* 404 khi đang thao tác: panel đã đóng nên thông báo hiện ở đây */}
      {selectedId === null && notice !== null && (
        <StaffNoticeBox notice={notice} />
      )}

      {list.state.status === 'loading' && (
        <LoadingState message="Đang tải danh sách nhân sự…" />
      )}
      {list.state.status === 'error' && (
        <AccountLoadError error={list.state.error} onRetry={list.retry} />
      )}
      {list.state.status === 'ready' && (
        <AdminTable
          label="Danh sách nhân sự"
          columns={columns}
          rows={list.state.data.items}
          getRowKey={(row) => row.taiKhoanId}
          page={list.state.data.page}
          pageSize={list.state.data.pageSize}
          total={list.state.data.total}
          onPageChange={setPage}
          emptyMessage={
            hasFilter
              ? 'Không tìm thấy nhân sự phù hợp.'
              : 'Chưa có nhân sự nào.'
          }
        />
      )}

      <AdminDetailPanel
        open={selectedId !== null && !confirmLock}
        title={account?.hoTen ?? 'Chi tiết nhân sự'}
        onClose={closeDetail}
      >
        <StaffDetailBody
          scope={scope}
          state={detail.state}
          notice={notice}
          dependents={dependents}
          pending={pending}
          onRetry={detail.retry}
          onLock={() => setConfirmLock(true)}
          onUnlock={() => account !== null && unlock(account)}
          onResend={() => account !== null && resend(account)}
        />
      </AdminDetailPanel>

      {creating && (
        <StaffCreateDialog
          me={me}
          onClose={() => setCreating(false)}
          onCreated={reloadList}
          onViewDetail={(id) => {
            setCreating(false);
            openDetail(id);
          }}
        />
      )}

      {account !== null && confirmLock && (
        <AccountLockDialog
          open
          hoTen={account.hoTen}
          role={account.loaiTaiKhoan}
          pending={pending}
          note={account.loaiTaiKhoan === 'BacSi' ? DOCTOR_LOCK_NOTE : undefined}
          onConfirm={() => lock(account)}
          onCancel={() => {
            if (!pending) setConfirmLock(false);
          }}
        />
      )}
    </section>
  );
}
