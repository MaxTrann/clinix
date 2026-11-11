import {
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { todayVn } from '../../../../../shared/schedule/week';
import {
  assignShiftRule,
  MAX_DOCTORS_PER_RULE,
  type ShiftAssignmentResult,
} from '../../../api/shift-assignment-api';
import type { ReceptionDoctor } from '../../../api/reception-api';
import { ModalFrame } from '../../../components/modal-frame';
import {
  ASSIGN_MESSAGES,
  CA_CHOICE_LABELS,
  dateErrors,
  isRuleComplete,
  toShiftRule,
  WEEKDAY_OPTIONS,
  type AssignFormValues,
  type CaChoice,
} from './assign-form';
import {
  describeAssignError,
  describeViolation,
  type AssignFailure,
} from './assign-errors';
import { DoctorPicker } from './doctor-picker';
import { useAssignPreview } from './use-assign-preview';

export interface AssignDialogProps {
  // Bác sĩ có thể phân công (đã bỏ bác sĩ ngừng hoạt động); phạm vi do server ép
  doctors: readonly ReceptionDoctor[];
  // Admin Toàn hệ thống: danh sách chi nhánh để lọc; Admin Chi nhánh: không có, hiện chi nhánh cố định
  branches?: readonly { chiNhanhId: string; ten: string }[];
  fixedBranchName?: string;
  // Giá trị ban đầu: rỗng (nút "Phân công ca") hoặc điền sẵn từ ô "+" (WA-05)
  initial: AssignFormValues;
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  // POST trả 201: nơi gọi đóng hộp, báo thành công và làm mới lưới (WA-04)
  onAssigned: (result: ShiftAssignmentResult) => void;
}

const FIELD =
  'min-h-10 w-full rounded-lg border bg-white px-3 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500';
const NORMAL_BORDER = 'border-gray-300';
const CHOICE_BUTTON =
  'min-h-10 rounded-lg border px-4 text-sm font-medium transition-colors disabled:opacity-60';

// Hộp "Phân công ca làm việc" (Figma `516:2`; WA-02, WA-03, WA-04, WA-05, WA-15; PLAN 5.3): quy tắc lặp = khoảng ngày × thứ trong tuần × ca ("Cả ngày" = Sáng + Chiều)
// × nhiều bác sĩ. Chi nhánh và chuyên khoa CHỈ lọc danh sách bác sĩ (chi nhánh của ca là chi nhánh hiện tại của bác sĩ, D12). Không có "Ghi chú" (Q10).
// "Xem trước" gọi B2 sau khi đủ điều kiện; "Phân công" là tất cả hoặc không: vi phạm (`viPham[]`) được liệt kê theo bác sĩ/ngày/ca và KHÔNG ca nào được ghi.
export function AssignDialog({
  doctors,
  branches,
  fixedBranchName,
  initial,
  returnFocusRef,
  onClose,
  onAssigned,
}: AssignDialogProps) {
  const [values, setValues] = useState<AssignFormValues>(initial);
  const [branchId, setBranchId] = useState('all');
  const [specialtyId, setSpecialtyId] = useState('all');
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<AssignFailure | null>(null);
  const submitting = useRef(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const today = todayVn();

  const rule = isRuleComplete(values, today) ? toShiftRule(values) : null;
  const preview = useAssignPreview(rule);
  const errors = dateErrors(values, today);
  const doctorsById = useMemo(
    () => new Map(doctors.map((d) => [d.bacSiId, d])),
    [doctors],
  );
  const selected = values.bacSiIds
    .map((id) => doctorsById.get(id))
    .filter((d): d is ReceptionDoctor => d !== undefined);
  const specialties = [
    ...new Map(
      doctors.map((d) => [d.chuyenKhoa.chuyenKhoaId, d.chuyenKhoa.ten]),
    ),
  ];
  const listed = doctors.filter(
    (d) =>
      (branchId === 'all' || d.chiNhanh.chiNhanhId === branchId) &&
      (specialtyId === 'all' || d.chuyenKhoa.chuyenKhoaId === specialtyId),
  );
  const previewHasViolations =
    preview.status === 'success' && preview.data.tongSoViPham > 0;
  const canSubmit = rule !== null && !pending && !previewHasViolations;

  function update(patch: Partial<AssignFormValues>) {
    setValues((current) => ({ ...current, ...patch }));
    // Sửa quy tắc thì lỗi của lần gửi trước đã cũ
    setFailure(null);
  }

  function toggleWeekday(value: number) {
    update({
      thuTrongTuan: values.thuTrongTuan.includes(value)
        ? values.thuTrongTuan.filter((day) => day !== value)
        : [...values.thuTrongTuan, value],
    });
  }

  function toggleDoctor(doctor: ReceptionDoctor) {
    const has = values.bacSiIds.includes(doctor.bacSiId);
    update({
      bacSiIds: has
        ? values.bacSiIds.filter((id) => id !== doctor.bacSiId)
        : [...values.bacSiIds, doctor.bacSiId],
    });
  }

  async function submit() {
    if (!canSubmit || submitting.current || rule === null) return;
    submitting.current = true;
    setPending(true);
    setFailure(null);
    try {
      onAssigned(await assignShiftRule(rule));
    } catch (error) {
      setFailure(describeAssignError(error));
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  const doctorName = (id: string) => doctorsById.get(id)?.hoTen;

  return (
    <ModalFrame
      title="Phân công ca làm việc"
      subtitle="Chọn điều kiện và bác sĩ — hệ thống tạo quy tắc cho từng người."
      subtitleClass="text-gray-500"
      initialFocusRef={firstFieldRef}
      returnFocusRef={returnFocusRef}
      onClose={onClose}
      busy={pending}
      showCloseIcon
      widthClass="max-w-5xl"
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 gap-4 px-6 py-4 md:grid-cols-4">
          <Field label="Chi nhánh" id="assign-branch">
            {fixedBranchName !== undefined ? (
              <select
                id="assign-branch"
                disabled
                className={`${FIELD} ${NORMAL_BORDER}`}
              >
                <option>{fixedBranchName}</option>
              </select>
            ) : (
              <select
                id="assign-branch"
                className={`${FIELD} ${NORMAL_BORDER}`}
                value={branchId}
                disabled={pending}
                onChange={(event) => setBranchId(event.target.value)}
              >
                <option value="all">Tất cả chi nhánh</option>
                {branches?.map((branch) => (
                  <option key={branch.chiNhanhId} value={branch.chiNhanhId}>
                    {branch.ten}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Chuyên khoa" id="assign-specialty">
            <select
              id="assign-specialty"
              className={`${FIELD} ${NORMAL_BORDER}`}
              value={specialtyId}
              disabled={pending}
              onChange={(event) => setSpecialtyId(event.target.value)}
            >
              <option value="all">Tất cả chuyên khoa</option>
              {specialties.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Từ ngày"
            required
            error={errors.tuNgay}
            id="assign-from"
          >
            <input
              id="assign-from"
              ref={firstFieldRef}
              type="date"
              min={today}
              value={values.tuNgay}
              disabled={pending}
              aria-invalid={errors.tuNgay ? true : undefined}
              aria-describedby={errors.tuNgay ? 'assign-from-error' : undefined}
              className={`${FIELD} ${errors.tuNgay ? 'border-danger' : NORMAL_BORDER}`}
              onChange={(event) => update({ tuNgay: event.target.value })}
            />
          </Field>
          <Field
            label="Đến ngày"
            required
            error={errors.denNgay}
            id="assign-to"
          >
            <input
              id="assign-to"
              type="date"
              min={values.tuNgay || today}
              value={values.denNgay}
              disabled={pending}
              aria-invalid={errors.denNgay ? true : undefined}
              aria-describedby={errors.denNgay ? 'assign-to-error' : undefined}
              className={`${FIELD} ${errors.denNgay ? 'border-danger' : NORMAL_BORDER}`}
              onChange={(event) => update({ denNgay: event.target.value })}
            />
          </Field>

          <div className="md:col-span-2">
            <p className="mb-1.5 text-xs font-medium text-gray-700">
              Thứ trong tuần <span className="text-danger">*</span>
            </p>
            <div
              role="group"
              aria-label="Thứ trong tuần"
              className="flex flex-wrap gap-2"
            >
              {WEEKDAY_OPTIONS.map((day) => {
                const on = values.thuTrongTuan.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    aria-pressed={on}
                    disabled={pending}
                    onClick={() => toggleWeekday(day.value)}
                    className={`${CHOICE_BUTTON} min-w-11 px-2 ${
                      on
                        ? 'border-brand-strong bg-brand-strong text-white'
                        : 'border-gray-200 bg-white text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="md:col-span-2">
            <p className="mb-1.5 text-xs font-medium text-gray-700">
              Ca làm việc <span className="text-danger">*</span>
            </p>
            <div
              role="group"
              aria-label="Ca làm việc"
              className="grid grid-cols-3 gap-2"
            >
              {(Object.keys(CA_CHOICE_LABELS) as CaChoice[]).map((choice) => (
                <button
                  key={choice}
                  type="button"
                  aria-pressed={values.ca === choice}
                  disabled={pending}
                  onClick={() => update({ ca: choice })}
                  className={`${CHOICE_BUTTON} ${
                    values.ca === choice
                      ? 'border-brand-strong bg-brand-strong text-white'
                      : 'border-gray-200 bg-white text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  {CA_CHOICE_LABELS[choice]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DoctorPicker
          doctors={listed}
          selected={selected}
          query={query}
          onQueryChange={setQuery}
          onToggle={toggleDoctor}
          full={values.bacSiIds.length >= MAX_DOCTORS_PER_RULE}
          disabled={pending}
        />
        {values.bacSiIds.length >= MAX_DOCTORS_PER_RULE && (
          <p className="px-6 pb-2 text-xs text-gray-600">
            {ASSIGN_MESSAGES.tooManyDoctors}
          </p>
        )}

        <section
          aria-label="Xem trước"
          className="mx-6 my-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3"
        >
          <h3 className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
            Xem trước
          </h3>
          <PreviewBody
            preview={preview}
            failure={failure}
            doctorName={doctorName}
            doctorCount={values.bacSiIds.length}
          />
        </section>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-gray-100 px-6 py-4">
        <button
          type="button"
          disabled={pending}
          onClick={onClose}
          className="min-h-11 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-50 disabled:opacity-60"
        >
          Hủy
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => void submit()}
          className="min-h-11 rounded-lg bg-brand-strong text-sm font-semibold text-white transition-colors hover:bg-cyan-800 disabled:bg-gray-200 disabled:text-gray-500"
        >
          {pending ? 'Đang phân công…' : 'Phân công'}
        </button>
      </div>
    </ModalFrame>
  );
}

function Field({
  label,
  required = false,
  error,
  id,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  id: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-gray-700">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      {children}
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="text-xs text-danger-strong"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function PreviewBody({
  preview,
  failure,
  doctorName,
  doctorCount,
}: {
  preview: ReturnType<typeof useAssignPreview>;
  failure: AssignFailure | null;
  doctorName: (id: string) => string | undefined;
  doctorCount: number;
}) {
  // Kết quả của lần bấm "Phân công" (lỗi thật) được ưu tiên hơn xem trước
  if (failure !== null) {
    return (
      <div role="alert" className="mt-1 text-sm text-danger-strong">
        <p>{failure.message}</p>
        <ViolationList
          violations={failure.violations}
          total={failure.total}
          doctorName={doctorName}
        />
      </div>
    );
  }
  if (preview.status === 'idle')
    return (
      <p className="mt-1 text-sm text-gray-500">
        Điền đủ điều kiện và chọn ít nhất 1 bác sĩ
      </p>
    );
  if (preview.status === 'loading')
    return (
      <p role="status" className="mt-1 text-sm text-gray-600">
        Đang tính…
      </p>
    );
  if (preview.status === 'error') {
    const failureOfPreview = describeAssignError(preview.error);
    return (
      <p role="alert" className="mt-1 text-sm text-danger-strong">
        Không xem trước được: {failureOfPreview.message}
      </p>
    );
  }
  const { soCa, soKhungGio, tongSoViPham, viPham } = preview.data;
  return (
    <div className="mt-1 text-sm text-gray-900">
      <p>
        Sẽ tạo <strong>{soCa - tongSoViPham}</strong> ca (
        <strong>{soKhungGio}</strong> khung giờ) cho {doctorCount} bác sĩ.
      </p>
      {tongSoViPham > 0 && (
        <div role="alert" className="mt-2 text-danger-strong">
          <p>
            Có {tongSoViPham} ca không phân công được; nếu bấm Phân công thì
            chưa ca nào được ghi.
          </p>
          <ViolationList
            violations={viPham}
            total={tongSoViPham}
            doctorName={doctorName}
          />
        </div>
      )}
    </div>
  );
}

function ViolationList({
  violations,
  total,
  doctorName,
}: {
  violations: Parameters<typeof describeViolation>[0][];
  total: number;
  doctorName: (id: string) => string | undefined;
}) {
  if (violations.length === 0) return null;
  return (
    <>
      <ul
        aria-label="Ca không phân công được"
        className="mt-2 max-h-40 list-disc space-y-1 overflow-y-auto pl-5 text-xs"
      >
        {violations.map((violation) => (
          <li key={`${violation.bacSiId}|${violation.ngay}|${violation.ca}`}>
            {describeViolation(violation, doctorName)}
          </li>
        ))}
      </ul>
      {total > violations.length && (
        <p className="mt-1 text-xs">
          … và {total - violations.length} ca khác.
        </p>
      )}
    </>
  );
}
