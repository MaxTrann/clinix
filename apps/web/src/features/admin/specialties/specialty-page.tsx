import { useState } from 'react';
import { Info } from 'lucide-react';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { ApiError } from '../../../shared/api/errors';
import { AdminTable, type AdminTableColumn } from '../components/admin-table';
import { useAdminScope } from '../use-admin-scope';
import { SpecialtyDialog } from './specialty-dialog';
import { setSpecialtyStatus } from './specialty-service';
import type { Specialty, SpecialtyStatus } from './specialty-types';
import { useSpecialties } from './use-specialties';
import styles from './specialty.module.css';

type StatusFilter = 'all' | SpecialtyStatus;

export function SpecialtyPage() {
  const adminScope = useAdminScope();
  const isSystemAdmin = adminScope.phamVi === 'ToanHeThong';
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [dialogSpecialty, setDialogSpecialty] = useState<Specialty | null>(
    null,
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingStatusId, setPendingStatusId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const { state, retry } = useSpecialties(
    page,
    query,
    statusFilter === 'all' ? undefined : statusFilter,
  );

  function openCreateDialog() {
    setDialogSpecialty(null);
    setDialogOpen(true);
  }

  function openEditDialog(specialty: Specialty) {
    setDialogSpecialty(specialty);
    setDialogOpen(true);
  }

  async function toggleStatus(specialty: Specialty) {
    const nextStatus: SpecialtyStatus =
      specialty.trangThaiHoatDong === 'DangHoatDong'
        ? 'NgungHoatDong'
        : 'DangHoatDong';
    setPendingStatusId(specialty.chuyenKhoaId);
    setActionError('');
    try {
      await setSpecialtyStatus(specialty.chuyenKhoaId, nextStatus);
      retry();
    } catch (error) {
      setActionError(
        error instanceof ApiError && error.status === 403
          ? 'Bạn không có quyền đổi trạng thái chuyên khoa.'
          : 'Không đổi được trạng thái chuyên khoa. Vui lòng thử lại.',
      );
    } finally {
      setPendingStatusId(null);
    }
  }

  const columns: AdminTableColumn<Specialty>[] = [
    {
      id: 'name',
      header: 'Tên chuyên khoa',
      width: '22.3%',
      cell: (specialty) => (
        <div className={styles.specialtyName}>
          {specialty.anhDaiDien ? (
            <img
              className={styles.specialtyImage}
              src={specialty.anhDaiDien}
              alt=""
            />
          ) : (
            <span className={styles.specialtyInitial} aria-hidden="true">
              {Array.from(specialty.ten)[0]?.toLocaleUpperCase('vi') ?? '?'}
            </span>
          )}
          <span>{specialty.ten}</span>
        </div>
      ),
    },
    {
      id: 'description',
      header: 'Mô tả',
      width: '27%',
      cell: (specialty) => (
        <span className={styles.description}>{specialty.moTa || '—'}</span>
      ),
    },
    {
      id: 'doctors',
      header: 'Số bác sĩ',
      width: '10.2%',
      cell: (specialty) => (
        <span className={styles.doctorCount}>
          <img src="/assets/admin/specialties/doctors.svg" alt="" />
          {specialty.soBacSi}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Trạng thái',
      width: '12.9%',
      cell: (specialty) => (
        <span
          className={
            specialty.trangThaiHoatDong === 'DangHoatDong'
              ? styles.activeStatus
              : styles.inactiveStatus
          }
        >
          {specialty.trangThaiHoatDong === 'DangHoatDong'
            ? 'Hoạt động'
            : 'Ngừng hoạt động'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Thao tác',
      width: '11.3%',
      cell: (specialty) =>
        isSystemAdmin ? (
          <div className={styles.rowActions}>
            <button
              type="button"
              aria-label={`Chỉnh sửa ${specialty.ten}`}
              title="Chỉnh sửa"
              onClick={() => openEditDialog(specialty)}
            >
              <img src="/assets/admin/specialties/edit.svg" alt="" />
            </button>
            <button
              type="button"
              aria-label={
                specialty.trangThaiHoatDong === 'DangHoatDong'
                  ? `Ngừng hoạt động ${specialty.ten}`
                  : `Kích hoạt ${specialty.ten}`
              }
              title={
                specialty.trangThaiHoatDong === 'DangHoatDong'
                  ? 'Ngừng hoạt động'
                  : 'Kích hoạt'
              }
              disabled={pendingStatusId !== null}
              onClick={() => void toggleStatus(specialty)}
            >
              <img src="/assets/admin/specialties/toggle-status.svg" alt="" />
            </button>
          </div>
        ) : (
          <span className={styles.readOnly}>Chỉ xem</span>
        ),
    },
  ];

  function updateSearch(value: string) {
    setSearchInput(value);
    setQuery(value.trim());
    setPage(1);
  }

  function updateStatus(value: StatusFilter) {
    setStatusFilter(value);
    setPage(1);
  }

  return (
    <section className={styles.page} aria-labelledby="specialties-title">
      <header className={styles.pageHeader}>
        <div>
          <h1 id="specialties-title">Quản lý chuyên khoa</h1>
          {state.status === 'success' && (
            <p className={styles.summary}>
              {state.data.total} chuyên khoa
              {statusFilter !== 'all' &&
                ` · ${statusFilter === 'DangHoatDong' ? 'đang hoạt động' : 'ngừng hoạt động'}`}
            </p>
          )}
        </div>
        {isSystemAdmin && (
          <button
            type="button"
            className={styles.addButton}
            onClick={openCreateDialog}
          >
            <img src="/assets/admin/specialties/add.svg" alt="" />
            Thêm chuyên khoa
          </button>
        )}
      </header>

      {!isSystemAdmin && (
        <div className={styles.readOnlyBanner} role="note">
          <Info size={13} aria-hidden="true" />
          Quản lý chuyên khoa chỉ dành cho Admin toàn hệ thống. Bạn có thể xem
          danh sách nhưng không thể thêm hoặc sửa.
        </div>
      )}

      <div className={styles.toolbar}>
        <label className={styles.searchBox}>
          <img src="/assets/admin/specialties/search.svg" alt="" />
          <input
            type="search"
            aria-label="Tìm theo tên hoặc mô tả"
            placeholder="Tìm theo tên hoặc mô tả…"
            value={searchInput}
            onChange={(event) => updateSearch(event.currentTarget.value)}
          />
        </label>
        <label className={styles.filterField}>
          <span className={styles.srOnly}>Lọc trạng thái</span>
          <select
            aria-label="Lọc trạng thái"
            value={statusFilter}
            onChange={(event) =>
              updateStatus(event.currentTarget.value as StatusFilter)
            }
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="DangHoatDong">Đang hoạt động</option>
            <option value="NgungHoatDong">Ngừng hoạt động</option>
          </select>
        </label>
      </div>

      {actionError && (
        <p className={styles.actionError} role="alert">
          {actionError}
        </p>
      )}

      {state.status === 'loading' && (
        <LoadingState message="Đang tải danh sách chuyên khoa…" />
      )}
      {state.status === 'error' && (
        <ErrorState error={state.error} onRetry={retry} />
      )}
      {state.status === 'success' && (
        <AdminTable
          label="Danh sách chuyên khoa"
          columns={columns}
          rows={state.data.items}
          getRowKey={(specialty) => specialty.chuyenKhoaId}
          page={page}
          pageSize={state.data.pageSize}
          total={state.data.total}
          onPageChange={setPage}
          emptyMessage={
            query || statusFilter !== 'all'
              ? 'Không tìm thấy chuyên khoa phù hợp.'
              : 'Chưa có chuyên khoa nào.'
          }
        />
      )}

      {dialogOpen && (
        <SpecialtyDialog
          open
          specialty={dialogSpecialty}
          onClose={() => setDialogOpen(false)}
          onSaved={() => {
            setDialogOpen(false);
            retry();
          }}
          onPartialSaved={retry}
        />
      )}
    </section>
  );
}
