import { useState } from 'react';
import { CirclePause, CirclePlay, Info, Pencil } from 'lucide-react';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { ApiError } from '../../../shared/api/errors';
import { AdminConfirmationDialog } from '../components/admin-confirmation-dialog';
import { AdminTable, type AdminTableColumn } from '../components/admin-table';
import { useAdminScope } from '../use-admin-scope';
import { SpecialtyDialog } from './specialty-dialog';
import { setSpecialtyStatus } from './specialty-service';
import type { Specialty, SpecialtyStatus } from './specialty-types';
import { useSpecialties } from './use-specialties';
import styles from './specialty.module.css';

type StatusFilter = 'all' | SpecialtyStatus;

// Icon theo trạng thái (PR1 mục 2): đang hoạt động ⇒ hành động "Ngừng" (tạm dừng, cam); đang ngừng ⇒ "Kích hoạt" (phát, xanh lá)
function StatusToggleButton({
  specialty,
  disabled,
  onClick,
}: {
  specialty: Specialty;
  disabled: boolean;
  onClick: () => void;
}) {
  const isActive = specialty.trangThaiHoatDong === 'DangHoatDong';
  const label = isActive ? 'Ngừng hoạt động' : 'Kích hoạt';
  return (
    <button
      type="button"
      className={isActive ? styles.pauseAction : styles.resumeAction}
      aria-label={`${label} ${specialty.ten}`}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {isActive ? (
        <CirclePause size={15} strokeWidth={1.5} aria-hidden="true" />
      ) : (
        <CirclePlay size={15} strokeWidth={1.5} aria-hidden="true" />
      )}
    </button>
  );
}

// Ghi chú của popup Ngừng hoạt động (Figma 733:2); chuyên khoa chưa có bác sĩ thì bỏ vế bác sĩ [đề xuất]
function stopNote(specialty: Specialty): string {
  const unlinked = 'Chuyên khoa không bị xóa hay gỡ liên kết.';
  return specialty.soBacSi > 0
    ? `${specialty.soBacSi} bác sĩ thuộc chuyên khoa này vẫn giữ nguyên hồ sơ. ${unlinked}`
    : unlinked;
}

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
  // Chuyên khoa đang chờ xác nhận ngừng hoạt động (popup); chưa gọi API cho tới khi bấm xác nhận
  const [stopTarget, setStopTarget] = useState<Specialty | null>(null);
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

  // Kích hoạt gọi ngay (không mất dữ liệu, hoàn tác bằng một lần ngừng; Đại chốt 16/11/2026); Ngừng hoạt động phải xác nhận
  function requestToggle(specialty: Specialty) {
    if (specialty.trangThaiHoatDong === 'DangHoatDong') {
      setStopTarget(specialty);
      return;
    }
    void toggleStatus(specialty);
  }

  async function confirmStop() {
    if (!stopTarget) return;
    await toggleStatus(stopTarget);
    setStopTarget(null);
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
              className={styles.editAction}
              aria-label={`Chỉnh sửa ${specialty.ten}`}
              title="Chỉnh sửa"
              onClick={() => openEditDialog(specialty)}
            >
              <Pencil size={15} strokeWidth={1.5} aria-hidden="true" />
            </button>
            <StatusToggleButton
              specialty={specialty}
              disabled={pendingStatusId !== null}
              onClick={() => requestToggle(specialty)}
            />
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
        <label className={`${styles.searchBox} field-frame`}>
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

      <AdminConfirmationDialog
        open={stopTarget !== null}
        title="Ngừng hoạt động chuyên khoa?"
        message={
          stopTarget && (
            <>
              Chuyên khoa <strong>{stopTarget.ten}</strong> sẽ được tạm dừng và
              ẩn khỏi kết quả tìm kiếm/đặt lịch dành cho bệnh nhân.
            </>
          )
        }
        note={stopTarget && stopNote(stopTarget)}
        confirmLabel="Ngừng hoạt động"
        cancelLabel="Hủy"
        pending={pendingStatusId !== null}
        tone="warning"
        onConfirm={() => void confirmStop()}
        onCancel={() => {
          if (pendingStatusId === null) setStopTarget(null);
        }}
      />

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
