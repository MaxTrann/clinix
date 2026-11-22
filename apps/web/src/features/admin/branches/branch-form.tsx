import { useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../../../shared/api/errors';
import { errorMessageFor } from '../../../shared/api/error-message';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { useFocusFirstInvalid } from '../hooks/use-focus-first-invalid';
import { createBranch, updateBranch } from './branch-service';
import { dayLabel } from './branch-schedule-format';
import {
  scheduleIssuesFromApi,
  toPeriodInput,
  validateWeeklySchedule,
  weeklyScheduleIssueMessage,
  type WeeklyScheduleIssue,
} from './branch-schedule-validation';
import type {
  Branch,
  BranchSchedule,
  BranchScheduleInput,
  BranchUpdateResult,
  CreateBranchInput,
} from './branch-types';
import {
  useAvailableServices,
  type AvailableServicesState,
} from './use-branches';
import { applyQuickSchedule, type QuickApplyInput } from './quick-apply';
import { QuickApplyPanel } from './quick-apply-panel';
import type { PeriodDraft, ScheduleDraft } from './schedule-draft';
import { TimeInput24 } from './time-input-24';
import styles from './branches.module.css';

// Form chi nhánh (tách khỏi branch-page.tsx ở F6b để dùng chung cho Thêm mới và Sửa lịch / dịch vụ, Figma 543:2 và 544:2).
// Sửa: điền sẵn dữ liệu đang áp dụng; gửi lại đủ form, máy chủ (B8) tự so sánh để biết phần nào lưu ngay, phần nào thành yêu cầu chờ duyệt (Q2).

const COORDINATE_PAIR_MESSAGE = 'Nhập đồng thời vĩ độ và kinh độ.';

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

// Lịch đang áp dụng ⇒ bản nháp. Máy chủ trả giờ 'HH:mm:ss', ô nhập dùng 'HH:mm'. Thứ chưa khai báo (`hoatDong` null hay thiếu dòng)
// hiện là Nghỉ, vì quy tắc nghiệp vụ coi thứ chưa khai báo là không nhận khám.
function scheduleDraftOf(schedule: BranchSchedule[]): ScheduleDraft[] {
  const period = (value: BranchSchedule['sang']): PeriodDraft => ({
    enabled: value !== null,
    start: value?.batDau.slice(0, 5) ?? '',
    end: value?.ketThuc.slice(0, 5) ?? '',
  });
  return Array.from({ length: 7 }, (_, index) => {
    const row = schedule.find((item) => item.thuTrongTuan === index + 1);
    return {
      day: index + 1,
      open: row?.hoatDong === true,
      morning: period(row?.sang ?? null),
      afternoon: period(row?.chieu ?? null),
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
    errors.toaDoLat = COORDINATE_PAIR_MESSAGE;
    errors.toaDoLng = COORDINATE_PAIR_MESSAGE;
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
      ? COORDINATE_PAIR_MESSAGE
      : 'Tọa độ không hợp lệ.';
  }
  return undefined;
}

/** Lỗi nghiệp vụ riêng của Sửa (PLAN admin 5.9); trả `undefined` thì dùng cách xử lý chung của form */
function updateErrorMessage(error: ApiError): string | undefined {
  switch (error.maLoi) {
    case 'YEU_CAU_DANG_CHO':
      return 'Chi nhánh đang có yêu cầu thay đổi chưa hoàn tất. Vui lòng chờ xử lý xong.';
    case 'DICH_VU_CON_BAC_SI':
      return 'Không thể bỏ dịch vụ: còn bác sĩ đang dùng làm dịch vụ khám chính.';
    case 'KHONG_CO_THAY_DOI':
      return 'Không có thay đổi nào để lưu.';
    default:
      return error.status === 404 && error.maLoi === 'KHONG_TIM_THAY'
        ? 'Không tìm thấy chi nhánh hoặc một dịch vụ đã chọn. Tải lại trang rồi thử lại.'
        : undefined;
  }
}

/**
 * `branch` có ⇒ Sửa lịch / dịch vụ của chi nhánh đó; không có ⇒ Thêm chi nhánh mới.
 * `onSaved` nhận phản hồi của Sửa (để trang báo phần đã lưu và phần chờ duyệt); Thêm mới thì nhận `null`.
 */
export function BranchForm({
  branch,
  onCancel,
  onSaved,
}: {
  branch?: Branch;
  onCancel: () => void;
  onSaved: (result: BranchUpdateResult | null) => void;
}) {
  // Tiền tố id cho các ô: form Sửa có thể mở cùng lúc với form Thêm mới nên id phải khác nhau
  const idp = branch ? `branch-edit-${branch.chiNhanhId}` : 'branch';
  const availableServices = useAvailableServices();
  const services =
    availableServices.state.status === 'success'
      ? availableServices.state.data
      : [];
  const [draft, setDraft] = useState<BranchDraft>(() => ({
    ten: branch?.ten ?? '',
    diaChi: branch?.diaChi ?? '',
    toaDoLat: branch?.toaDoLat ?? '',
    toaDoLng: branch?.toaDoLng ?? '',
  }));
  const [schedule, setSchedule] = useState(() =>
    branch ? scheduleDraftOf(branch.lichHoatDong) : defaultSchedule(),
  );
  const [selectedServices, setSelectedServices] = useState<Set<string>>(
    () => new Set(branch?.dichVuKham.map((service) => service.dichVuKhamId)),
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
  const formRef = useRef<HTMLFormElement>(null);
  // Tăng khi bấm Lưu mà có ô lỗi (phía form hoặc từ máy chủ): đưa focus vào ô lỗi đầu tiên, không cướp focus lúc đang gõ (admin PR2 6.2)
  const [focusTick, setFocusTick] = useState(0);
  useFocusFirstInvalid(formRef, focusTick);

  const fieldErrors = submitted
    ? { ...validateBranchDraft(draft), ...serverFieldErrors }
    : {};
  // Lỗi "nhập đồng thời" gắn cả hai ô nhưng chỉ hiện MỘT lần (dưới vĩ độ); lỗi riêng của kinh độ hiện dưới ô kinh độ
  const coordinatePair =
    fieldErrors.toaDoLat === COORDINATE_PAIR_MESSAGE &&
    fieldErrors.toaDoLng === COORDINATE_PAIR_MESSAGE;
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

  // Panel "Áp dụng nhanh": chỉ sửa bản nháp lịch (vẫn 7 dòng); hợp lệ từng ngày do validateWeeklySchedule kiểm lúc Lưu
  function applyQuick(input: QuickApplyInput) {
    setSchedule((current) => applyQuickSchedule(current, input));
    setServerScheduleIssues([]);
    setFormError('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    setServerScheduleIssues([]);
    setFormError('');

    const errors = validateBranchDraft(draft);
    const schedulePayload = toScheduleInput(schedule);
    const scheduleErrors = validateWeeklySchedule(schedulePayload);
    if (Object.keys(errors).length > 0 || scheduleErrors.length > 0) {
      setFocusTick((count) => count + 1);
      return;
    }

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
      if (branch) onSaved(await updateBranch(branch.chiNhanhId, input));
      else {
        await createBranch(input);
        onSaved(null);
      }
    } catch (error) {
      const updateMessage =
        branch && error instanceof ApiError
          ? updateErrorMessage(error)
          : undefined;
      if (updateMessage) {
        setFormError(updateMessage);
      } else if (
        error instanceof ApiError &&
        error.maLoi === 'LICH_HOAT_DONG_KHONG_HOP_LE'
      ) {
        const issues = scheduleIssuesFromApi(error.chiTiet);
        setServerScheduleIssues(issues);
        // Máy chủ không chỉ ra ngày nào thì không có chỗ nào khác để báo: banner chung (trước đây im lặng)
        if (issues.length === 0)
          setFormError(
            'Lịch hoạt động chưa hợp lệ. Vui lòng kiểm tra lại các ngày.',
          );
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
            // Lỗi "đi theo cặp" gắn cả hai ô; lỗi khác chỉ gắn đúng ô được báo (trước đây đánh dấu lây sang ô còn lại)
            if (fieldError.ma === 'TOA_DO_PHAI_DI_THEO_CAP') {
              apiErrors.toaDoLat = message;
              apiErrors.toaDoLng = message;
            } else {
              apiErrors[field] = message;
            }
          }
        }
        setServerFieldErrors(apiErrors);
        if (Object.keys(apiErrors).length === 0)
          setFormError('Một số thông tin chưa hợp lệ. Vui lòng kiểm tra lại.');
        else setFocusTick((count) => count + 1);
      } else if (error instanceof ApiError && error.status === 403) {
        setFormError(
          branch
            ? 'Bạn không có quyền sửa chi nhánh này.'
            : 'Bạn không có quyền thêm chi nhánh.',
        );
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
            <TimeInput24
              aria-label={`${fieldLabel} bắt đầu`}
              disabled={saving}
              value={value.start}
              onChange={(start) => {
                updateSchedule(day.day, (current) => ({
                  ...current,
                  [period]: { ...current[period], start },
                }));
              }}
            />
            <span aria-hidden="true">–</span>
            <TimeInput24
              aria-label={`${fieldLabel} kết thúc`}
              disabled={saving}
              value={value.end}
              onChange={(end) => {
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
      ref={formRef}
      id={branch ? `${idp}-form` : 'branch-create-form'}
      className={styles.createForm}
      aria-label={branch ? `Sửa: ${branch.ten}` : 'Thêm chi nhánh mới'}
      noValidate
      onSubmit={(event) => void submit(event)}
    >
      <h2>{branch ? `Sửa: ${branch.ten}` : 'Thêm chi nhánh mới'}</h2>

      <div className={styles.formFields}>
        <div className={styles.formFieldWide}>
          <label className={styles.formLabel} htmlFor={`${idp}-name`}>
            Tên chi nhánh <span aria-hidden="true">*</span>
          </label>
          <input
            id={`${idp}-name`}
            type="text"
            autoComplete="organization"
            required
            disabled={saving}
            value={draft.ten}
            aria-invalid={Boolean(fieldErrors.ten)}
            aria-describedby={fieldErrors.ten ? `${idp}-name-error` : undefined}
            onChange={(event) => changeField('ten', event.currentTarget.value)}
          />
          {fieldErrors.ten && (
            <p
              id={`${idp}-name-error`}
              className={styles.fieldError}
              role="alert"
            >
              {fieldErrors.ten}
            </p>
          )}
        </div>
        <div className={styles.formFieldWide}>
          <label className={styles.formLabel} htmlFor={`${idp}-address`}>
            Địa chỉ <span aria-hidden="true">*</span>
          </label>
          <input
            id={`${idp}-address`}
            type="text"
            autoComplete="street-address"
            required
            disabled={saving}
            value={draft.diaChi}
            aria-invalid={Boolean(fieldErrors.diaChi)}
            aria-describedby={
              fieldErrors.diaChi ? `${idp}-address-error` : undefined
            }
            onChange={(event) =>
              changeField('diaChi', event.currentTarget.value)
            }
          />
          {fieldErrors.diaChi && (
            <p
              id={`${idp}-address-error`}
              className={styles.fieldError}
              role="alert"
            >
              {fieldErrors.diaChi}
            </p>
          )}
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor={`${idp}-latitude`}>
            Vĩ độ (lat)
          </label>
          <input
            id={`${idp}-latitude`}
            type="text"
            inputMode="decimal"
            placeholder="10.7769"
            disabled={saving}
            value={draft.toaDoLat}
            aria-invalid={Boolean(fieldErrors.toaDoLat)}
            aria-describedby={
              fieldErrors.toaDoLat ? `${idp}-coordinate-error` : undefined
            }
            onChange={(event) =>
              changeField('toaDoLat', event.currentTarget.value)
            }
          />
          {fieldErrors.toaDoLat && (
            <p
              id={`${idp}-coordinate-error`}
              className={styles.fieldError}
              role="alert"
            >
              {fieldErrors.toaDoLat}
            </p>
          )}
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor={`${idp}-longitude`}>
            Kinh độ (lng)
          </label>
          <input
            id={`${idp}-longitude`}
            type="text"
            inputMode="decimal"
            placeholder="106.6920"
            disabled={saving}
            value={draft.toaDoLng}
            aria-invalid={Boolean(fieldErrors.toaDoLng)}
            aria-describedby={
              fieldErrors.toaDoLng
                ? coordinatePair
                  ? `${idp}-coordinate-error`
                  : `${idp}-longitude-error`
                : undefined
            }
            onChange={(event) =>
              changeField('toaDoLng', event.currentTarget.value)
            }
          />
          {fieldErrors.toaDoLng && !coordinatePair && (
            <p
              id={`${idp}-longitude-error`}
              className={styles.fieldError}
              role="alert"
            >
              {fieldErrors.toaDoLng}
            </p>
          )}
        </div>
      </div>

      <fieldset className={styles.scheduleFieldset}>
        <legend className={styles.sectionLabel}>
          Lịch hoạt động theo tuần <span aria-hidden="true">*</span>
        </legend>
        <QuickApplyPanel disabled={saving} onApply={applyQuick} />
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
