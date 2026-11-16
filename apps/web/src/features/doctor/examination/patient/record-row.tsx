import { Stethoscope, User } from 'lucide-react';
import type { ExamListItem } from '../api/patient-exam-types';
import { RecordBadge } from './record-badges';
import { doctorName, relationLabel } from './patient-exam-labels';
import {
  dayOfMonth,
  formatVisitTime,
  weekdayShort,
} from './patient-exam-format';

// Một hàng ca của danh sách tháng (Figma `414:283`, `443:280`; WXH-02, WXH-05): cột ngày (ngày, thứ, giờ theo GIỜ VIỆT NAM), vạch dọc, chuyên khoa, "người khám · quan hệ", "chức danh bác sĩ" và nhãn theo `coHoSoKham`. Cả hàng là MỘT nút;
// hàng đang xem có `aria-current` và nền `brand-soft` (Figma không có kiểu riêng, câu (e3) Đại duyệt). Chữ nhạt `#99a1af` của Figma (2,6:1) dùng `gray-500` (4,84:1, ADR 0004). Chữ dài bị cắt `truncate` (không đẩy nhãn ra ngoài).
export function RecordRow({
  item,
  selected,
  onSelect,
}: {
  item: ExamListItem;
  selected: boolean;
  onSelect: (maLichHen: string) => void;
}) {
  return (
    <li className="border-b border-gray-100 last:border-b-0">
      <button
        type="button"
        aria-current={selected ? 'true' : undefined}
        onClick={() => onSelect(item.maLichHen)}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left ${selected ? 'bg-brand-soft' : 'hover:bg-gray-50'}`}
      >
        <span className="flex w-[45px] shrink-0 flex-col items-center text-center">
          <span className="text-lg leading-none font-bold text-gray-900">
            {dayOfMonth(item.thoiGian)}
          </span>
          <span className="pt-0.5 text-[10px] leading-[15px] font-medium text-gray-500">
            {weekdayShort(item.thoiGian)}
          </span>
          <span className="text-[10px] leading-[15px] font-medium text-gray-500">
            {formatVisitTime(item.thoiGian)}
          </span>
        </span>
        <span aria-hidden="true" className="h-10 w-px shrink-0 bg-gray-200" />
        <span className="flex min-w-0 flex-1 items-start justify-between gap-2">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-gray-900">
              {item.chuyenKhoa}
            </span>
            <span className="flex items-center gap-1 pt-0.5 text-xs font-medium text-gray-500">
              <User aria-hidden="true" className="size-3 shrink-0" />
              <span className="truncate">{item.nguoiKham.hoTen}</span>
              <span aria-hidden="true" className="text-gray-300">
                ·
              </span>
              <span className="shrink-0">
                {relationLabel(item.nguoiKham.quanHe)}
              </span>
            </span>
            <span className="flex items-center gap-1 pt-0.5 text-xs font-medium text-gray-500">
              <Stethoscope aria-hidden="true" className="size-3 shrink-0" />
              <span className="truncate">
                {doctorName(item.bacSi.chucDanh, item.bacSi.hoTen)}
              </span>
            </span>
          </span>
          <span className="shrink-0 pt-0.5">
            <RecordBadge hasRecord={item.coHoSoKham} />
          </span>
        </span>
      </button>
    </li>
  );
}
