import { useId, type ReactNode } from 'react';
import {
  APPOINTMENT_STATE_LABELS,
  APPOINTMENT_STATES,
  isAppointmentState,
} from '../common/appointment-status';
import {
  DateRangeFields,
  KeywordSearchBox,
  OptionsNote,
} from '../common/filter-controls';
import { DateChips } from './date-chips';
import { LIST_TEXT } from './list-messages';
import type { FilterOptionsController } from './use-filter-options';
import type { ReceptionListController } from './use-reception-list';

// Ô chọn gọn của Figma `479:2`: KHÔNG có nhãn nhìn thấy, chữ `Tất cả …` nằm trong ô (mục đầu, giá trị rỗng); tên truy cập là nhãn ngắn (`aria-label`).
const COMPACT_SELECT =
  'h-7 rounded-lg border border-gray-500 bg-white px-3 text-xs text-gray-700';

function CompactSelect(props: {
  label: string;
  allLabel: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <select
      id={id}
      aria-label={props.label}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      className={COMPACT_SELECT}
    >
      <option value="">{props.allLabel}</option>
      {props.children}
    </select>
  );
}

export interface ReceptionFiltersProps {
  list: ReceptionListController;
  options: FilterOptionsController;
}

// Ô tìm, chip ngày, ba ô chọn và `Xóa lọc` của "Quản lý lịch hẹn" (Figma `479:2`, `494:2`). `Từ ngày`, `Đến ngày` chỉ hiện khi chọn chip `Khoảng ngày` (`494:2`). Ô tìm và hai
// ô ngày dùng chung với "Lịch hẹn của tôi" (`common/filter-controls.tsx`). Không có ô dịch vụ (Figma không có).
export function ReceptionFilters({ list, options }: ReceptionFiltersProps) {
  const specialties = options.specialties.state;
  const doctors = options.doctors.state;

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
      <KeywordSearchBox
        keyword={list.keyword}
        label={LIST_TEXT.searchLabel}
        placeholder={LIST_TEXT.searchPlaceholder}
        rejected={list.view.kind === 'ready' && list.view.keywordRejected}
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <DateChips selected={list.preset} onSelect={list.setPreset} />
        <span aria-hidden="true" className="h-5 w-px bg-gray-200" />

        <CompactSelect
          label={LIST_TEXT.specialtyLabel}
          allLabel={LIST_TEXT.allSpecialties}
          value={list.specialty}
          onChange={list.setSpecialty}
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
        </CompactSelect>

        <CompactSelect
          label={LIST_TEXT.doctorLabel}
          allLabel={LIST_TEXT.allDoctors}
          value={list.doctor}
          onChange={list.setDoctor}
        >
          {doctors.status === 'ready' &&
            doctors.data.options.map((doctor) => (
              <option key={doctor.bacSiId} value={doctor.bacSiId}>
                {doctor.hoTen}
              </option>
            ))}
        </CompactSelect>

        <CompactSelect
          label={LIST_TEXT.statusLabel}
          allLabel={LIST_TEXT.allStatuses}
          value={list.status ?? ''}
          onChange={(value) =>
            list.setStatus(isAppointmentState(value) ? value : null)
          }
        >
          {APPOINTMENT_STATES.map((state) => (
            <option key={state} value={state}>
              {APPOINTMENT_STATE_LABELS[state]}
            </option>
          ))}
        </CompactSelect>

        {/* Figma `#fb2c36` chữ đỏ trên trắng chỉ 3,81:1: dùng `danger-strong` 6,42:1 (ADR 0004) */}
        {list.filtersActive && (
          <button
            type="button"
            onClick={list.clearFilters}
            className="inline-flex min-h-7 items-center rounded-lg border border-danger bg-white px-3 text-xs font-medium text-danger-strong hover:bg-danger-soft"
          >
            {LIST_TEXT.clearFilters}
          </button>
        )}
      </div>

      <OptionsNotes options={options} />

      {list.preset === 'range' && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:max-w-sm">
          <DateRangeFields
            from={list.fromDate}
            to={list.toDate}
            orderInvalid={list.dateOrderInvalid}
            onFromChange={list.setFromDate}
            onToChange={list.setToDate}
          />
        </div>
      )}
    </div>
  );
}

// Ghi chú lỗi tải và "danh sách rút gọn" của hai ô chọn, đặt dưới hàng lọc (ô chọn gọn không có chỗ cho ghi chú riêng)
function OptionsNotes({ options }: { options: FilterOptionsController }) {
  const specialties = options.specialties.state;
  const doctors = options.doctors.state;
  return (
    <div className="empty:hidden">
      <OptionsNote
        what="chuyên khoa"
        failed={specialties.status === 'error'}
        truncated={specialties.status === 'ready' && specialties.data.truncated}
        retry={options.specialties.retry}
      />
      <OptionsNote
        what="bác sĩ"
        failed={doctors.status === 'error'}
        truncated={doctors.status === 'ready' && doctors.data.truncated}
        retry={options.doctors.retry}
      />
    </div>
  );
}
