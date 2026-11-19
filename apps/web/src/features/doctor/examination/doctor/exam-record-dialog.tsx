import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from 'react';
import { DateField } from '../../../../shared/masked-input/date-field';
import { ModalFrame } from '../../components/modal-frame';
import { fieldMessage, formatCount, SAVE_TEXT } from '../exam-messages';
import {
  EXAM_TEXT_MAX,
  followUpRange,
  reconcile,
  textLength,
  TEXT_FIELDS,
  valuesOf,
  visitDate,
  type ExamRecordNote,
  type FieldErrors,
  type RecordField,
  type RecordValues,
  type TextField,
} from '../exam-record-form';
import { RECORD_TEXT } from '../exam-record-text';
import { useSaveRecord } from '../use-save-record';
import { RecordBody } from './record-body';

// Bản nháp giữ trong BỘ NHỚ của thẻ (không kho trình duyệt, URL: BDK-09) khi hộp bị đóng sau một lỗi: mở lại thì dùng nếu `baseToken` còn bằng `capNhatLanCuoi` hiện tại, ngược lại bỏ.
export interface ExamRecordDraft {
  values: RecordValues;
  baseToken: string | null;
}

export interface ExamRecordDialogProps {
  maLichHen: string;
  // Họ tên người khám (phụ đề `<mã lịch> · <họ tên>`, Figma `460:389`); kiểu `string`, không import kiểu của booking (Q20 phương án C)
  nguoiKham: string;
  // Thời điểm khám (ISO 8601 UTC): tính ngày khám theo giờ Việt Nam để chặn ngày tái khám ngoài khoảng
  thoiGian: string;
  // Hồ sơ MỚI NHẤT của máy chủ: đổi khi trang tải lại chi tiết (nơi gọi truyền `ghiChuKham` của chi tiết)
  note: ExamRecordNote | null;
  // Giá trị các ô và token `capNhatLanCuoi` đã thấy lúc mở (bản máy chủ hoặc bản nháp); `baseToken` `null` = hộp GHI MỚI
  initial: ExamRecordDraft;
  // Nút đã mở hộp: nhận lại tiêu điểm khi đóng
  returnFocusRef: RefObject<HTMLElement | null>;
  // Đóng hộp (Hủy, ×, Esc); `draft` khác `null` khi còn lỗi chưa xử lý để thẻ giữ nội dung cho lần mở sau
  onClose: (draft: ExamRecordDraft | null) => void;
  // 200 (hoặc tải lại thấy hồ sơ đã trùng nội dung đang gõ): thẻ đóng hộp và báo "Đã lưu hồ sơ khám."
  onSaved: () => void;
  // Máy chủ đã đổi hay dữ liệu đang hiện chắc chắn lệch: nơi gọi tải lại chi tiết
  onChanged: () => void;
}

const LABEL_OF: Record<TextField, string> = {
  trieuChung: RECORD_TEXT.labels.symptoms,
  chanDoanSoBo: RECORD_TEXT.labels.diagnosis,
  huongXuLy: RECORD_TEXT.labels.advice,
};

// Khoá lớp cỡ Figma `460:383`: nhãn 13,125 đậm vừa `#364153`; ô cao tối thiểu 80, bo 13,375, đệm 11,25 × 9,375, chữ 13,125 cao dòng 21,33; gợi ý `gray-500` (ADR 0004: `#99a1af` chỉ đạt 2,6:1).
const LABEL = 'pb-1.5 text-sm font-medium text-gray-700';
const CONTROL =
  'block rounded-[13.375px] border bg-white px-3 py-2.5 text-sm leading-relaxed text-gray-900 placeholder:text-gray-500 aria-[invalid=true]:border-danger';
const NORMAL_BORDER = 'border-gray-300';
const BUTTON =
  'rounded-[13.375px] px-[15px] py-[7.5px] text-sm whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60';
const SECONDARY = `${BUTTON} border border-gray-300 font-medium text-gray-700 transition-colors hover:bg-gray-50`;

function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <p id={id} role="alert" className="text-xs text-danger-strong">
      {message}
    </p>
  );
}

// Ô chữ nhiều dòng: nhãn có `*` đỏ (chỉ để nhìn; `required` đã báo cho trình đọc màn hình), lỗi theo ô và bộ đếm `n/2.000` đếm SAU chuẩn hoá (khớp máy chủ). Quá giới hạn ⇒ bộ đếm đỏ.
function TextBox({
  field,
  value,
  errors,
  readOnly,
  inputRef,
  onChange,
}: {
  field: TextField;
  value: string;
  errors: FieldErrors;
  readOnly: boolean;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  onChange: (field: RecordField, value: string) => void;
}) {
  const id = `exam-${field}`;
  const code = errors[field];
  const length = textLength(value);
  const describedBy = [code ? `${id}-error` : null, `${id}-count`]
    .filter((part) => part !== null)
    .join(' ');
  return (
    <div className="flex flex-col">
      <label htmlFor={id} className={LABEL}>
        {LABEL_OF[field]}{' '}
        <span aria-hidden="true" className="text-danger">
          *
        </span>
      </label>
      <textarea
        id={id}
        ref={inputRef}
        required
        rows={2}
        aria-invalid={code ? true : undefined}
        aria-describedby={describedBy}
        placeholder={SAVE_TEXT.placeholders[field]}
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange(field, event.target.value)}
        className={`${CONTROL} min-h-[80px] w-full resize-y ${code ? '' : NORMAL_BORDER}`}
      />
      <div className="mt-1 flex items-start justify-between gap-3">
        {code ? (
          <FieldError id={`${id}-error`} message={fieldMessage(field, code)} />
        ) : null}
        <span
          id={`${id}-count`}
          className={`ml-auto text-xs ${length > EXAM_TEXT_MAX ? 'text-danger' : 'text-gray-600'}`}
        >
          {`${formatCount(length)}/${formatCount(EXAM_TEXT_MAX)}`}
        </span>
      </div>
    </div>
  );
}

// Hộp `Ghi chú khám` (chưa có hồ sơ) và `Chỉnh sửa ghi chú khám` (đã có) của Bác sĩ (doctor-exam F3; Figma `460:2`, `463:2`; PLAN 5.5, 5.13, 5.14; Q2, Q3). Hộp modal dựng trên `ModalFrame` của doctor (focus, Esc, `inert`, khoá khi đang lưu).
// Luồng: Lưu ⇒ kiểm ở máy ⇒ MỘT PUT kèm token `capNhatLanCuoi` đã thấy. Lỗi theo ô ở đúng ô, nội dung LUÔN giữ. 409 `HO_SO_KHAM_DA_THAY_DOI` và lỗi mạng: người dùng bấm `Tải lại bản mới` (hộp gọi `onChanged`; KHÔNG tự tải, KHÔNG tự gửi lại,
// KHÔNG tự ghi đè); khi dữ liệu mới về (tham chiếu `note` đổi) thì so với nội dung đang gõ: trùng ⇒ đã lưu; khác và token đã đổi ⇒ khối "Bản mới nhất" để chọn; token giữ nguyên ⇒ chưa lưu, bấm Lưu lại được.
export function ExamRecordDialog({
  maLichHen,
  nguoiKham,
  thoiGian,
  note,
  initial,
  returnFocusRef,
  onClose,
  onSaved,
  onChanged,
}: ExamRecordDialogProps) {
  const [values, setValues] = useState(initial.values);
  // Token đã thấy: đổi khi người dùng chọn `Giữ bản của tôi` hay `Dùng bản mới nhất`
  const [baseToken, setBaseToken] = useState(initial.baseToken);
  // Tên hộp cố định theo lúc mở (đổi token giữa chừng không đổi "Ghi chú khám" thành "Chỉnh sửa …")
  const [editing] = useState(initial.baseToken !== null);
  // Đã bấm `Tải lại bản mới`: nhớ bản `note` lúc bấm để biết khi nào dữ liệu mới về
  const [awaiting, setAwaiting] = useState<{
    snapshot: ExamRecordNote | null;
  } | null>(null);
  const firstRef = useRef<HTMLTextAreaElement>(null);
  const ngayKham = visitDate(thoiGian);
  const range = followUpRange(ngayKham);
  const { saving, failure, save, clearField, resolve } = useSaveRecord({
    maLichHen,
    ngayKham,
    onSaved,
    onChanged,
  });

  // Dữ liệu mới đã về: `useKeepPrevious` của trang chi tiết trả đối tượng MỚI khi tải xong, nên tham chiếu `note` đổi
  const reconciliation =
    awaiting !== null && note !== awaiting.snapshot
      ? reconcile(values, baseToken, note)
      : null;
  const onSavedRef = useRef(onSaved);
  useEffect(() => {
    onSavedRef.current = onSaved;
  });
  useEffect(() => {
    if (reconciliation === 'saved') onSavedRef.current();
  }, [reconciliation]);

  const kind = failure?.kind ?? null;
  // Lưu khoá khi không còn ý nghĩa: lỗi cuối (404, 401, 403, đổi trạng thái), 409 chưa chọn bản, đang chờ chọn giữa hai bản
  const locked =
    kind === 'final' ||
    (kind === 'conflict' && reconciliation !== 'unsaved') ||
    reconciliation === 'changed';
  const message =
    reconciliation === 'changed'
      ? SAVE_TEXT.conflict
      : reconciliation === 'unsaved'
        ? SAVE_TEXT.unsaved
        : (failure?.message ?? null);
  const canReload =
    (kind === 'conflict' || kind === 'uncertain') && reconciliation === null;
  const errors = failure?.fields ?? {};

  function change(field: RecordField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    clearField(field);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (locked) return;
    setAwaiting(null);
    void save(values, baseToken);
  }

  function reload() {
    setAwaiting({ snapshot: note });
    onChanged();
  }

  // Chọn bản sau khi so sánh: nhận token của bản mới nhất để lần Lưu kế KHÔNG bị 409 nữa
  function adopt(newest: ExamRecordNote, replaceValues: boolean) {
    if (replaceValues) setValues(valuesOf(newest));
    setBaseToken(newest.capNhatLanCuoi);
    setAwaiting(null);
    resolve();
  }

  function handleClose() {
    onClose(failure !== null ? { values, baseToken } : null);
  }

  const dateError = errors.ngayTaiKhamDuKien;
  const dateId = 'exam-ngayTaiKhamDuKien';
  return (
    <ModalFrame
      title={editing ? SAVE_TEXT.titleEdit : SAVE_TEXT.titleNew}
      subtitle={`${maLichHen} · ${nguoiKham}`}
      subtitleClass="text-gray-600"
      initialFocusRef={firstRef}
      returnFocusRef={returnFocusRef}
      onClose={handleClose}
      busy={saving}
      showCloseIcon
      widthClass="max-w-[630px]"
    >
      <form
        noValidate
        onSubmit={handleSubmit}
        className="flex min-h-0 flex-col"
      >
        <div className="flex min-h-0 flex-col gap-[15px] overflow-y-auto px-6 pt-5 pb-[17px]">
          {TEXT_FIELDS.map((field) => (
            <TextBox
              key={field}
              field={field}
              value={values[field]}
              errors={errors}
              readOnly={saving}
              inputRef={field === 'trieuChung' ? firstRef : undefined}
              onChange={change}
            />
          ))}
          <div className="flex flex-col">
            <label htmlFor={dateId} className={LABEL}>
              {RECORD_TEXT.labels.returnDate}{' '}
              <span className="text-xs font-normal text-gray-500">
                {SAVE_TEXT.optional}
              </span>
            </label>
            <DateField
              id={dateId}
              min={range?.min}
              max={range?.max}
              aria-invalid={dateError ? true : undefined}
              aria-describedby={dateError ? `${dateId}-error` : undefined}
              value={values.ngayTaiKhamDuKien}
              readOnly={saving}
              onChange={(iso) => change('ngayTaiKhamDuKien', iso)}
              wrapperClassName="w-[142px] self-start"
              className={`${CONTROL} h-[35.35px] py-0 ${dateError ? '' : NORMAL_BORDER}`}
            />
            {dateError ? (
              <div className="mt-1">
                <FieldError
                  id={`${dateId}-error`}
                  message={fieldMessage('ngayTaiKhamDuKien', dateError)}
                />
              </div>
            ) : null}
          </div>

          {message !== null && (
            <div
              role="alert"
              className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-left text-sm text-danger-strong"
            >
              <p>{message}</p>
              {canReload && (
                <button
                  type="button"
                  onClick={reload}
                  className="mt-1 block font-medium underline"
                >
                  {SAVE_TEXT.reload}
                </button>
              )}
            </div>
          )}

          {reconciliation === 'changed' && note !== null && (
            <section
              aria-labelledby="exam-latest-title"
              className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3"
            >
              <h3
                id="exam-latest-title"
                className="text-sm font-semibold text-gray-900"
              >
                {SAVE_TEXT.latest}
              </h3>
              <div className="flex flex-col gap-4">
                <RecordBody note={note} />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => adopt(note, false)}
                  className={SECONDARY}
                >
                  {SAVE_TEXT.keepMine}
                </button>
                <button
                  type="button"
                  onClick={() => adopt(note, true)}
                  className={SECONDARY}
                >
                  {SAVE_TEXT.useLatest}
                </button>
              </div>
            </section>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button
            type="button"
            disabled={saving}
            onClick={handleClose}
            className={SECONDARY}
          >
            {SAVE_TEXT.cancel}
          </button>
          <button
            type="submit"
            disabled={saving || locked}
            className={`${BUTTON} bg-brand-strong font-semibold text-white transition-colors hover:bg-cyan-800`}
          >
            {saving ? SAVE_TEXT.saving : SAVE_TEXT.save}
          </button>
        </div>
      </form>
    </ModalFrame>
  );
}
