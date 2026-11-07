import type { BranchSummary, DoctorSort } from '../api/search-types';
import {
  KEYWORD_MAX_LENGTH,
  RATING_OPTIONS,
  SORT_OPTIONS,
  type DoctorFilterErrors,
  type DoctorFilterValues,
} from './doctor-filter-rules';

export const ALL_BRANCHES_LABEL = 'Tất cả chi nhánh';

interface DoctorFiltersProps {
  values: DoctorFilterValues;
  errors: DoctorFilterErrors;
  branches: BranchSummary[];
  onChange: (patch: Partial<DoctorFilterValues>) => void;
}

const CONTROL =
  'w-full rounded-[0.625rem] border border-gray-300 px-3 py-2 text-sm';

// Bộ lọc danh sách bác sĩ: chi nhánh, tên, khoảng giá, mức đánh giá, sắp xếp (Q12). Hai ô giá/đánh giá chưa có frame Figma nên theo đề xuất của PLAN.
export function DoctorFilters({
  values,
  errors,
  branches,
  onChange,
}: DoctorFiltersProps) {
  return (
    <form
      role="search"
      aria-label="Bộ lọc bác sĩ"
      onSubmit={(event) => event.preventDefault()}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <div>
        <label htmlFor="doctor-branch" className="text-sm text-gray-700">
          Chi nhánh
        </label>
        <select
          id="doctor-branch"
          value={values.chiNhanhId}
          onChange={(event) => onChange({ chiNhanhId: event.target.value })}
          className={CONTROL}
        >
          <option value="">{ALL_BRANCHES_LABEL}</option>
          {branches.map((branch) => (
            <option key={branch.chiNhanhId} value={branch.chiNhanhId}>
              {branch.ten}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="doctor-name" className="text-sm text-gray-700">
          Tên bác sĩ
        </label>
        <input
          id="doctor-name"
          type="search"
          maxLength={KEYWORD_MAX_LENGTH}
          value={values.q}
          onChange={(event) => onChange({ q: event.target.value })}
          placeholder="Tìm theo tên bác sĩ"
          className={CONTROL}
        />
      </div>
      <div>
        <label htmlFor="doctor-sort" className="text-sm text-gray-700">
          Sắp xếp
        </label>
        <select
          id="doctor-sort"
          value={values.sapXep}
          onChange={(event) =>
            onChange({ sapXep: event.target.value as DoctorSort })
          }
          className={CONTROL}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="doctor-price-from" className="text-sm text-gray-700">
          Giá từ (đ)
        </label>
        <input
          id="doctor-price-from"
          inputMode="numeric"
          maxLength={12}
          value={values.giaTu}
          onChange={(event) => onChange({ giaTu: event.target.value })}
          aria-invalid={errors.giaTu ? true : undefined}
          aria-describedby={
            errors.giaTu ? 'doctor-price-from-error' : undefined
          }
          className={CONTROL}
        />
        {errors.giaTu && (
          <p
            id="doctor-price-from-error"
            role="alert"
            className="mt-1 text-xs text-danger-strong"
          >
            {errors.giaTu}
          </p>
        )}
      </div>
      <div>
        <label htmlFor="doctor-price-to" className="text-sm text-gray-700">
          Giá đến (đ)
        </label>
        <input
          id="doctor-price-to"
          inputMode="numeric"
          maxLength={12}
          value={values.giaDen}
          onChange={(event) => onChange({ giaDen: event.target.value })}
          aria-invalid={errors.giaDen ? true : undefined}
          aria-describedby={errors.giaDen ? 'doctor-price-to-error' : undefined}
          className={CONTROL}
        />
        {errors.giaDen && (
          <p
            id="doctor-price-to-error"
            role="alert"
            className="mt-1 text-xs text-danger-strong"
          >
            {errors.giaDen}
          </p>
        )}
      </div>
      <div>
        <label htmlFor="doctor-rating" className="text-sm text-gray-700">
          Đánh giá
        </label>
        <select
          id="doctor-rating"
          value={values.diemTu}
          onChange={(event) => onChange({ diemTu: event.target.value })}
          className={CONTROL}
        >
          {RATING_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </form>
  );
}
