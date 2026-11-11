import {
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createLeaveRequest, type LeaveKind } from '../api/leave-api';
import {
  SHIFT_LABELS,
  SHIFT_ORDER,
} from '../../../shared/schedule/shift-labels';
import { todayVn } from '../../../shared/schedule/week';
import { ModalFrame } from '../components/modal-frame';
import { describeLeaveSubmitError } from './leave-errors';
import {
  EMPTY_LEAVE_FORM,
  toCreateInput,
  validateLeaveForm,
  type LeaveField,
  type LeaveFieldErrors,
  type LeaveFormValues,
} from './leave-form';

export interface LeaveRequestDialogProps {
  // Nút "Yêu cầu nghỉ" đã mở hộp thoại: nhận lại focus khi đóng
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  // POST trả 201: nơi gọi đóng hộp thoại, báo thành công và làm mới lịch + lịch sử
  onCreated: () => void;
}

const INPUT =
  'min-h-11 w-full rounded-lg border bg-white px-3 text-sm text-gray-900 aria-[invalid=true]:border-danger';
const NORMAL_BORDER = 'border-gray-300';
const BUTTON =
  'min-h-11 rounded-lg px-4 text-sm font-semibold transition-colors disabled:opacity-60';

// Hộp "Yêu cầu nghỉ lịch làm việc" (Figma `468:2`; WN-01…WN-06, WN-10). Hai loại: "Cả ngày (có thể nhiều ngày)" (từ ngày – đến ngày) và "Theo ca"
// (một ngày + ca; Figma chưa có frame "Theo ca", Q37 [đề xuất]). Lỗi 400 `loi[]` hiện dưới đúng ô; lỗi nghiệp vụ 409 và lỗi mạng hiện ở dải cảnh báo
// trên hàng nút, DỮ LIỆU ĐÃ NHẬP ĐƯỢC GIỮ (WN-10). Chống bấm đúp bằng ref (state chưa kịp render giữa hai lần bấm, WN-05).
export function LeaveRequestDialog({
  returnFocusRef,
  onClose,
  onCreated,
}: LeaveRequestDialogProps) {
  const [values, setValues] = useState<LeaveFormValues>(EMPTY_LEAVE_FORM);
  const [fieldErrors, setFieldErrors] = useState<LeaveFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const kindRef = useRef<HTMLSelectElement>(null);
  const today = todayVn();
  const single = values.hinhThuc === 'TheoCa';

  function change<K extends keyof LeaveFormValues>(
    key: K,
    value: LeaveFormValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
    // Sửa ô nào thì bỏ lỗi của ô đó (và dải lỗi chung đã cũ)
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    const errors = validateLeaveForm(values, today);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError(null);
      return;
    }
    submitting.current = true;
    setPending(true);
    setFormError(null);
    try {
      await createLeaveRequest(toCreateInput(values));
      onCreated();
    } catch (error) {
      const failure = describeLeaveSubmitError(error);
      setFieldErrors(failure.fields);
      setFormError(failure.message);
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  const border = (field: LeaveField) =>
    fieldErrors[field] ? '' : NORMAL_BORDER;
  // Ô lỗi báo cho trình đọc màn hình: aria-invalid + liên kết tới câu lỗi dưới ô
  const invalid = (field: LeaveField, id: string) => ({
    'aria-invalid': fieldErrors[field] ? true : undefined,
    'aria-describedby': fieldErrors[field] ? `${id}-error` : undefined,
  });

  return (
    <ModalFrame
      title="Yêu cầu nghỉ lịch làm việc"
      initialFocusRef={kindRef}
      returnFocusRef={returnFocusRef}
      onClose={onClose}
      busy={pending}
      showCloseIcon
      widthClass="max-w-md"
    >
      <form
        noValidate
        onSubmit={(event) => void handleSubmit(event)}
        className="flex min-h-0 flex-col"
      >
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-6 py-5">
          <Field label="Loại nghỉ" error={fieldErrors.hinhThuc} id="leave-kind">
            <select
              id="leave-kind"
              ref={kindRef}
              {...invalid('hinhThuc', 'leave-kind')}
              className={`${INPUT} ${border('hinhThuc')}`}
              value={values.hinhThuc}
              disabled={pending}
              onChange={(event) => {
                const kind = event.target.value as LeaveKind;
                setValues((current) => ({
                  ...current,
                  hinhThuc: kind,
                  // Đổi loại thì ô không còn dùng được xoá đi để không gửi nhầm (CA_KHONG_DUOC_CHON, NGHI_THEO_CA_CHI_MOT_NGAY)
                  ca: kind === 'TheoCa' ? current.ca : '',
                  denNgay: kind === 'TheoCa' ? '' : current.denNgay,
                }));
                setFieldErrors({});
                setFormError(null);
              }}
            >
              <option value="CaNgay">Cả ngày (có thể nhiều ngày)</option>
              <option value="TheoCa">Theo ca (một ngày)</option>
            </select>
          </Field>

          {single ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ngày" error={fieldErrors.tuNgay} id="leave-from">
                <input
                  id="leave-from"
                  type="date"
                  min={today}
                  {...invalid('tuNgay', 'leave-from')}
                  className={`${INPUT} ${border('tuNgay')}`}
                  value={values.tuNgay}
                  disabled={pending}
                  onChange={(event) => change('tuNgay', event.target.value)}
                />
              </Field>
              <Field label="Ca" error={fieldErrors.ca} id="leave-shift">
                <select
                  id="leave-shift"
                  {...invalid('ca', 'leave-shift')}
                  className={`${INPUT} ${border('ca')}`}
                  value={values.ca}
                  disabled={pending}
                  onChange={(event) =>
                    change('ca', event.target.value as LeaveFormValues['ca'])
                  }
                >
                  <option value="">Chọn ca</option>
                  {SHIFT_ORDER.map((ca) => (
                    <option key={ca} value={ca}>
                      {SHIFT_LABELS[ca]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Từ ngày" error={fieldErrors.tuNgay} id="leave-from">
                <input
                  id="leave-from"
                  type="date"
                  min={today}
                  {...invalid('tuNgay', 'leave-from')}
                  className={`${INPUT} ${border('tuNgay')}`}
                  value={values.tuNgay}
                  disabled={pending}
                  onChange={(event) => change('tuNgay', event.target.value)}
                />
              </Field>
              <Field label="Đến ngày" error={fieldErrors.denNgay} id="leave-to">
                <input
                  id="leave-to"
                  type="date"
                  min={values.tuNgay || today}
                  {...invalid('denNgay', 'leave-to')}
                  className={`${INPUT} ${border('denNgay')}`}
                  value={values.denNgay}
                  disabled={pending}
                  onChange={(event) => change('denNgay', event.target.value)}
                />
              </Field>
            </div>
          )}

          <Field label="Lý do" error={fieldErrors.lyDo} id="leave-reason">
            <textarea
              id="leave-reason"
              rows={3}
              {...invalid('lyDo', 'leave-reason')}
              className={`${INPUT} ${border('lyDo')} py-2`}
              placeholder="Vui lòng nhập lý do nghỉ..."
              value={values.lyDo}
              disabled={pending}
              onChange={(event) => change('lyDo', event.target.value)}
            />
          </Field>

          {formError !== null && (
            <p
              role="alert"
              className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong"
            >
              {formError}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 border-t border-gray-100 px-6 py-4">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className={`${BUTTON} border border-gray-200 bg-white text-gray-900 hover:bg-gray-50`}
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={pending}
            className={`${BUTTON} bg-brand-strong text-white hover:bg-cyan-800`}
          >
            {pending ? 'Đang gửi…' : 'Gửi yêu cầu'}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}

// Nhãn + ô + lỗi dưới ô; dấu * đỏ ở nhãn như Figma (ô nào cũng bắt buộc)
function Field({
  label,
  error,
  id,
  children,
}: {
  label: string;
  error?: string;
  id: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-gray-700">
        {label} <span className="text-danger">*</span>
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
