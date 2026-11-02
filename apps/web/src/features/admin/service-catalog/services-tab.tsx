import { Fragment, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Search } from 'lucide-react';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { feedbackFor, type FormFeedback } from './catalog-errors';
import { CatalogPagination } from './catalog-pagination';
import { createService, updateService } from './service-catalog-service';
import { ServiceForm } from './service-form';
import type { ServiceCatalogItem, ServiceInput } from './service-catalog-types';
import { useServiceGroups } from './use-service-groups';
import { useServices } from './use-services';

export function ServicesTab({ canEdit }: { canEdit: boolean }) {
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceCatalogItem | null>(null);
  const [formPending, setFormPending] = useState(false);
  const [formFeedback, setFormFeedback] = useState<FormFeedback | null>(null);
  const { state, retry } = useServices(page, query);
  const { state: groupsState, retry: retryGroups } = useServiceGroups(
    1,
    100,
    '',
  );
  const groups = groupsState.status === 'success' ? groupsState.data.items : [];

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(searchInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const visibleServices = useMemo(() => {
    if (state.status !== 'success') return [];
    return selectedGroupId
      ? state.data.items.filter(
          (service) => service.nhomDichVuId === selectedGroupId,
        )
      : state.data.items;
  }, [selectedGroupId, state]);

  function openCreate() {
    setEditing(null);
    setFormFeedback(null);
    setCreateOpen(true);
  }

  function openEdit(service: ServiceCatalogItem) {
    setCreateOpen(false);
    setFormFeedback(null);
    setEditing(service);
  }

  async function saveService(input: ServiceInput) {
    setFormPending(true);
    setFormFeedback(null);
    try {
      if (editing) await updateService(editing.dichVuKhamId, input);
      else await createService(input);
      setCreateOpen(false);
      setEditing(null);
      setSearchInput('');
      setQuery('');
      setPage(1);
      setSelectedGroupId('');
      retry();
    } catch (error) {
      setFormFeedback(feedbackFor(error));
    } finally {
      setFormPending(false);
    }
  }

  function changePage(nextPage: number) {
    setEditing(null);
    setPage(nextPage);
  }

  const inputClass =
    'h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand focus:ring-2 focus:ring-brand/15 sm:max-w-sm';

  return (
    <div className="space-y-4" data-testid="AF3-services-panel">
      {canEdit &&
        createOpen &&
        (groupsState.status === 'error' ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-white p-5 shadow-sm">
            <ErrorState error={groupsState.error} onRetry={retryGroups} />
            <button
              type="button"
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-brand"
              onClick={() => setCreateOpen(false)}
            >
              Đóng
            </button>
          </div>
        ) : (
          <ServiceForm
            groups={groups}
            pending={formPending}
            feedback={formFeedback}
            onCancel={() => setCreateOpen(false)}
            onSubmit={(input) => void saveService(input)}
          />
        ))}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <label className="relative block w-full lg:max-w-sm">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            size={17}
            aria-hidden="true"
          />
          <input
            className={`${inputClass} pl-10`}
            type="search"
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.currentTarget.value);
              setPage(1);
            }}
            aria-label="Tìm dịch vụ khám"
            placeholder="Tìm dịch vụ khám…"
          />
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="block min-w-52">
            <span className="sr-only">Lọc theo nhóm</span>
            <select
              className={inputClass}
              value={selectedGroupId}
              onChange={(event) =>
                setSelectedGroupId(event.currentTarget.value)
              }
              aria-label="Lọc theo nhóm dịch vụ"
              disabled={groupsState.status !== 'success'}
            >
              <option value="">Tất cả nhóm</option>
              {groups.map((group) => (
                <option key={group.nhomDichVuId} value={group.nhomDichVuId}>
                  {group.ten}
                </option>
              ))}
            </select>
          </label>
          {canEdit && (
            <button
              type="button"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              onClick={openCreate}
              data-testid="AF3-add-service"
            >
              <Plus size={17} aria-hidden="true" />
              Thêm dịch vụ
            </button>
          )}
        </div>
      </div>

      {selectedGroupId && (
        <p className="text-xs text-text-muted" role="note">
          Bộ lọc nhóm áp dụng trên dữ liệu trang hiện tại; API B3 chưa hỗ trợ
          lọc nhóm toàn bộ danh sách.
        </p>
      )}
      {groupsState.status === 'error' && !createOpen && (
        <ErrorState error={groupsState.error} onRetry={retryGroups} />
      )}

      {state.status === 'loading' && (
        <LoadingState message="Đang tải dịch vụ khám…" />
      )}
      {state.status === 'error' && (
        <ErrorState error={state.error} onRetry={retry} />
      )}
      {state.status === 'success' && (
        <section
          className="overflow-hidden rounded-xl border border-border bg-white shadow-sm"
          aria-label="Danh sách dịch vụ khám"
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="bg-surface-muted text-xs font-semibold uppercase tracking-wide text-text-secondary">
                <tr>
                  <th className="px-5 py-3.5" scope="col">
                    Dịch vụ
                  </th>
                  <th className="px-5 py-3.5" scope="col">
                    Nhóm
                  </th>
                  <th className="w-36 px-5 py-3.5" scope="col">
                    Giá
                  </th>
                  {canEdit && (
                    <th className="w-32 px-5 py-3.5 text-right" scope="col">
                      Thao tác
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-text-primary">
                {visibleServices.length === 0 ? (
                  <tr>
                    <td
                      className="px-5 py-12 text-center text-text-muted"
                      colSpan={canEdit ? 4 : 3}
                    >
                      {state.data.total === 0 && !query
                        ? 'Chưa có dịch vụ khám nào.'
                        : selectedGroupId
                          ? 'Không có dịch vụ thuộc nhóm này trên trang hiện tại.'
                          : 'Không tìm thấy dịch vụ khám phù hợp.'}
                    </td>
                  </tr>
                ) : (
                  visibleServices.map((service) => (
                    <Fragment key={service.dichVuKhamId}>
                      <tr className="hover:bg-page/70">
                        <td className="px-5 py-4">
                          <div className="font-medium text-text-primary">
                            {service.ten}
                          </div>
                          <div className="mt-1 text-xs text-text-muted">
                            {service.thoiLuong} phút
                          </div>
                        </td>
                        <td className="px-5 py-4 text-text-secondary">
                          {service.tenNhom}
                        </td>
                        <td className="px-5 py-4 font-medium tabular-nums">
                          {formatVnd(service.giaMacDinh)}
                        </td>
                        {canEdit && (
                          <td className="px-5 py-3 text-right">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-text-secondary hover:bg-info-surface hover:text-brand focus-visible:outline-2 focus-visible:outline-brand"
                              aria-label={`Sửa ${service.ten}`}
                              title="Sửa"
                              onClick={() => openEdit(service)}
                            >
                              <Pencil size={15} aria-hidden="true" />
                              Sửa
                            </button>
                          </td>
                        )}
                      </tr>
                      {editing?.dichVuKhamId === service.dichVuKhamId && (
                        <tr>
                          <td
                            className="bg-page/70 p-4"
                            colSpan={canEdit ? 4 : 3}
                          >
                            <ServiceForm
                              key={service.dichVuKhamId}
                              service={editing}
                              groups={groups}
                              pending={formPending}
                              feedback={formFeedback}
                              onCancel={() => setEditing(null)}
                              onSubmit={(input) => void saveService(input)}
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
            onPageChange={changePage}
          />
        </section>
      )}
    </div>
  );
}

function formatVnd(value: string): string {
  const [integerPart = '0', fractionalPart = ''] = value.split('.');
  const integer = new Intl.NumberFormat('vi-VN').format(BigInt(integerPart));
  const fraction = fractionalPart.replace(/0+$/u, '');
  return `${integer}${fraction ? `,${fraction}` : ''} ₫`;
}
