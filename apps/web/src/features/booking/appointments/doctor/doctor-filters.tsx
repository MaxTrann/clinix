import { useId } from 'react';
import { DateChips } from '../common/date-chips';
import {
  DateRangeFields,
  Field,
  KeywordSearchBox,
  SelectBox,
} from '../common/filter-controls';
import {
  SHIFT_CODES,
  SORT_ORDERS,
  type ShiftCode,
  type SortOrder,
} from './api/doctor-appointment-types';
import type { DoctorListController } from './use-doctor-list';
import { DATE_PRESET_OPTIONS, LIST_TEXT, shiftLabel } from './list-messages';

// Bộ lọc của "Lịch hẹn" của Bác sĩ (Figma `457:2`): sáu chip ngày, rồi hàng năm ô `Tìm kiếm`, `Từ ngày`, `Đến ngày`, `Ca khám`, `Sắp xếp`. `Từ ngày`, `Đến ngày` LUÔN hiện và cho thấy khoảng đang áp dụng
// (chip khác `Tùy chọn` tính ngày từ hôm nay giờ Việt Nam; sửa một ô thì về `Tùy chọn`) [đề xuất: Figma chỉ có trạng thái `Tùy chọn` với hai ô trống]. KHÔNG có ô bác sĩ, chi nhánh, chuyên khoa, dịch vụ: lịch của
// CHÍNH bác sĩ (phạm vi do backend ép). Các ô dùng chung với ba trang danh sách khác ở `common/filter-controls.tsx`.
function sortLabel(order: SortOrder): string {
  return order === 'CuNhat' ? LIST_TEXT.oldestFirst : LIST_TEXT.newestFirst;
}

export function DoctorFilters({ list }: { list: DoctorListController }) {
  const shiftId = useId();
  const sortId = useId();

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
      <DateChips
        presets={DATE_PRESET_OPTIONS}
        groupLabel={LIST_TEXT.dateGroup}
        selected={list.preset}
        onSelect={list.setPreset}
      />

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <p
            aria-hidden="true"
            className="mb-1 text-xs font-medium text-gray-700"
          >
            {LIST_TEXT.searchCaption}
          </p>
          <KeywordSearchBox
            keyword={list.keyword}
            label={LIST_TEXT.searchLabel}
            placeholder={LIST_TEXT.searchPlaceholder}
            rejected={list.view.kind === 'ready' && list.view.keywordRejected}
          />
        </div>

        <DateRangeFields
          from={list.fromDate}
          to={list.toDate}
          orderInvalid={list.dateOrderInvalid}
          onFromChange={list.setFromDate}
          onToChange={list.setToDate}
        />

        <Field label={LIST_TEXT.shiftLabel} htmlFor={shiftId}>
          <SelectBox
            id={shiftId}
            value={list.filters.shift ?? ''}
            onChange={(event) =>
              list.setShift(
                (SHIFT_CODES as readonly string[]).includes(event.target.value)
                  ? (event.target.value as ShiftCode)
                  : null,
              )
            }
          >
            <option value="">{LIST_TEXT.allShifts}</option>
            {SHIFT_CODES.map((code) => (
              <option key={code} value={code}>
                {shiftLabel(code)}
              </option>
            ))}
          </SelectBox>
        </Field>

        <Field label={LIST_TEXT.sortLabel} htmlFor={sortId}>
          <SelectBox
            id={sortId}
            value={list.filters.sort}
            onChange={(event) =>
              list.setSort(
                event.target.value === 'CuNhat' ? 'CuNhat' : 'MoiNhat',
              )
            }
          >
            {SORT_ORDERS.map((order) => (
              <option key={order} value={order}>
                {sortLabel(order)}
              </option>
            ))}
          </SelectBox>
        </Field>
      </div>

      {/* Figma `#fb2c36` chữ đỏ trên trắng chỉ 3,81:1: dùng `danger-strong` 6,42:1 (ADR 0004) */}
      {list.filtersActive && (
        <button
          type="button"
          onClick={list.clearFilters}
          className="mt-3 inline-flex min-h-7 items-center rounded-lg border border-danger bg-white px-3 text-xs font-medium text-danger-strong hover:bg-danger-soft"
        >
          {LIST_TEXT.clearFilters}
        </button>
      )}
    </div>
  );
}
