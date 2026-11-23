import { Eye, Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useRemote } from '../../../shared/hooks/use-remote';
import { ROLE_HOME_PATHS } from '../../auth/roles';
import { formatVnd } from '../../../shared/money/format-vnd';
import { LoadingState } from '../../../shared/ui/loading-state';
import { AccountLoadError } from '../account-common/account-load-error';
import { AdminDetailPanel } from '../components/admin-detail-panel';
import { AdminTable, type AdminTableColumn } from '../components/admin-table';
import { useDebouncedValue } from '../patient-accounts/use-patient-accounts';
import { useAdminScope } from '../use-admin-scope';
import { displayName, formatDate } from './doctor-profile-format';
import { DoctorProfileForm } from './doctor-profile-form';
import {
  getDoctor,
  listDoctors,
  listSpecialtyOptions,
} from './doctor-profile-service';
import type { DoctorDetail, DoctorListItem } from './doctor-profile-types';
import { DoctorAvatar, ProfileView, StatusBadge } from './doctor-profile-view';

// Màn "Quản lý hồ sơ bác sĩ" (admin F7; Figma 535:2 Toàn hệ thống, 627:2 Chi nhánh, 536:2 panel Hồ sơ, 537:2 panel Chỉnh sửa; PLAN BS b1–b5, A1–A3).
// Cả hai phạm vi vào được; API lọc theo phạm vi (Chi nhánh chỉ thấy bác sĩ chi nhánh mình, Q40). Bác sĩ mới tạo ở "Nhân sự & Tài khoản", không ở đây.
// Danh sách và chi tiết luôn lấy từ API; lưu xong thì panel hiện bản server trả về và danh sách TẢI LẠI.

const SEARCH_DELAY_MS = 250;
const SEARCH_MAX_LENGTH = 100;

type PanelMode = 'view' | 'edit';

export function DoctorProfilesPage() {
  const scope = useAdminScope().phamVi;
  const [search, setSearch] = useState('');
  const [specialty, setSpecialty] = useState('all');
  const [page, setPage] = useState(1);
  const q = useDebouncedValue(search.trim(), SEARCH_DELAY_MS);
  const hasFilter = q !== '' || specialty !== 'all';

  const list = useRemote(
    (signal) =>
      listDoctors(
        {
          page,
          q,
          chuyenKhoaId: specialty === 'all' ? undefined : specialty,
        },
        signal,
      ),
    [page, q, specialty],
  );
  const specialties = useRemote((signal) => listSpecialtyOptions(signal), []);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<PanelMode>('view');
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState<DoctorDetail | null>(null);
  const detail = useRemote<DoctorDetail | null>(
    (signal) =>
      selectedId === null
        ? Promise.resolve(null)
        : getDoctor(selectedId, signal),
    [selectedId],
  );
  // Bản vừa lưu (server trả về) thắng bản đã tải trước đó, tới khi tải lại
  const doctor =
    saved !== null && saved.taiKhoanId === selectedId
      ? saved
      : detail.state.status === 'ready'
        ? detail.state.data
        : null;

  function openDetail(id: string) {
    setNotice(null);
    setSaved(null);
    setMode('view');
    setSelectedId(id);
  }
  function closeDetail() {
    setSelectedId(null);
    setMode('view');
    setSaved(null);
  }
  function updateFilter(apply: () => void) {
    apply();
    setPage(1);
  }

  const columns: AdminTableColumn<DoctorListItem>[] = [
    {
      id: 'ten',
      header: 'Tên bác sĩ',
      cell: (row) => (
        <span className="flex min-w-[12rem] items-center gap-3">
          <DoctorAvatar doctor={row} size="sm" />
          <span className="min-w-0">
            <span className="block font-medium break-words text-text-primary">
              {displayName(row.chucDanh, row.hoTen)}
            </span>
            <span className="block text-xs text-text-muted">{`${row.soNamKinhNghiem} năm KN`}</span>
          </span>
        </span>
      ),
    },
    {
      id: 'ngaySinh',
      header: 'Ngày sinh',
      cell: (row) => (
        <span className="whitespace-nowrap">{formatDate(row.ngaySinh)}</span>
      ),
    },
    {
      id: 'chuyenKhoa',
      header: 'Chuyên khoa',
      cell: (row) => row.chuyenKhoa.ten,
    },
    {
      id: 'gia',
      header: 'Giá dịch vụ',
      cell: (row) => (
        <span className="font-semibold whitespace-nowrap text-brand">
          {formatVnd(row.giaKham)}
        </span>
      ),
    },
    {
      id: 'trangThai',
      header: 'Trạng thái',
      cell: (row) => <StatusBadge status={row.trangThaiTaiKhoan} />,
    },
    {
      id: 'thaoTac',
      header: 'Thao tác',
      cell: (row) => (
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-[9.375px] border border-brand-soft bg-white px-3 py-1 text-xs font-medium whitespace-nowrap text-brand"
          aria-label={`Xem chi tiết ${row.hoTen}`}
          onClick={() => openDetail(row.taiKhoanId)}
        >
          <Eye size={12} aria-hidden="true" />
          Chi tiết
        </button>
      ),
    },
  ];

  return (
    <section
      className="flex min-w-0 flex-col gap-4"
      aria-labelledby="doctor-profiles-title"
    >
      <header>
        <h1
          id="doctor-profiles-title"
          className="text-[22.5px] leading-[30px] font-bold text-text-primary"
        >
          Quản lý hồ sơ bác sĩ
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Tạo tài khoản bác sĩ mới tại{' '}
          {/* Cùng đích với mục "Nhân sự & Tài khoản" của thanh bên: tab Nhân sự, nơi có nút "Tạo tài khoản nhân sự" (F8) */}
          <Link
            to={`${ROLE_HOME_PATHS.QuanTriVien}/nhan-su`}
            className="text-brand"
          >
            Nhân sự &amp; Tài khoản
          </Link>
        </p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Tìm bác sĩ</span>
          <Search
            size={14}
            aria-hidden="true"
            className="absolute top-1/2 left-3 -translate-y-1/2 text-text-muted"
          />
          <input
            type="search"
            value={search}
            maxLength={SEARCH_MAX_LENGTH}
            placeholder="Tìm theo tên bác sĩ, email, số điện thoại…"
            className="w-full rounded-xl border border-border bg-white py-2 pr-3 pl-9 text-sm"
            onChange={(e) => updateFilter(() => setSearch(e.target.value))}
          />
        </label>
        <label>
          <span className="sr-only">Lọc theo chuyên khoa</span>
          <select
            value={specialty}
            className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm sm:w-56"
            onChange={(e) => updateFilter(() => setSpecialty(e.target.value))}
          >
            <option value="all">Tất cả chuyên khoa</option>
            {specialties.state.status === 'ready' &&
              specialties.state.data.map((s) => (
                <option key={s.chuyenKhoaId} value={s.chuyenKhoaId}>
                  {s.ten}
                </option>
              ))}
          </select>
        </label>
      </div>

      {notice !== null && selectedId === null && (
        <p
          role="alert"
          className="rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong"
        >
          {notice}
        </p>
      )}

      {list.state.status === 'loading' && (
        <LoadingState message="Đang tải danh sách bác sĩ…" />
      )}
      {list.state.status === 'error' && (
        <AccountLoadError error={list.state.error} onRetry={list.retry} />
      )}
      {list.state.status === 'ready' && (
        <AdminTable
          label="Danh sách hồ sơ bác sĩ"
          columns={columns}
          rows={list.state.data.items}
          getRowKey={(row) => row.taiKhoanId}
          page={list.state.data.page}
          pageSize={list.state.data.pageSize}
          total={list.state.data.total}
          onPageChange={setPage}
          emptyMessage={
            hasFilter ? 'Không tìm thấy bác sĩ phù hợp.' : 'Chưa có bác sĩ nào.'
          }
        />
      )}

      <AdminDetailPanel
        open={selectedId !== null}
        title="Hồ sơ bác sĩ"
        onClose={closeDetail}
      >
        {doctor === null && detail.state.status === 'loading' && (
          <LoadingState message="Đang tải hồ sơ…" />
        )}
        {doctor === null && detail.state.status === 'error' && (
          <AccountLoadError error={detail.state.error} onRetry={detail.retry} />
        )}
        {doctor !== null && mode === 'view' && (
          <>
            {notice !== null && (
              <p
                role="status"
                className="mb-3 rounded-xl border border-success-line bg-success-soft px-3 py-2 text-sm text-success"
              >
                {notice}
              </p>
            )}
            <ProfileView
              doctor={doctor}
              onEdit={() => {
                setNotice(null);
                setMode('edit');
              }}
            />
          </>
        )}
        {doctor !== null && mode === 'edit' && (
          <DoctorProfileForm
            key={doctor.taiKhoanId}
            doctor={doctor}
            canChangeBranch={scope === 'ToanHeThong'}
            onCancel={() => setMode('view')}
            onSaved={(next) => {
              setSaved(next);
              setMode('view');
              setNotice('Đã lưu hồ sơ bác sĩ.');
              list.retry();
            }}
            onNotFound={() => {
              closeDetail();
              setNotice('Không tìm thấy dữ liệu.');
              list.retry();
            }}
            onReload={() => {
              setSaved(null);
              setMode('view');
              detail.retry();
              list.retry();
            }}
          />
        )}
      </AdminDetailPanel>
    </section>
  );
}
