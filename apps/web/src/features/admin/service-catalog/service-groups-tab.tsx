import { Fragment, useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { AdminConfirmationDialog } from '../components/admin-confirmation-dialog';
import { CatalogPagination } from './catalog-pagination';
import { feedbackFor, type FormFeedback } from './catalog-errors';
import { ServiceGroupForm } from './service-group-form';
import {
  createServiceGroup,
  deleteServiceGroup,
  updateServiceGroup,
} from './service-catalog-service';
import type { ServiceGroup, ServiceGroupInput } from './service-catalog-types';
import { useServiceGroups } from './use-service-groups';

export function ServiceGroupsTab({ canEdit }: { canEdit: boolean }) {
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceGroup | null>(null);
  const [formPending, setFormPending] = useState(false);
  const [formFeedback, setFormFeedback] = useState<FormFeedback | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ServiceGroup | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [actionError, setActionError] = useState('');
  const { state, retry } = useServiceGroups(page, 20, query);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(searchInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  function openCreate() {
    setEditing(null);
    setFormFeedback(null);
    setCreateOpen(true);
    setActionError('');
  }

  function openEdit(group: ServiceGroup) {
    setCreateOpen(false);
    setFormFeedback(null);
    setEditing(group);
    setActionError('');
  }

  async function saveGroup(input: ServiceGroupInput) {
    setFormPending(true);
    setFormFeedback(null);
    try {
      if (editing) await updateServiceGroup(editing.nhomDichVuId, input);
      else await createServiceGroup(input);
      setCreateOpen(false);
      setEditing(null);
      setSearchInput('');
      setQuery('');
      setPage(1);
      retry();
    } catch (error) {
      setFormFeedback(feedbackFor(error));
    } finally {
      setFormPending(false);
    }
  }

  async function removeGroup() {
    if (!deleteTarget) return;
    setDeletePending(true);
    setActionError('');
    try {
      await deleteServiceGroup(deleteTarget.nhomDichVuId);
      setDeleteTarget(null);
      setSearchInput('');
      setQuery('');
      setPage(1);
      retry();
    } catch (error) {
      setActionError(feedbackFor(error).message);
      setDeleteTarget(null);
    } finally {
      setDeletePending(false);
    }
  }

  const inputClass =
    'h-10 w-full rounded-lg border border-border bg-white pl-10 pr-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand focus:ring-2 focus:ring-brand/15 sm:max-w-sm';

  return (
    <div className="space-y-4" data-testid="AF3-groups-panel">
      {canEdit && createOpen && (
        <ServiceGroupForm
          pending={formPending}
          feedback={formFeedback}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(input) => void saveGroup(input)}
        />
      )}

      {actionError && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger"
        >
          {actionError}
        </p>
      )}

      {!createOpen && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block w-full sm:max-w-sm">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
              size={17}
              aria-hidden="true"
            />
            <input
              className={inputClass}
              type="search"
              value={searchInput}
              onChange={(event) => {
                setSearchInput(event.currentTarget.value);
                setPage(1);
              }}
              aria-label="Tìm nhóm dịch vụ"
              placeholder="Tìm nhóm dịch vụ…"
            />
          </label>
          {canEdit && (
            <button
              type="button"
              className="inline-flex min-h-[33.75px] items-center justify-center gap-[7.5px] rounded-[13.375px] bg-brand px-[15px] py-[7.5px] text-[13.125px] font-medium text-white hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              onClick={openCreate}
              data-testid="AF3-add-group"
            >
              <Plus size={17} aria-hidden="true" />
              Thêm nhóm
            </button>
          )}
        </div>
      )}

      {state.status === 'loading' && (
        <LoadingState message="Đang tải nhóm dịch vụ…" />
      )}
      {state.status === 'error' && (
        <ErrorState error={state.error} onRetry={retry} />
      )}
      {state.status === 'success' && (
        <section
          className="overflow-hidden rounded-[13.375px] border border-[#f3f4f6] bg-white"
          aria-label="Danh sách nhóm dịch vụ"
        >
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse text-left text-sm">
              <thead className="bg-[#f9fafb] text-[11.25px] font-medium text-[#6a7282]">
                <tr>
                  <th className="px-[15px] py-[11.25px]" scope="col">
                    Tên nhóm
                  </th>
                  <th
                    className="w-44 px-[15px] py-[11.25px] text-center"
                    scope="col"
                  >
                    Số dịch vụ
                  </th>
                  <th
                    className="w-36 px-[15px] py-[11.25px] text-center"
                    scope="col"
                  >
                    Thứ tự
                  </th>
                  {canEdit && (
                    <th
                      className="w-40 px-[15px] py-[11.25px] text-right"
                      scope="col"
                    >
                      Thao tác
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f9fafb] text-text-primary">
                {state.data.items.length === 0 ? (
                  <tr>
                    <td
                      className="px-5 py-12 text-center text-text-muted"
                      colSpan={canEdit ? 4 : 3}
                    >
                      {query
                        ? 'Không tìm thấy nhóm dịch vụ phù hợp.'
                        : 'Chưa có nhóm dịch vụ nào.'}
                    </td>
                  </tr>
                ) : (
                  state.data.items.map((group) => (
                    <Fragment key={group.nhomDichVuId}>
                      <tr className="hover:bg-page/70">
                        <td className="px-[15px] py-[11.25px] text-[13.125px] font-medium">
                          {group.ten}
                        </td>
                        <td
                          className="px-[15px] py-[11.25px] text-center text-[13.125px] text-text-muted"
                          title="API B2 chưa trả số dịch vụ theo nhóm"
                        >
                          —<span className="sr-only">Chưa có từ API</span>
                        </td>
                        <td className="px-[15px] py-[11.25px] text-center text-[13.125px] text-text-secondary">
                          {group.thuTuHienThi}
                        </td>
                        {canEdit && (
                          <td className="px-5 py-3 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                className="inline-flex items-center rounded-md px-2 py-1 text-[11.25px] font-medium text-[#0092b8] hover:bg-info-surface focus-visible:outline-2 focus-visible:outline-brand"
                                aria-label={`Sửa ${group.ten}`}
                                title="Sửa"
                                onClick={() => openEdit(group)}
                              >
                                Sửa
                              </button>
                              <button
                                type="button"
                                className="inline-flex items-center rounded-md px-2 py-1 text-[11.25px] font-medium text-[#fb2c36] hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-danger"
                                aria-label={`Xóa ${group.ten}`}
                                title="Xóa"
                                onClick={() => setDeleteTarget(group)}
                              >
                                Xóa
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                      {editing?.nhomDichVuId === group.nhomDichVuId && (
                        <tr key={`${group.nhomDichVuId}-edit`}>
                          <td
                            className="bg-page/70 p-4"
                            colSpan={canEdit ? 4 : 3}
                          >
                            <ServiceGroupForm
                              key={group.nhomDichVuId}
                              group={editing}
                              pending={formPending}
                              feedback={formFeedback}
                              onCancel={() => setEditing(null)}
                              onSubmit={(input) => void saveGroup(input)}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <CatalogPagination
            page={state.data.page}
            pageSize={state.data.pageSize}
            total={state.data.total}
            onPageChange={setPage}
          />
        </section>
      )}

      <AdminConfirmationDialog
        open={Boolean(deleteTarget)}
        title="Xóa nhóm dịch vụ?"
        message={
          deleteTarget
            ? `Bạn có chắc muốn xóa nhóm “${deleteTarget.ten}”? Nhóm có dịch vụ sẽ không thể xóa.`
            : ''
        }
        confirmLabel="Xóa nhóm"
        cancelLabel="Hủy"
        pending={deletePending}
        tone="danger"
        onConfirm={() => void removeGroup()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
