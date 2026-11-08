import { User, Users } from 'lucide-react';
import { useId } from 'react';
import { genderLabel, toDisplayDate } from '../profile/profile-format';
import { NOT_UPDATED_LABEL } from '../profile/profile-rows-card';
import { relationshipLabel } from '../relatives/relative-labels';
import { SUSPENDED_RELATIVE_LABEL } from './lookup-labels';
import { LOOKUP_TEXT, relativeCountLabel } from './lookup-messages';
import type { PatientDetailRelative } from './lookup-types';

export interface LookupRelativesProps {
  items: readonly PatientDetailRelative[];
}

// Thẻ "Người thân liên kết" của bảng hồ sơ (patient F8; Figma `485:2`): chỉ đọc, gồm cả hồ sơ đang dùng lẫn đã ngừng (đang dùng trước, thứ tự
// do API giữ). "N người" là số phần tử của `items` kể cả hồ sơ đã ngừng, theo Figma. Thân không có mã nội bộ (Q18) nên `key` là chỉ số mảng:
// danh sách chỉ đọc và thứ tự ổn định nên đó là khoá đúng.
// Màu theo token ADR 0004: quan hệ brand-strong (Figma `#0092b8` chỉ 3,62:1 trên trắng), chữ phụ gray-500 (Figma `#99a1af` chỉ 2,60:1).
export function LookupRelatives({ items }: LookupRelativesProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-xl border border-gray-100 bg-white p-[1.25rem]"
    >
      <div className="flex items-center gap-[0.5rem]">
        <Users aria-hidden="true" className="size-[1rem] text-brand-strong" />
        <h3 id={headingId} className="text-sm font-semibold text-gray-700">
          Người thân liên kết
        </h3>
        <span className="ml-auto text-xs text-gray-500">
          {relativeCountLabel(items.length)}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="pt-[1rem] text-sm text-gray-500">
          {LOOKUP_TEXT.noRelatives}
        </p>
      ) : (
        <ul className="pt-[0.25rem]">
          {items.map((relative, index) => {
            const birth = toDisplayDate(relative.ngaySinh);
            // Mảnh nào thiếu hoặc không nhận ra thì bỏ, không chèn "Chưa cập nhật" vào dòng phụ
            const meta = [
              genderLabel(relative.gioiTinh),
              birth === null ? null : `NS: ${birth}`,
              relative.soDienThoai,
            ].filter((piece): piece is string => Boolean(piece));
            return (
              <li
                key={index}
                className="flex gap-[0.75rem] border-b border-gray-50 py-[0.75rem] last:border-b-0 last:pb-0"
              >
                <span
                  aria-hidden="true"
                  className="flex size-[2rem] shrink-0 items-center justify-center rounded-full bg-gray-100"
                >
                  <User className="size-[0.875rem] text-gray-500" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-[0.5rem] gap-y-[0.125rem]">
                    <p className="text-sm font-semibold break-words text-gray-900">
                      {relative.hoTen}
                    </p>
                    {!relative.trangThaiHieuLuc && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        {SUSPENDED_RELATIVE_LABEL}
                      </span>
                    )}
                  </div>
                  <p className="pt-[0.125rem] text-xs font-medium text-brand-strong">
                    {relationshipLabel(relative.moiQuanHe) ?? NOT_UPDATED_LABEL}
                  </p>
                  {meta.length > 0 && (
                    <p className="flex flex-wrap gap-x-[0.75rem] pt-[0.25rem] text-xs break-words text-gray-500">
                      {meta.map((piece) => (
                        <span key={piece}>{piece}</span>
                      ))}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
