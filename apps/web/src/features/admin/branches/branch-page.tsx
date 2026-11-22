import { useState } from 'react';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { useAdminScope } from '../use-admin-scope';
import { BranchForm } from './branch-form';
import { scheduleLines } from './branch-schedule-format';
import type { Branch, BranchUpdateResult } from './branch-types';
import {
  summarizeBranchUpdate,
  type BranchUpdateSummary,
} from './branch-update-summary';
import { useBranches } from './use-branches';
import styles from './branches.module.css';

function BranchCard({
  branch,
  editing,
  onToggleEdit,
}: {
  branch: Branch;
  editing: boolean;
  onToggleEdit: () => void;
}) {
  return (
    <article className={styles.branchCard} aria-label={branch.ten}>
      <div className={styles.branchCardMain}>
        <div className={styles.branchTitleRow}>
          <h3>{branch.ten}</h3>
          <span className={styles.serviceCount}>
            {branch.dichVuKham.length} dịch vụ
          </span>
          {branch.coYeuCauDangMo && (
            <span className={styles.openRequestBadge}>
              Có yêu cầu thay đổi đang mở
            </span>
          )}
        </div>
        <div className={styles.branchDetails}>
          <div className={styles.branchDetail}>
            <img src="/assets/admin/branches/location.svg" alt="" />
            <span>{branch.diaChi}</span>
            {/* Tọa độ không hiện số trên thẻ nữa, mà là link tới bản đồ (Đại chốt 16/11/2026) */}
            {branch.toaDoLat !== null && branch.toaDoLng !== null && (
              <a
                className={styles.mapLink}
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${branch.toaDoLat},${branch.toaDoLng}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Xem bản đồ ${branch.ten} (mở tab mới)`}
              >
                Xem bản đồ
              </a>
            )}
          </div>
          <div className={styles.branchDetail}>
            <img src="/assets/admin/branches/schedule.svg" alt="" />
            <ul className={styles.scheduleList} aria-label="Giờ nhận khám">
              {scheduleLines(branch.lichHoatDong).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      {/* F6b: mở form sửa ngay dưới thẻ (Figma 544:2); đang mở thì nút thành "Hủy" như Figma */}
      <button
        type="button"
        className={editing ? styles.cancelEditLink : styles.editButton}
        aria-expanded={editing}
        aria-controls={
          editing ? `branch-edit-${branch.chiNhanhId}-form` : undefined
        }
        onClick={onToggleEdit}
      >
        {!editing && <img src="/assets/admin/branches/edit.svg" alt="" />}
        {editing ? 'Hủy' : 'Sửa lịch / dịch vụ'}
      </button>
    </article>
  );
}

/**
 * `refreshKey`: tăng từ bên ngoài để tải lại danh sách (F6b). `onUpdated`: báo bên ngoài sau khi Sửa lịch / dịch vụ thành công,
 * để khối yêu cầu thay đổi tải lại khi vừa có yêu cầu mới.
 */
export function BranchPage({
  refreshKey = 0,
  onUpdated,
}: {
  refreshKey?: number;
  onUpdated?: () => void;
} = {}) {
  const adminScope = useAdminScope();
  const canCreate = adminScope.phamVi === 'ToanHeThong';
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  // Chi nhánh đang mở form Sửa (chỉ một cái một lúc) và tóm tắt kết quả lần sửa gần nhất
  const [editingId, setEditingId] = useState<string | null>(null);
  const [updateSummary, setUpdateSummary] =
    useState<BranchUpdateSummary | null>(null);
  const { state, retry } = useBranches(page, query, refreshKey);

  function updateSearch(value: string) {
    setSearchInput(value);
    setQuery(value.trim());
    setPage(1);
    setSuccessMessage('');
    setUpdateSummary(null);
  }

  function toggleEdit(chiNhanhId: string) {
    setEditingId((current) => (current === chiNhanhId ? null : chiNhanhId));
    setSuccessMessage('');
    setUpdateSummary(null);
  }

  function handleUpdated(result: BranchUpdateResult) {
    setEditingId(null);
    setUpdateSummary(summarizeBranchUpdate(result));
    retry();
    onUpdated?.();
  }

  function handleCreated() {
    setCreating(false);
    setSuccessMessage('Đã thêm chi nhánh.');
    setPage(1);
    retry();
  }

  const pageCount =
    state.status === 'success'
      ? Math.max(1, Math.ceil(state.data.total / state.data.pageSize))
      : 1;

  return (
    <section className={styles.page} aria-labelledby="branches-title">
      <h2 id="branches-title" className={styles.visuallyHidden}>
        Danh sách chi nhánh
      </h2>
      <div className={styles.toolbar}>
        <label className={`${styles.searchBox} field-frame`}>
          <img src="/assets/admin/specialties/search.svg" alt="" />
          <span className={styles.visuallyHidden}>Tìm chi nhánh</span>
          <input
            type="search"
            placeholder="Tìm chi nhánh..."
            value={searchInput}
            onChange={(event) => updateSearch(event.currentTarget.value)}
          />
        </label>
        {canCreate && (
          <button
            className={styles.addButton}
            type="button"
            aria-expanded={creating}
            aria-controls={creating ? 'branch-create-form' : undefined}
            onClick={() => {
              setCreating((value) => !value);
              setSuccessMessage('');
            }}
          >
            <img src="/assets/admin/specialties/add.svg" alt="" />
            {creating ? 'Đóng biểu mẫu' : 'Thêm chi nhánh'}
          </button>
        )}
      </div>

      {creating && canCreate && (
        <BranchForm
          key="new-branch"
          onCancel={() => setCreating(false)}
          onSaved={handleCreated}
        />
      )}

      {successMessage && (
        <p className={styles.successMessage} role="status">
          {successMessage}
        </p>
      )}
      {updateSummary && (
        <div className={styles.updateSummary} role="status">
          {updateSummary.saved && <p>{updateSummary.saved}</p>}
          {updateSummary.pending && (
            <p className={styles.updatePending}>{updateSummary.pending}</p>
          )}
          {updateSummary.warning && (
            <p className={styles.updateWarning}>{updateSummary.warning}</p>
          )}
        </div>
      )}

      <div className={styles.branchList}>
        {state.status === 'loading' && (
          <LoadingState message="Đang tải danh sách chi nhánh…" />
        )}
        {state.status === 'error' && (
          <ErrorState error={state.error} onRetry={retry} />
        )}
        {state.status === 'success' && state.data.items.length === 0 && (
          <div className={styles.emptyState}>
            {query
              ? 'Không tìm thấy chi nhánh phù hợp.'
              : 'Chưa có chi nhánh nào.'}
          </div>
        )}
        {state.status === 'success' && state.data.items.length > 0 && (
          <>
            <div className={styles.branchCards}>
              {state.data.items.map((branch) => (
                <div key={branch.chiNhanhId} className={styles.branchCardGroup}>
                  <BranchCard
                    branch={branch}
                    editing={editingId === branch.chiNhanhId}
                    onToggleEdit={() => toggleEdit(branch.chiNhanhId)}
                  />
                  {editingId === branch.chiNhanhId && (
                    <BranchForm
                      branch={branch}
                      onCancel={() => setEditingId(null)}
                      onSaved={(result) => {
                        if (result) handleUpdated(result);
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
            {pageCount > 1 && (
              <nav
                className={styles.pagination}
                aria-label="Phân trang chi nhánh"
              >
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  Trang trước
                </button>
                <span>
                  Trang {page} / {pageCount}
                </span>
                <button
                  type="button"
                  disabled={page >= pageCount}
                  onClick={() =>
                    setPage((value) => Math.min(pageCount, value + 1))
                  }
                >
                  Trang sau
                </button>
              </nav>
            )}
          </>
        )}
      </div>
    </section>
  );
}
