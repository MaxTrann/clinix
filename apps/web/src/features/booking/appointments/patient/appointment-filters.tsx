import { Search } from 'lucide-react';
import { useId } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { OWN_PROFILE } from './api/patient-appointment-types';
import {
  LIST_TEXT,
  optionsFailedLabel,
  optionsTruncatedLabel,
} from './list-messages';
import type { AppointmentListController } from './use-appointment-list';
import type { FilterOptionsController } from './use-filter-options';

const FIELD_CONTROL =
  'block h-[2.6rem] w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900';

// Một ô lọc có nhãn nhìn thấy (Figma `411:2`) và dòng chú thích nhỏ bên dưới (lỗi tải danh sách, danh sách rút gọn, ngày sai thứ tự)
function Field(props: {
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
function OptionsNote(props: {
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
          {LIST_TEXT.optionsRetry}
        </button>
      </Note>
    );
  }
  return props.truncated ? (
    <Note>{optionsTruncatedLabel(props.what)}</Note>
  ) : null;
}

// Ô chọn có `Tất cả` ở đầu và ghi chú lỗi/rút gọn bên dưới: dùng chung cho Người khám, Bác sĩ, Chuyên khoa (chỉ khác các mục `children`)
function SelectField(props: {
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
        <option value="">{LIST_TEXT.allOption}</option>
        {props.children}
      </select>
    </Field>
  );
}

export interface AppointmentFiltersProps {
  list: AppointmentListController;
  options: FilterOptionsController;
}

// Ô tìm và năm bộ lọc của "Lịch hẹn của tôi" (Figma `411:2`). Riêng tư: từ khoá là dữ liệu cá nhân nên không `name`, không `<form>` (trình duyệt chỉ
// lưu lịch sử khi gửi form), `autoComplete="off"`; không `type="search"` (Chrome tự thêm nút xoá thứ hai); không `maxLength` (đếm UTF-16 và cắt im lặng).
export function AppointmentFilters({ list, options }: AppointmentFiltersProps) {
  const ids = {
    search: useId(),
    hint: useId(),
    profile: useId(),
    doctor: useId(),
    specialty: useId(),
    from: useId(),
    to: useId(),
    dateNote: useId(),
  };
  const { keyword } = list;
  const relatives = options.relatives.state;
  const specialties = options.specialties.state;
  const doctors = options.doctors.state;

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    // Enter đang chốt chữ của bộ gõ không phải lệnh tìm: `isComposing` (Chrome) hoặc keyCode 229 (IME của Windows; Safari báo 229 sau `compositionend`)
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    keyword.submit();
  }

  const keywordNote = list.view.kind === 'ready' && list.view.keywordRejected;
  const describedBy = keyword.hint || keywordNote ? ids.hint : undefined;

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
      <div role="search" className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-[1.3rem] left-3.5 size-4 -translate-y-1/2 text-gray-600"
        />
        <input
          id={ids.search}
          type="text"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label={LIST_TEXT.searchLabel}
          aria-describedby={describedBy}
          placeholder={LIST_TEXT.searchPlaceholder}
          value={keyword.input}
          onChange={(event) => keyword.change(event.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => keyword.setComposing(true)}
          onCompositionEnd={() => keyword.setComposing(false)}
          className="block h-[2.6rem] w-full rounded-full border border-gray-200 bg-white pr-4 pl-10 text-sm text-gray-900"
        />
      </div>
      {(keyword.hint || keywordNote) && (
        <p
          id={ids.hint}
          className={`mt-1.5 text-xs ${keyword.hint?.error || keywordNote ? 'text-danger-strong' : 'text-gray-600'}`}
        >
          {keyword.hint?.text ?? LIST_TEXT.keywordRejected}
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SelectField
          id={ids.profile}
          label={LIST_TEXT.profileLabel}
          what="người thân"
          value={list.profile}
          onChange={list.setProfile}
          failed={relatives.status === 'error'}
          truncated={false}
          retry={options.relatives.retry}
        >
          <option value={OWN_PROFILE}>{LIST_TEXT.ownOption}</option>
          {relatives.status === 'ready' &&
            relatives.data.map((relative) => (
              <option
                key={relative.hoSoNguoiThanId}
                value={relative.hoSoNguoiThanId}
              >
                {relative.hoTen}
                {relative.trangThaiHieuLuc
                  ? ''
                  : LIST_TEXT.inactiveRelativeSuffix}
              </option>
            ))}
        </SelectField>

        <SelectField
          id={ids.doctor}
          label={LIST_TEXT.doctorLabel}
          what="bác sĩ"
          value={list.doctor}
          onChange={list.setDoctor}
          failed={doctors.status === 'error'}
          truncated={doctors.status === 'ready' && doctors.data.truncated}
          retry={options.doctors.retry}
        >
          {doctors.status === 'ready' &&
            doctors.data.options.map((doctor) => (
              <option key={doctor.bacSiId} value={doctor.bacSiId}>
                {doctor.hoTen}
              </option>
            ))}
        </SelectField>

        <SelectField
          id={ids.specialty}
          label={LIST_TEXT.specialtyLabel}
          what="chuyên khoa"
          value={list.specialty}
          onChange={list.setSpecialty}
          failed={specialties.status === 'error'}
          truncated={
            specialties.status === 'ready' && specialties.data.truncated
          }
          retry={options.specialties.retry}
        >
          {specialties.status === 'ready' &&
            specialties.data.options.map((specialty) => (
              <option
                key={specialty.chuyenKhoaId}
                value={specialty.chuyenKhoaId}
              >
                {specialty.ten}
              </option>
            ))}
        </SelectField>

        <Field label={LIST_TEXT.fromLabel} htmlFor={ids.from}>
          <input
            id={ids.from}
            type="date"
            value={list.fromDate}
            max={list.toDate || undefined}
            onChange={(event) => list.setFromDate(event.target.value)}
            className={FIELD_CONTROL}
          />
        </Field>

        <Field
          label={LIST_TEXT.toLabel}
          htmlFor={ids.to}
          note={
            list.dateOrderInvalid ? (
              <p
                id={ids.dateNote}
                role="alert"
                className="mt-1 text-xs text-danger-strong"
              >
                {LIST_TEXT.dateOrder}
              </p>
            ) : null
          }
        >
          <input
            id={ids.to}
            type="date"
            value={list.toDate}
            min={list.fromDate || undefined}
            aria-invalid={list.dateOrderInvalid}
            aria-describedby={list.dateOrderInvalid ? ids.dateNote : undefined}
            onChange={(event) => list.setToDate(event.target.value)}
            className={FIELD_CONTROL}
          />
        </Field>
      </div>
    </div>
  );
}
