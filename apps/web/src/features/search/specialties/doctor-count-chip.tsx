import { doctorCountLabel } from './doctor-count-label';

// Chip "N bác sĩ" / "Sắp có bác sĩ" của thẻ chuyên khoa (Figma 257:217: nền cyan-50, chữ 11,25 px medium, px 9,375 px, py 3,75 px).
// "Sắp có bác sĩ": Figma dùng chữ xám nhạt (4,39:1, không đạt) nên dùng gray-700 trên gray-100 (ADR 0004).
// `large`: chip của thẻ đầu chi tiết chuyên khoa (Figma 259:82: px 11,25 px, py 5,625 px).
export function DoctorCountChip({
  count,
  large = false,
}: {
  count: number;
  large?: boolean;
}) {
  const hasDoctors = count > 0;
  return (
    <span
      className={`inline-block rounded-full text-xs font-medium ${
        large ? 'px-3 py-1.5' : 'px-2.5 py-1'
      } ${
        hasDoctors
          ? 'bg-brand-soft text-brand-strong'
          : 'bg-gray-100 text-gray-700'
      }`}
    >
      {doctorCountLabel(count)}
    </span>
  );
}
