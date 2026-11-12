import { Search } from 'lucide-react';
import { useId } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import {
  COMMON_LIST_TEXT,
  optionsFailedLabel,
  optionsTruncatedLabel,
} from './list-text';
import type { KeywordBoxController } from './use-keyword-box';

// Các ô của bộ lọc dùng chung cho trang danh sách lịch hẹn của Bệnh nhân (F1 viết, chuyển lên `common/` ở F8) và của Lễ tân (F8). F10, F11 dùng lại.

export const FIELD_CONTROL =
  'block h-[2.6rem] w-full rounded-xl border border-gray-500 bg-white px-3 text-sm text-gray-900';

// Một ô lọc có nhãn nhìn thấy (Figma `411:2`) và dòng chú thích nhỏ bên dưới (lỗi tải danh sách, danh sách rút gọn, ngày sai thứ tự)
export function Field(props: {
  label: string;
  htmlFor: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={props.htmlFor}
        className="mb-1 block text-xs font-medium text-gray-700"
      >
        {props.label}
      </label>
      {props.children}
      {props.note}
    </div>
  );
}

function Note(props: { children: ReactNode; error?: boolean }) {
  return (
    <p
      className={`mt-1 text-xs ${props.error ? 'text-danger-strong' : 'text-gray-600'}`}
    >
      {props.children}
    </p>
  );
}

// Ghi chú dưới ô chọn: lỗi tải danh sách (kèm `Thử lại`; ô vẫn dùng được với `Tất cả`) hoặc danh sách rút gọn (`total` lớn hơn số mục nhận được: không cắt
// âm thầm, Đại duyệt 12/11/2026)
export function OptionsNote(props: {
  what: string;
  failed: boolean;
  truncated: boolean;
  retry: () => void;
}) {
  if (props.failed) {
    return (
      <Note error>
        {optionsFailedLabel(props.what)}{' '}
        <button
          type="button"
          className="font-medium underline"
          onClick={props.retry}
        >
          {COMMON_LIST_TEXT.optionsRetry}
        </button>
      </Note>
    );
  }
  return props.truncated ? (
    <Note>{optionsTruncatedLabel(props.what)}</Note>
  ) : null;
}

// Ô chọn có `Tất cả` ở đầu và ghi chú lỗi/rút gọn bên dưới: dùng chung cho Người khám, Bác sĩ, Chuyên khoa (chỉ khác các mục `children`)
export function SelectField(props: {
  id: string;
  label: string;
  what: string;
  value: string;
  onChange: (value: string) => void;
  failed: boolean;
  truncated: boolean;
  retry: () => void;
  children: ReactNode;
}) {
  return (
    <Field
      label={props.label}
      htmlFor={props.id}
      note={
        <OptionsNote
          what={props.what}
          failed={props.failed}
          truncated={props.truncated}
          retry={props.retry}
        />
      }
    >
      <select
        id={props.id}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className={FIELD_CONTROL}
      >
        <option value="">{COMMON_LIST_TEXT.allOption}</option>
        {props.children}
      </select>
    </Field>
  );
}

// Ô tìm. Riêng tư: từ khoá là dữ liệu cá nhân nên không `name`, không `<form>` (trình duyệt chỉ lưu lịch sử khi gửi form), `autoComplete="off"`; không
// `type="search"` (Chrome tự thêm nút xoá thứ hai); không `maxLength` (đếm UTF-16 và cắt im lặng). `rejected`: API vừa từ chối từ khoá (400, lưới an toàn).
export function KeywordSearchBox(props: {
  keyword: KeywordBoxController;
  label: string;
  placeholder: string;
  rejected: boolean;
}) {
  const searchId = useId();
  const hintId = useId();
  const { keyword, rejected } = props;

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    // Enter đang chốt chữ của bộ gõ không phải lệnh tìm: `isComposing` (Chrome) hoặc keyCode 229 (IME của Windows; Safari báo 229 sau `compositionend`)
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    keyword.submit();
  }

  const describedBy = keyword.hint || rejected ? hintId : undefined;

  return (
    <>
      <div role="search" className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-[1.3rem] left-3.5 size-4 -translate-y-1/2 text-gray-600"
        />
        <input
          id={searchId}
          type="text"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label={props.label}
          aria-describedby={describedBy}
          placeholder={props.placeholder}
          value={keyword.input}
          onChange={(event) => keyword.change(event.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => keyword.setComposing(true)}
          onCompositionEnd={() => keyword.setComposing(false)}
          className="block h-[2.6rem] w-full rounded-full border border-gray-500 bg-white pr-4 pl-10 text-sm text-gray-900"
        />
      </div>
      {(keyword.hint || rejected) && (
        <p
          id={hintId}
          className={`mt-1.5 text-xs ${keyword.hint?.error || rejected ? 'text-danger-strong' : 'text-gray-600'}`}
        >
          {keyword.hint?.text ?? COMMON_LIST_TEXT.keywordRejected}
        </p>
      )}
    </>
  );
}

// Hai ô `Từ ngày`, `Đến ngày` (chuỗi `YYYY-MM-DD` nguyên). Trả về MỘT Fragment hai ô để nơi gọi đặt vào lưới hay hàng của mình. `Đến ngày` trước `Từ ngày` thì
// nơi gọi không gọi API (`isDateRangeValid`) và ô báo lỗi dưới ô `Đến ngày`.
export function DateRangeFields(props: {
  from: string;
  to: string;
  orderInvalid: boolean;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}) {
  const fromId = useId();
  const toId = useId();
  const noteId = useId();
  return (
    <>
      <Field label={COMMON_LIST_TEXT.fromLabel} htmlFor={fromId}>
        <input
          id={fromId}
          type="date"
          value={props.from}
          max={props.to || undefined}
          onChange={(event) => props.onFromChange(event.target.value)}
          className={FIELD_CONTROL}
        />
      </Field>

      <Field
        label={COMMON_LIST_TEXT.toLabel}
        htmlFor={toId}
        note={
          props.orderInvalid ? (
            <p
              id={noteId}
              role="alert"
              className="mt-1 text-xs text-danger-strong"
            >
              {COMMON_LIST_TEXT.dateOrder}
            </p>
          ) : null
        }
      >
        <input
          id={toId}
          type="date"
          value={props.to}
          min={props.from || undefined}
          aria-invalid={props.orderInvalid}
          aria-describedby={props.orderInvalid ? noteId : undefined}
          onChange={(event) => props.onToChange(event.target.value)}
          className={FIELD_CONTROL}
        />
      </Field>
    </>
  );
}
