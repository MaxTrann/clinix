import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  SHIFT_LABELS,
  SHIFT_ORDER,
  type ShiftCode,
} from '../../../shared/schedule/shift-labels';
import type { ReceptionDoctor } from '../api/reception-api';
import {
  RECEPTION_STATUS_LABELS,
  RECEPTION_STATUS_ORDER,
  type ReceptionStatus,
} from './reception-labels';

export const ALL = 'all';

export interface ReceptionFilters {
  // Chỉ Quản trị viên Toàn hệ thống dùng (Lễ tân và Admin Chi nhánh bị ép chi nhánh ở server)
  chiNhanhId: string;
  chuyenKhoaId: string;
  bacSiId: string;
  ca: ShiftCode | typeof ALL;
  status: ReceptionStatus | typeof ALL;
}

export interface ReceptionToolbarProps {
  filters: ReceptionFilters;
  onChange: (filters: ReceptionFilters) => void;
  doctors: readonly ReceptionDoctor[];
  // Có danh sách ⇒ hiện ô "Tất cả chi nhánh" (Admin Toàn hệ thống, doctor F6, Figma `515:2`); không có ⇒ ẩn
  branches?: readonly { chiNhanhId: string; ten: string }[];
  // "12/10 – 18/10/2026"
  weekLabel: string;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
}

const SELECT =
  'min-h-10 min-w-0 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 transition-colors hover:bg-gray-50';
const NAV_BUTTON =
  'inline-flex size-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition-colors hover:bg-gray-100';

// Bộ lọc của lưới Lễ tân (Figma `486:2`): chuyên khoa, bác sĩ, ca, trạng thái + chuyển tuần + "Hôm nay". Chuyên khoa và bác sĩ lấy từ danh sách bác sĩ
// trong phạm vi chi nhánh của Lễ tân (server quyết phạm vi); chọn chuyên khoa thì danh sách bác sĩ chỉ còn bác sĩ của chuyên khoa đó.
export function ReceptionToolbar({
  filters,
  onChange,
  doctors,
  branches,
  weekLabel,
  onPreviousWeek,
  onNextWeek,
  onToday,
}: ReceptionToolbarProps) {
  const specialties = [
    ...new Map(
      doctors.map((d) => [d.chuyenKhoa.chuyenKhoaId, d.chuyenKhoa.ten]),
    ),
  ];
  const visibleDoctors = doctors.filter(
    (d) =>
      (filters.chuyenKhoaId === ALL ||
        d.chuyenKhoa.chuyenKhoaId === filters.chuyenKhoaId) &&
      (filters.chiNhanhId === ALL ||
        d.chiNhanh.chiNhanhId === filters.chiNhanhId),
  );
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3">
      {branches && branches.length > 0 && (
        <select
          aria-label="Lọc theo chi nhánh"
          className={SELECT}
          value={filters.chiNhanhId}
          onChange={(event) =>
            // Đổi chi nhánh thì bác sĩ đang chọn (có thể thuộc chi nhánh khác) về "Tất cả"
            onChange({
              ...filters,
              chiNhanhId: event.target.value,
              bacSiId: ALL,
            })
          }
        >
          <option value={ALL}>Tất cả chi nhánh</option>
          {branches.map((branch) => (
            <option key={branch.chiNhanhId} value={branch.chiNhanhId}>
              {branch.ten}
            </option>
          ))}
        </select>
      )}
      <select
        aria-label="Lọc theo chuyên khoa"
        className={SELECT}
        value={filters.chuyenKhoaId}
        onChange={(event) =>
          // Đổi chuyên khoa thì bác sĩ đang chọn (có thể thuộc chuyên khoa khác) về "Tất cả"
          onChange({
            ...filters,
            chuyenKhoaId: event.target.value,
            bacSiId: ALL,
          })
        }
      >
        <option value={ALL}>Tất cả chuyên khoa</option>
        {specialties.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
      <select
        aria-label="Lọc theo bác sĩ"
        className={`${SELECT} max-w-56`}
        value={filters.bacSiId}
        onChange={(event) =>
          onChange({ ...filters, bacSiId: event.target.value })
        }
      >
        <option value={ALL}>Tất cả bác sĩ</option>
        {visibleDoctors.map((doctor) => (
          <option key={doctor.bacSiId} value={doctor.bacSiId}>
            {doctor.hoTen}
          </option>
        ))}
        {/* Id từ URL không có trong danh sách (sửa URL): vẫn hiện để lưới gọi API và nhận 403 đúng như A2 */}
        {filters.bacSiId !== ALL &&
          !doctors.some((d) => d.bacSiId === filters.bacSiId) && (
            <option value={filters.bacSiId}>Bác sĩ #{filters.bacSiId}</option>
          )}
      </select>
      <select
        aria-label="Lọc theo ca"
        className={SELECT}
        value={filters.ca}
        onChange={(event) =>
          onChange({
            ...filters,
            ca: event.target.value as ReceptionFilters['ca'],
          })
        }
      >
        <option value={ALL}>Tất cả ca</option>
        {SHIFT_ORDER.map((ca) => (
          <option key={ca} value={ca}>
            {SHIFT_LABELS[ca]}
          </option>
        ))}
      </select>
      <select
        aria-label="Lọc theo trạng thái"
        className={SELECT}
        value={filters.status}
        onChange={(event) =>
          onChange({
            ...filters,
            status: event.target.value as ReceptionFilters['status'],
          })
        }
      >
        <option value={ALL}>Tất cả trạng thái</option>
        {RECEPTION_STATUS_ORDER.map((status) => (
          <option key={status} value={status}>
            {RECEPTION_STATUS_LABELS[status]}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-2 sm:ml-auto">
        <button
          type="button"
          aria-label="Tuần trước"
          className={NAV_BUTTON}
          onClick={onPreviousWeek}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </button>
        <p aria-live="polite" className="text-sm font-semibold text-gray-900">
          {weekLabel}
        </p>
        <button
          type="button"
          aria-label="Tuần sau"
          className={NAV_BUTTON}
          onClick={onNextWeek}
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </button>
        <button
          type="button"
          onClick={onToday}
          className="min-h-9 rounded-lg bg-brand-strong px-3 text-sm font-semibold text-white transition-colors hover:bg-cyan-800"
        >
          Hôm nay
        </button>
      </div>
    </div>
  );
}
