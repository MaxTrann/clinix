import {
  CalendarDays,
  ClipboardList,
  MapPin,
  Pencil,
  Stethoscope,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import {
  BOOKING_PATH,
  bookingInfoPath,
} from '../../../../shared/routes/booking-paths';
import { doctorDisplayName } from '../../api/booking-labels';
import type { BookingConfirmation } from '../../api/booking-types';
import {
  formatVietnamTime,
  formatVietnamWeekdayDate,
} from '../../appointments/common/appointment-format';
import { StepLink } from './step-link';

// Thẻ "Chi tiết lịch hẹn" của Bước 5 (booking F5; Figma `451:2`): sáu hàng từ `tomTat` và bản nháp. Chi nhánh không có `Sửa` (như Figma). `Sửa` của Dịch vụ, Bác sĩ, Ngày và giờ khám
// có đích đúng là Bước 2 và 3 nhưng URL chỉ mang `khungGioId` nên TẠM về Bước 1 (F3 (k), TECH_DEBT 121); `Sửa` của Người khám và Lý do khám về Bước 4 (bản nháp còn nguyên).
const EDIT_CLASS =
  'inline-flex min-h-11 shrink-0 items-center gap-1.5 self-start rounded-lg px-2 text-sm font-medium text-brand-strong';

function SummaryRow({
  icon: Icon,
  label,
  note,
  edit,
  busy,
  children,
}: {
  icon: LucideIcon;
  label: string;
  // Dòng phụ nhỏ dưới giá trị (chuyên khoa, địa chỉ, "Bản thân")
  note?: string;
  edit?: { to: string; label: string };
  busy: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3 border-b border-gray-100 py-3 last:border-b-0">
      <Icon aria-hidden="true" className="mt-1 size-4 shrink-0 text-gray-600" />
      <div className="min-w-0 flex-1">
        <dt className="text-sm text-gray-600">{label}</dt>
        <dd className="break-words text-gray-900">{children}</dd>
        {note !== undefined && (
          <dd className="text-sm text-gray-600">{note}</dd>
        )}
      </div>
      {edit !== undefined && (
        <StepLink
          to={edit.to}
          busy={busy}
          className={EDIT_CLASS}
          ariaLabel={edit.label}
        >
          <Pencil aria-hidden="true" className="size-3.5" />
          Sửa
        </StepLink>
      )}
    </div>
  );
}

const strong = (text: string) => <span className="font-semibold">{text}</span>;

export function AppointmentDetailsCard({
  data,
  visitReason,
  khungGioId,
  busy,
}: {
  data: BookingConfirmation;
  // Từ bản nháp: chuỗi đã chuẩn hoá hoặc `null` = không nhập
  visitReason: string | null;
  khungGioId: string;
  busy: boolean;
}) {
  const infoPath = bookingInfoPath(khungGioId);
  return (
    <section
      aria-labelledby="confirm-details-title"
      className="rounded-2xl border border-gray-200 bg-white p-5"
    >
      <h2 id="confirm-details-title" className="font-semibold text-gray-900">
        Chi tiết lịch hẹn
      </h2>
      <dl className="mt-1">
        <SummaryRow
          icon={Stethoscope}
          label="Dịch vụ"
          edit={{ to: BOOKING_PATH, label: 'Sửa dịch vụ' }}
          busy={busy}
        >
          {strong(data.dichVu)}
        </SummaryRow>
        <SummaryRow
          icon={UserRound}
          label="Bác sĩ"
          note={data.chuyenKhoa}
          edit={{ to: BOOKING_PATH, label: 'Sửa bác sĩ' }}
          busy={busy}
        >
          {strong(doctorDisplayName(data.bacSi.chucDanh, data.bacSi.hoTen))}
        </SummaryRow>
        <SummaryRow
          icon={MapPin}
          label="Chi nhánh"
          note={data.chiNhanh.diaChi}
          busy={busy}
        >
          {strong(data.chiNhanh.ten)}
        </SummaryRow>
        <SummaryRow
          icon={CalendarDays}
          label="Ngày và giờ khám"
          edit={{ to: BOOKING_PATH, label: 'Sửa ngày và giờ khám' }}
          busy={busy}
        >
          {strong(
            `${formatVietnamTime(data.thoiGian)} · ${formatVietnamWeekdayDate(data.thoiGian)}`,
          )}
        </SummaryRow>
        <SummaryRow
          icon={Users}
          label="Người khám"
          note={data.nguoiKham.laBanThan ? 'Bản thân' : 'Người thân'}
          edit={{ to: infoPath, label: 'Sửa người khám' }}
          busy={busy}
        >
          {strong(data.nguoiKham.hoTen)}
        </SummaryRow>
        <SummaryRow
          icon={ClipboardList}
          label="Lý do khám"
          edit={{ to: infoPath, label: 'Sửa lý do khám' }}
          busy={busy}
        >
          {visitReason === null ? (
            <span className="text-gray-600">Không nhập</span>
          ) : (
            // Chữ thường (React không diễn giải HTML); giữ xuống dòng người dùng đã gõ, không cắt
            <span className="whitespace-pre-line">{visitReason}</span>
          )}
        </SummaryRow>
      </dl>
    </section>
  );
}
