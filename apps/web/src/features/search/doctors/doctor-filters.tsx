import { ChevronDown, Search } from 'lucide-react';
import type {
  BranchSummary,
  DoctorSort,
  SpecialtySummary,
} from '../api/search-types';
import {
  KEYWORD_MAX_LENGTH,
  RATING_OPTIONS,
  SORT_OPTIONS,
  type DoctorFilterErrors,
  type DoctorFilterValues,
} from './doctor-filter-rules';

export const ALL_BRANCHES_LABEL = 'Tất cả chi nhánh';
export const ALL_SPECIALTIES_LABEL = 'Tất cả chuyên khoa';

interface DoctorFiltersProps {
  values: DoctorFilterValues;
  errors: DoctorFilterErrors;
  branches: BranchSummary[];
  // Có truyền ⇒ hiện ô chọn chuyên khoa (trang Đội ngũ bác sĩ); không truyền ⇒ ẩn
  specialties?: SpecialtySummary[];
  // F5 chỉ tìm tên bác sĩ, F6 tìm cả tên chuyên khoa
  keywordPlaceholder?: string;
  onChange: (patch: Partial<DoctorFilterValues>) => void;
}

// Ô lọc theo Figma 260:67 (search F14, UIS-10): nhãn 11,25 px đậm vừa, ô cao 45 px, bo 13,375 px, chữ 13,125 px.
// `block`: nhãn là phần tử hàng (inline) thì dòng của hộp 22,5 px chứ không phải 15 px, đẩy ô xuống thêm 7,5 px (đo 1440 px)
const LABEL = 'block text-xs font-medium text-gray-500';
const FIELD =
  'h-12 w-full rounded-[13.375px] border border-gray-200 bg-white text-sm text-gray-800';

// Bộ lọc danh sách bác sĩ. Hàng 1 đúng Figma 260:67: "Tìm bác sĩ" (2 phần) + "Chuyên khoa" + "Chi nhánh" (mỗi ô 1 phần), khe 11,25 px;
// ở chi tiết chuyên khoa và Đặt lịch bước 3 không có ô chuyên khoa nên chỉ còn hai ô. Hàng 2 là bốn ô của Q12 (sắp xếp, giá từ,
// giá đến, đánh giá): CHƯA có frame Figma nên theo cùng kiểu ô, ghi là lệch có chủ ý.
export function DoctorFilters({
  values,
  errors,
  branches,
  specialties,
  keywordPlaceholder = 'Tìm theo tên bác sĩ',
  onChange,
}: DoctorFiltersProps) {
  return (
    <form
      role="search"
      aria-label="Bộ lọc bác sĩ"
      onSubmit={(event) => event.preventDefault()}
      className="rounded-[15px] border border-gray-200 bg-white p-5"
    >
      <div
        className={`grid grid-cols-1 gap-3 ${
          specialties ? 'md:grid-cols-[2fr_1fr_1fr]' : 'md:grid-cols-[2fr_1fr]'
        }`}
      >
        <div>
          <label htmlFor="doctor-name" className={LABEL}>
            Tìm bác sĩ
          </label>
          <div className="relative mt-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-4 size-4 text-gray-400"
              aria-hidden="true"
            />
            <input
              id="doctor-name"
              type="search"
              maxLength={KEYWORD_MAX_LENGTH}
              value={values.q}
              onChange={(event) => onChange({ q: event.target.value })}
              placeholder={keywordPlaceholder}
              className={`${FIELD} pl-[37.5px] pr-[15px]`}
            />
          </div>
        </div>
        {specialties && (
          <div>
            <label htmlFor="doctor-specialty" className={LABEL}>
              Chuyên khoa
            </label>
            <div className="relative mt-1">
              <select
                id="doctor-specialty"
                value={values.chuyenKhoaId}
                onChange={(event) =>
                  onChange({ chuyenKhoaId: event.target.value })
                }
                className={`${FIELD} appearance-none pl-3 pr-9`}
              >
                <option value="">{ALL_SPECIALTIES_LABEL}</option>
                {specialties.map((specialty) => (
                  <option
                    key={specialty.chuyenKhoaId}
                    value={specialty.chuyenKhoaId}
                  >
                    {specialty.ten}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-3.5 top-4 size-4 text-gray-400"
                aria-hidden="true"
              />
            </div>
          </div>
        )}
        <div>
          <label htmlFor="doctor-branch" className={LABEL}>
            Chi nhánh
          </label>
          <div className="relative mt-1">
            <select
              id="doctor-branch"
              value={values.chiNhanhId}
              onChange={(event) => onChange({ chiNhanhId: event.target.value })}
              className={`${FIELD} appearance-none pl-3 pr-9`}
            >
              <option value="">{ALL_BRANCHES_LABEL}</option>
              {branches.map((branch) => (
                <option key={branch.chiNhanhId} value={branch.chiNhanhId}>
                  {branch.ten}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-3.5 top-4 size-4 text-gray-400"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="doctor-sort" className={LABEL}>
            Sắp xếp
          </label>
          <div className="relative mt-1">
            <select
              id="doctor-sort"
              value={values.sapXep}
              onChange={(event) =>
                onChange({ sapXep: event.target.value as DoctorSort })
              }
              className={`${FIELD} appearance-none pl-3 pr-9`}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-3.5 top-4 size-4 text-gray-400"
              aria-hidden="true"
            />
          </div>
        </div>
        <div>
          <label htmlFor="doctor-price-from" className={LABEL}>
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
            className={`${FIELD} mt-1 px-3`}
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
          <label htmlFor="doctor-price-to" className={LABEL}>
            Giá đến (đ)
          </label>
          <input
            id="doctor-price-to"
            inputMode="numeric"
            maxLength={12}
            value={values.giaDen}
            onChange={(event) => onChange({ giaDen: event.target.value })}
            aria-invalid={errors.giaDen ? true : undefined}
            aria-describedby={
              errors.giaDen ? 'doctor-price-to-error' : undefined
            }
            className={`${FIELD} mt-1 px-3`}
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
          <label htmlFor="doctor-rating" className={LABEL}>
            Đánh giá
          </label>
          <div className="relative mt-1">
            <select
              id="doctor-rating"
              value={values.diemTu}
              onChange={(event) => onChange({ diemTu: event.target.value })}
              className={`${FIELD} appearance-none pl-3 pr-9`}
            >
              {RATING_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-3.5 top-4 size-4 text-gray-400"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>
    </form>
  );
}
