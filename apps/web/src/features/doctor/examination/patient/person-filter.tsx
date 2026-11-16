import { User, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ExamineeOption } from '../api/patient-exam-types';
import { examineeChipLabel, examineeValue } from './patient-exam-labels';
import { PATIENT_TEXT } from './patient-exam-text';

function Chip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  // Figma `414:169`: nền `#0092b8` chữ trắng khi chọn chỉ 3,62:1 ⇒ `brand-strong` (ADR 0004); chip chưa chọn viền `gray-300`, chữ `gray-600`
  const tone = pressed
    ? 'border-brand-strong bg-brand-strong text-white'
    : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50';
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap ${tone}`}
    >
      {children}
    </button>
  );
}

// Hàng chip lọc người khám (Figma `414:2`; WXH-03): "Tất cả người đi khám" rồi từng lựa chọn của `nguoiKham[]` THEO THỨ TỰ API (bản thân đứng đầu). Chọn một chip ⇒ `selected` là `BanThan` hay id hồ sơ người thân; "tất cả" là `null`
// (không gửi khoá). Hồ sơ người thân đã ngừng dùng vẫn là chip nếu API đưa vào (Q18): web không lọc. Chỉ giữ lựa chọn trong bộ nhớ của trang (BDK-02).
export function PersonFilter({
  people,
  selected,
  onSelect,
}: {
  people: readonly ExamineeOption[];
  selected: string | null;
  onSelect: (value: string | null) => void;
}) {
  return (
    <div
      role="group"
      aria-label={PATIENT_TEXT.peopleGroup}
      className="flex flex-wrap gap-2"
    >
      <Chip pressed={selected === null} onClick={() => onSelect(null)}>
        <Users aria-hidden="true" className="size-3" />
        {PATIENT_TEXT.allPeople}
      </Chip>
      {people.map((option) => {
        const value = examineeValue(option);
        return (
          <Chip
            key={value}
            pressed={selected === value}
            onClick={() => onSelect(value)}
          >
            <User aria-hidden="true" className="size-3" />
            {examineeChipLabel(option)}
          </Chip>
        );
      })}
    </div>
  );
}
