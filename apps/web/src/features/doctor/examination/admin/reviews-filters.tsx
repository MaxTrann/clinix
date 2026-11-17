import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { RATING_MAX_STARS } from '../api/patient-exam-types';
import { starName } from '../patient/rating-text';
import { ALL, type ReviewFilters } from './use-reviews';
import { REVIEWS_TEXT, STATUS_TEXT } from './reviews-text';

// Ô nhập và ô chọn nằm trong nhãn đậm, chữ hoa, giãn chữ (Figma `514:331`): phải đặt lại `font-normal tracking-normal` (ô kế thừa độ đậm và khoảng cách chữ của nhãn). Ô tìm dựng riêng thay vì `AdminSearchInput`: Figma `514:333` có biểu tượng kính lúp, bo 9,375 px và nhãn
// 10 px chữ hoa như bốn ô chọn; `AdminSearchInput` (nhãn 13 px, bo 6 px, khoảng 6 px) làm thẻ lọc cao hơn Figma 6,75 px và lệch nhãn. KHÔNG lớp focus riêng: viền focus do lớp nền tảng `styles/index.css` lo.
const FIELD_BASE =
  'h-[38px] w-full rounded-[9.375px] border border-gray-200 bg-white text-[13.125px] font-normal tracking-normal text-gray-900';
const SELECT = `${FIELD_BASE} px-[15px]`;
const LABEL =
  'flex flex-col gap-[3.75px] text-[10px] leading-[15px] font-semibold tracking-[1px] text-gray-500 uppercase';

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className={LABEL}>
      {label}
      <select
        className={SELECT}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function SearchField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={LABEL}>
      {REVIEWS_TEXT.searchLabel}
      <span className="relative block">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-[11.25px] size-[13.125px] -translate-y-1/2 text-gray-500"
        />
        <input
          type="search"
          value={value}
          placeholder={REVIEWS_TEXT.searchPlaceholder}
          onChange={(event) => onChange(event.currentTarget.value)}
          className={`${FIELD_BASE} pr-[11.25px] pl-[30px] placeholder:text-gray-500`}
        />
      </span>
    </label>
  );
}

// Số sao từ 5 xuống 1 (thứ tự hiển thị là [đề xuất]; Figma chỉ vẽ ô đóng "Tất cả")
const STAR_VALUES = Array.from(
  { length: RATING_MAX_STARS },
  (_, index) => RATING_MAX_STARS - index,
);

interface FiltersProps {
  filters: ReviewFilters;
  onChange: (patch: Partial<ReviewFilters>) => void;
  // Có danh sách ⇒ hiện ô Chi nhánh (Admin Toàn hệ thống); `undefined` ⇒ KHÔNG ô Chi nhánh (Admin Chi nhánh, Figma `633:2`)
  branches?: readonly { chiNhanhId: string; ten: string }[];
  doctors: readonly { bacSiId: string; hoTen: string }[];
  doctorsFailed: boolean;
}

// Thẻ lọc (Figma `514:327`, `633:292`): Tìm kiếm, Chi nhánh (chỉ Toàn hệ thống), Bác sĩ, Số sao, Trạng thái. Tuỳ chọn Bác sĩ và Chi nhánh lấy từ danh sách ca của bác sĩ (`useReceptionDoctors('admin')`, tối đa 100 bác sĩ; TECH_DEBT 175).
export function ReviewsFilters({
  filters,
  onChange,
  branches,
  doctors,
  doctorsFailed,
}: FiltersProps) {
  return (
    <div className="flex flex-col gap-2 rounded-[13.375px] border border-gray-100 bg-white px-[18.75px] py-[15px] shadow-sm">
      <div className="grid grid-cols-1 gap-[11.25px] sm:grid-cols-2 lg:grid-cols-4">
        <SearchField value={filters.q} onChange={(q) => onChange({ q })} />
        {branches !== undefined && (
          <SelectField
            label={REVIEWS_TEXT.branchLabel}
            value={filters.chiNhanhId}
            onChange={(chiNhanhId) => onChange({ chiNhanhId })}
          >
            <option value={ALL}>{REVIEWS_TEXT.allBranches}</option>
            {branches.map((branch) => (
              <option key={branch.chiNhanhId} value={branch.chiNhanhId}>
                {branch.ten}
              </option>
            ))}
          </SelectField>
        )}
        <SelectField
          label={REVIEWS_TEXT.doctorLabel}
          value={filters.bacSiId}
          onChange={(bacSiId) => onChange({ bacSiId })}
        >
          <option value={ALL}>{REVIEWS_TEXT.allDoctors}</option>
          {doctors.map((doctor) => (
            <option key={doctor.bacSiId} value={doctor.bacSiId}>
              {doctor.hoTen}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={REVIEWS_TEXT.starsLabel}
          value={filters.soSao}
          onChange={(soSao) => onChange({ soSao })}
        >
          <option value={ALL}>{REVIEWS_TEXT.all}</option>
          {STAR_VALUES.map((stars) => (
            <option key={stars} value={String(stars)}>
              {starName(stars)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={REVIEWS_TEXT.statusLabel}
          value={filters.trangThai}
          onChange={(trangThai) =>
            onChange({ trangThai: trangThai as ReviewFilters['trangThai'] })
          }
        >
          <option value={ALL}>{REVIEWS_TEXT.all}</option>
          <option value="HienThi">{STATUS_TEXT.HienThi}</option>
          <option value="DaAn">{STATUS_TEXT.DaAn}</option>
        </SelectField>
      </div>
      {doctorsFailed && (
        <p role="alert" className="text-sm text-danger-strong">
          {REVIEWS_TEXT.doctorsFailed}
        </p>
      )}
    </div>
  );
}
