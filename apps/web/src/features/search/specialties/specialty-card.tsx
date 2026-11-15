import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import type { SpecialtySummary } from '../api/search-types';
import { DoctorCountChip } from './doctor-count-chip';
import { SpecialtyImage } from './specialty-image';

// Thẻ chuyên khoa dùng chung cho Trang chủ (Figma 257:199) và trang Chuyên khoa (Figma 217:74): cùng một thiết kế (search F14, UIS-05, UIS-09).
// `headingLevel`: tên là h3 dưới h2 của Trang chủ, h2 dưới h1 của trang Chuyên khoa.
export function SpecialtyCard({
  item,
  headingLevel = 3,
}: {
  item: SpecialtySummary;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <li>
      <Link
        to={`/chuyen-khoa/${encodeURIComponent(item.chuyenKhoaId)}`}
        className="block h-full overflow-hidden rounded-2xl border border-gray-200 bg-white hover:shadow-md"
      >
        <SpecialtyImage
          src={item.anhDaiDien}
          name={item.ten}
          className="h-40 w-full object-cover"
        />
        <div className="p-4">
          <Heading className="text-lg font-semibold text-gray-900">
            {item.ten}
          </Heading>
          {/* Figma 257:214: luôn chừa 30 px (hai dòng 11,25 px) để chip "N bác sĩ" không nhảy lên khi mô tả trống */}
          <p className="mt-1 line-clamp-2 min-h-8 text-xs leading-4 text-gray-600">
            {item.moTa}
          </p>
          <div className="mt-3 flex items-center justify-between">
            <DoctorCountChip count={item.soBacSi} />
            <ArrowRight className="size-4 text-gray-300" aria-hidden="true" />
          </div>
        </div>
      </Link>
    </li>
  );
}
