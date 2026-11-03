import { useState, type FormEvent } from 'react';
import { ApiError } from '../../../shared/api/errors';
import { errorMessageFor } from '../../../shared/api/error-message';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { useAdminScope } from '../use-admin-scope';
import { createBranch } from './branch-service';
import {
  scheduleIssuesFromApi,
  toPeriodInput,
  validateWeeklySchedule,
  weeklyScheduleIssueMessage,
  type WeeklyScheduleIssue,
} from './branch-schedule-validation';
import type {
  Branch,
  BranchScheduleInput,
  CreateBranchInput,
} from './branch-types';
import {
  useAvailableServices,
  useBranches,
  type AvailableServicesState,
} from './use-branches';
import styles from './branches.module.css';

const DAY_LABELS: Record<number, string> = {
  1: 'Thứ 2',
  2: 'Thứ 3',
  3: 'Thứ 4',
  4: 'Thứ 5',
  5: 'Thứ 6',
  6: 'Thứ 7',
  7: 'CN',
};

interface PeriodDraft {
  enabled: boolean;
  start: string;
  end: string;
}

interface ScheduleDraft {
  day: number;
  open: boolean;
  morning: PeriodDraft;
  afternoon: PeriodDraft;
}

interface BranchDraft {
  ten: string;
  diaChi: string;
  toaDoLat: string;
  toaDoLng: string;
}

type BranchField = keyof BranchDraft;
type BranchFieldErrors = Partial<Record<BranchField, string>>;

const emptyPeriod = (enabled: boolean): PeriodDraft => ({
  enabled,
  start: '',
  end: '',
});

function defaultSchedule(): ScheduleDraft[] {
  return Array.from({ length: 7 }, (_, index) => {
    const day = index + 1;
    const open = day <= 6;
    return {
      day,
      open,
      morning: emptyPeriod(open),
      afternoon: emptyPeriod(day <= 5),
    };
  });
}

function toScheduleInput(schedule: ScheduleDraft[]): BranchScheduleInput[] {
  return schedule.map((day) => {
    const morning = toPeriodInput(
      day.open && day.morning.enabled,
      day.morning.start,
      day.morning.end,
    );
    const afternoon = toPeriodInput(
      day.open && day.afternoon.enabled,
      day.afternoon.start,
      day.afternoon.end,
    );
    return {
      thuTrongTuan: day.day,
      hoatDong: day.open,
      ...(morning ? { sang: morning } : {}),
      ...(afternoon ? { chieu: afternoon } : {}),
    };
  });
}

function coordinateError(value: string, limit: number): string | undefined {
  if (!/^[+-]?\d+(?:\.\d{1,7})?$/u.test(value)) return 'Tọa độ không hợp lệ.';
  if (!Number.isFinite(Number(value)) || Math.abs(Number(value)) > limit)
    return `Giá trị phải nằm trong khoảng ${-limit} đến ${limit}.`;
  return undefined;
}

function validateBranchDraft(draft: BranchDraft): BranchFieldErrors {
  const errors: BranchFieldErrors = {};
  const name = draft.ten.trim().replace(/\s+/gu, ' ');
  const address = draft.diaChi.trim();
  if (name.length < 1 || name.length > 100)
    errors.ten = 'Tên chi nhánh phải có từ 1 đến 100 ký tự.';
  if (address.length < 1 || address.length > 255)
    errors.diaChi = 'Địa chỉ phải có từ 1 đến 255 ký tự.';

  const hasLatitude = draft.toaDoLat !== '';
  const hasLongitude = draft.toaDoLng !== '';
  if (hasLatitude !== hasLongitude) {
    errors.toaDoLat = 'Nhập đồng thời vĩ độ và kinh độ.';
    errors.toaDoLng = 'Nhập đồng thời vĩ độ và kinh độ.';
  } else if (hasLatitude && hasLongitude) {
    const latitudeError = coordinateError(draft.toaDoLat, 90);
    const longitudeError = coordinateError(draft.toaDoLng, 180);
    if (latitudeError) errors.toaDoLat = latitudeError;
    if (longitudeError) errors.toaDoLng = longitudeError;
  }
  return errors;
}

function fieldErrorFromApi(field: string, code: string): string | undefined {
  if (field === 'ten') return 'Tên chi nhánh phải có từ 1 đến 100 ký tự.';
  if (field === 'diaChi') return 'Địa chỉ phải có từ 1 đến 255 ký tự.';
  if (field === 'toaDoLat' || field === 'toaDoLng') {
    return code === 'TOA_DO_PHAI_DI_THEO_CAP'
      ? 'Nhập đồng thời vĩ độ và kinh độ.'
      : 'Tọa độ không hợp lệ.';
  }
  return undefined;
}

function dayLabel(day: number): string {
  return DAY_LABELS[day] ?? `Thứ ${day}`;
}

function formatPeriod(period: { batDau: string; ketThuc: string }): string {
  return `${period.batDau.slice(0, 5)}–${period.ketThuc.slice(0, 5)}`;
}

// Gộp các ngày liền nhau có cùng giờ thành một đoạn, ví dụ "Thứ 4–Thứ 6: S: 08:00–11:30" (như Figma)
function formatSchedule(branch: Branch): string {
  const groups: { first: number; last: number; periods: string }[] = [];
  const days = [...branch.lichHoatDong].sort(
    (a, b) => a.thuTrongTuan - b.thuTrongTuan,
  );
  for (const day of days) {
    if (day.hoatDong !== true) continue;
    const periods: string[] = [];
    if (day.sang) periods.push(`S: ${formatPeriod(day.sang)}`);
    if (day.chieu) periods.push(`C: ${formatPeriod(day.chieu)}`);
    if (periods.length === 0) continue;
    const text = periods.join(', ');
    const previous = groups[groups.length - 1];
    if (
      previous &&
      previous.periods === text &&
      previous.last === day.thuTrongTuan - 1
    ) {
      previous.last = day.thuTrongTuan;
    } else {
      groups.push({
        first: day.thuTrongTuan,
        last: day.thuTrongTuan,
        periods: text,
      });
    }
  }
  const parts = groups.map((group) =>
    group.first === group.last
      ? `${dayLabel(group.first)}: ${group.periods}`
      : `${dayLabel(group.first)}–${dayLabel(group.last)}: ${group.periods}`,
  );
  return parts.length > 0 ? parts.join(' | ') : 'Chưa khai báo giờ nhận khám';
}

function BranchCard({ branch }: { branch: Branch }) {
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
          <span className={styles.branchDetail}>
            <img src="/assets/admin/branches/location.svg" alt="" />
            <span>{branch.diaChi}</span>
          </span>
          <span className={styles.branchDetail}>
            <img src="/assets/admin/branches/schedule.svg" alt="" />
            <span>{formatSchedule(branch)}</span>
          </span>
          {branch.toaDoLat !== null && branch.toaDoLng !== null && (
            <span className={styles.coordinates}>
              {branch.toaDoLat}, {branch.toaDoLng}
            </span>
          )}
        </div>
      </div>
      {/* Figma có nút này; API sửa lịch/dịch vụ (F6b) chưa có nên để vô hiệu */}
      <button
        type="button"
        className={styles.editButton}
        disabled
        title="Chưa được triển khai"
      >
        <img src="/assets/admin/branches/edit.svg" alt="" />
        Sửa lịch / dịch vụ
      </button>
    </article>
  );
}

function BranchCreateForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: () => void;
}) {
  const availableServices = useAvailableServices();
  const services =
    availableServices.state.status === 'success'
      ? availableServices.state.data
      : [];
  const [draft, setDraft] = useState<BranchDraft>({
    ten: '',
    diaChi: '',
    toaDoLat: '',
    toaDoLng: '',
  });
  const [schedule, setSchedule] = useState(defaultSchedule);
  const [selectedServices, setSelectedServices] = useState<Set<string>>(
    () => new Set(),
  );
  const [submitted, setSubmitted] = useState(false);
  const [serverFieldErrors, setServerFieldErrors] = useState<BranchFieldErrors>(
    {},
  );
  const [serverScheduleIssues, setServerScheduleIssues] = useState<
    WeeklyScheduleIssue[]
  >([]);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const fieldErrors = submitted
    ? { ...validateBranchDraft(draft), ...serverFieldErrors }
    : {};
  const currentScheduleInput = toScheduleInput(schedule);
  const scheduleIssues = submitted
    ? [...validateWeeklySchedule(currentScheduleInput), ...serverScheduleIssues]
    : [];

  function changeField(field: BranchField, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setServerFieldErrors((current) => {
      const next = { ...current };
      delete next[field];
      if (field === 'toaDoLat') delete next.toaDoLng;
      if (field === 'toaDoLng') delete next.toaDoLat;
      return next;
    });
    setFormError('');
  }

  function updateSchedule(
    dayNumber: number,
    update: (day: ScheduleDraft) => ScheduleDraft,
  ) {
    setSchedule((current) =>
      current.map((day) => (day.day === dayNumber ? update(day) : day)),
    );
    setServerScheduleIssues([]);
    setFormError('');
  }

  function toggleService(serviceId: string, checked: boolean) {
    setSelectedServices((current) => {
      const next = new Set(current);
      if (checked) next.add(serviceId);
      else next.delete(serviceId);
      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    setServerScheduleIssues([]);
    setFormError('');

    const errors = validateBranchDraft(draft);
    const schedulePayload = toScheduleInput(schedule);
    const scheduleErrors = validateWeeklySchedule(schedulePayload);
    if (Object.keys(errors).length > 0 || scheduleErrors.length > 0) return;

    const input: CreateBranchInput = {
      ten: draft.ten.trim().replace(/\s+/gu, ' '),
      diaChi: draft.diaChi.trim(),
      ...(draft.toaDoLat !== '' ? { toaDoLat: draft.toaDoLat } : {}),
      ...(draft.toaDoLng !== '' ? { toaDoLng: draft.toaDoLng } : {}),
      lichHoatDong: schedulePayload,
      dichVuKhamIds: services
        .filter((service) => selectedServices.has(service.dichVuKhamId))
        .map((service) => service.dichVuKhamId),
    };

    setSaving(true);
    try {
      await createBranch(input);
      onCreated();
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.maLoi === 'LICH_HOAT_DONG_KHONG_HOP_LE'
      ) {
        setServerScheduleIssues(scheduleIssuesFromApi(error.chiTiet));
      } else if (
        error instanceof ApiError &&
        error.maLoi === 'DU_LIEU_KHONG_HOP_LE'
      ) {
        const apiErrors: BranchFieldErrors = {};
        for (const fieldError of error.loi ?? []) {
          const field = fieldError.truong;
          const message = fieldErrorFromApi(field, fieldError.ma);
          if (message && (field === 'ten' || field === 'diaChi'))
            apiErrors[field] = message;
          if (message && (field === 'toaDoLat' || field === 'toaDoLng')) {
            apiErrors.toaDoLat = message;
            apiErrors.toaDoLng = message;
          }
        }
        setServerFieldErrors(apiErrors);
        if (Object.keys(apiErrors).length === 0)
          setFormError('Một số thông tin chưa hợp lệ. Vui lòng kiểm tra lại.');
      } else if (error instanceof ApiError && error.status === 403) {
        setFormError('Bạn không có quyền thêm chi nhánh.');
      } else if (error instanceof ApiError && error.status === 404) {
        setFormError(
          'Một dịch vụ đã chọn không còn khả dụng. Tải lại danh sách dịch vụ rồi thử lại.',
        );
      } else {
        setFormError(errorMessageFor(error));
      }
    } finally {
      setSaving(false);
    }
  }

  function periodControl(day: ScheduleDraft, period: 'morning' | 'afternoon') {
    const value = day[period];
    const label = period === 'morning' ? 'Buổi sáng' : 'Buổi chiều';
    const fieldLabel = `${dayLabel(day.day)} ${label.toLocaleLowerCase('vi')}`;
    return (
      <div className={styles.periodRow} key={period}>
        <label className={styles.periodToggle}>
          <input
            className={styles.checkbox}
            type="checkbox"
            checked={value.enabled}
            disabled={!day.open || saving}
            onChange={(event) => {
              const enabled = event.currentTarget.checked;
              updateSchedule(day.day, (current) => ({
                ...current,
                [period]: { ...current[period], enabled },
              }));
            }}
          />
          <span>{label}</span>
        </label>
        {day.open && value.enabled ? (
          <div className={styles.timeRange}>
            <input
              type="time"
              aria-label={`${fieldLabel} bắt đầu`}
              disabled={saving}
              value={value.start}
              onChange={(event) => {
                const start = event.currentTarget.value;
                updateSchedule(day.day, (current) => ({
                  ...current,
                  [period]: { ...current[period], start },
                }));
              }}
            />
            <span aria-hidden="true">–</span>
            <input
              type="time"
              aria-label={`${fieldLabel} kết thúc`}
              disabled={saving}
              value={value.end}
              onChange={(event) => {
                const end = event.currentTarget.value;
                updateSchedule(day.day, (current) => ({
                  ...current,
                  [period]: { ...current[period], end },
                }));
              }}
            />
          </div>
        ) : (
          <span className={styles.noReception}>
            {day.open ? 'Không nhận khám' : 'Ngày nghỉ'}
          </span>
        )}
      </div>
    );
  }

  return (
    <form
      id="branch-create-form"
      className={styles.createForm}
      aria-label="Thêm chi nhánh mới"
      noValidate
      onSubmit={(event) => void submit(event)}
    >
      <h2>Thêm chi nhánh mới</h2>

      <div className={styles.formFields}>
        <div className={styles.formFieldWide}>
          <label className={styles.formLabel} htmlFor="branch-name">
            Tên chi nhánh <span aria-hidden="true">*</span>
          </label>
          <input
            id="branch-name"
            type="text"
            autoComplete="organization"
            required
            disabled={saving}
            value={draft.ten}
            aria-invalid={Boolean(fieldErrors.ten)}
            aria-describedby={fieldErrors.ten ? 'branch-name-error' : undefined}
            onChange={(event) => changeField('ten', event.currentTarget.value)}
          />
          {fieldErrors.ten && (
            <p id="branch-name-error" className={styles.fieldError}>
              {fieldErrors.ten}
            </p>
          )}
        </div>
        <div className={styles.formFieldWide}>
          <label className={styles.formLabel} htmlFor="branch-address">
            Địa chỉ <span aria-hidden="true">*</span>
          </label>
          <input
            id="branch-address"
            type="text"
            autoComplete="street-address"
            required
            disabled={saving}
            value={draft.diaChi}
            aria-invalid={Boolean(fieldErrors.diaChi)}
            aria-describedby={
              fieldErrors.diaChi ? 'branch-address-error' : undefined
            }
            onChange={(event) =>
              changeField('diaChi', event.currentTarget.value)
            }
          />
          {fieldErrors.diaChi && (
            <p id="branch-address-error" className={styles.fieldError}>
              {fieldErrors.diaChi}
            </p>
          )}
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="branch-latitude">
            Vĩ độ (lat)
          </label>
          <input
            id="branch-latitude"
            type="text"
            inputMode="decimal"
            placeholder="10.7769"
            disabled={saving}
            value={draft.toaDoLat}
            aria-invalid={Boolean(fieldErrors.toaDoLat)}
            aria-describedby={
              fieldErrors.toaDoLat ? 'branch-coordinate-error' : undefined
            }
            onChange={(event) =>
              changeField('toaDoLat', event.currentTarget.value)
            }
          />
          {fieldErrors.toaDoLat && (
            <p id="branch-coordinate-error" className={styles.fieldError}>
              {fieldErrors.toaDoLat}
            </p>
          )}
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="branch-longitude">
            Kinh độ (lng)
          </label>
          <input
            id="branch-longitude"
            type="text"
            inputMode="decimal"
            placeholder="106.6920"
            disabled={saving}
            value={draft.toaDoLng}
            aria-invalid={Boolean(fieldErrors.toaDoLng)}
            aria-describedby={
              fieldErrors.toaDoLng ? 'branch-coordinate-error' : undefined
            }
            onChange={(event) =>
              changeField('toaDoLng', event.currentTarget.value)
            }
          />
        </div>
      </div>

      <fieldset className={styles.scheduleFieldset}>
        <legend className={styles.sectionLabel}>
          Lịch hoạt động theo tuần <span aria-hidden="true">*</span>
        </legend>
        {scheduleIssues.some((issue) => issue.thu === null) && (
          <p className={styles.fieldError} role="alert">
            {weeklyScheduleIssueMessage(
              scheduleIssues.find((issue) => issue.thu === null)?.maLoi ?? '',
            )}
          </p>
        )}
        <div className={styles.scheduleCard}>
          {schedule.map((day) => {
            const dayIssues = scheduleIssues.filter(
              (issue) => issue.thu === day.day,
            );
            const messages = Array.from(
              new Set(
                dayIssues.map((issue) =>
                  weeklyScheduleIssueMessage(issue.maLoi),
                ),
              ),
            );
            return (
              <div className={styles.dayRow} key={day.day}>
                <div className={styles.dayHeader}>
                  <strong>{dayLabel(day.day)}</strong>
                  <label
                    className={
                      day.open ? styles.openToggle : styles.closedToggle
                    }
                  >
                    <input
                      className={styles.checkbox}
                      type="checkbox"
                      checked={day.open}
                      disabled={saving}
                      onChange={(event) => {
                        const open = event.currentTarget.checked;
                        updateSchedule(day.day, (current) => ({
                          ...current,
                          open,
                        }));
                      }}
                    />
                    {day.open ? 'Hoạt động' : 'Nghỉ'}
                  </label>
                </div>
                {day.open && (
                  <div className={styles.periods}>
                    {periodControl(day, 'morning')}
                    {periodControl(day, 'afternoon')}
                  </div>
                )}
                {messages.map((message) => (
                  <p className={styles.fieldError} role="alert" key={message}>
                    {dayLabel(day.day)}: {message}
                  </p>
                ))}
              </div>
            );
          })}
        </div>
      </fieldset>

      <fieldset className={styles.servicesFieldset}>
        <legend className={styles.sectionLabel}>
          Dịch vụ khả dụng tại chi nhánh
        </legend>
        <ServicesSelector
          state={availableServices.state}
          retry={availableServices.retry}
          selected={selectedServices}
          saving={saving}
          onToggle={toggleService}
        />
      </fieldset>

      {formError && (
        <p className={styles.formError} role="alert">
          {formError}
        </p>
      )}
      <div className={styles.formActions}>
        <button
          className={styles.cancelButton}
          type="button"
          disabled={saving}
          onClick={onCancel}
        >
          Hủy
        </button>
        <button
          className={styles.submitButton}
          type="submit"
          disabled={saving || availableServices.state.status !== 'success'}
        >
          <img src="/assets/admin/branches/save.svg" alt="" />
          {saving ? 'Đang lưu…' : 'Lưu chi nhánh'}
        </button>
      </div>
    </form>
  );
}

function ServicesSelector({
  state,
  retry,
  selected,
  saving,
  onToggle,
}: {
  state: AvailableServicesState;
  retry: () => void;
  selected: Set<string>;
  saving: boolean;
  onToggle: (serviceId: string, checked: boolean) => void;
}) {
  if (state.status === 'loading')
    return <LoadingState message="Đang tải danh sách dịch vụ…" />;
  if (state.status === 'error')
    return <ErrorState error={state.error} onRetry={retry} />;
  if (state.data.length === 0)
    return (
      <p className={styles.serviceEmpty}>
        Chưa có dịch vụ trong danh mục. Có thể tạo chi nhánh mà chưa gán dịch
        vụ.
      </p>
    );

  return (
    <div className={styles.servicesGrid}>
      {state.data.map((service) => (
        <label className={styles.serviceOption} key={service.dichVuKhamId}>
          <input
            className={styles.checkbox}
            type="checkbox"
            checked={selected.has(service.dichVuKhamId)}
            disabled={saving}
            onChange={(event) =>
              onToggle(service.dichVuKhamId, event.currentTarget.checked)
            }
          />
          <span>{service.ten}</span>
        </label>
      ))}
    </div>
  );
}

export function BranchPage() {
  const adminScope = useAdminScope();
  const canCreate = adminScope.phamVi === 'ToanHeThong';
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const { state, retry } = useBranches(page, query);

  function updateSearch(value: string) {
    setSearchInput(value);
    setQuery(value.trim());
    setPage(1);
    setSuccessMessage('');
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
        <label className={styles.searchBox}>
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
        <BranchCreateForm
          key="new-branch"
          onCancel={() => setCreating(false)}
          onCreated={handleCreated}
        />
      )}

      {successMessage && (
        <p className={styles.successMessage} role="status">
          {successMessage}
        </p>
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
                <BranchCard key={branch.chiNhanhId} branch={branch} />
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
