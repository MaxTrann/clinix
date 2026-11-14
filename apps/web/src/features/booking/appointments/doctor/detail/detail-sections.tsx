import {
  CalendarDays,
  MapPin,
  Stethoscope,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  formatVietnamTime,
  formatVietnamWeekdayDate,
} from '../../common/appointment-format';
import { DetailCard, DetailFact, DetailFacts } from '../../common/detail-card';
import { StatusChip } from '../../common/status-chip';
import type { DoctorAppointmentDetail } from '../api/doctor-appointment-types';
import { shiftLabel } from '../list-messages';
import {
  birthDateLabel,
  DETAIL_TEXT,
  genderLabel,
  relationLabel,
} from './detail-messages';

// Một hàng của thẻ đầu (Figma `458:2`: biểu tượng tròn, dòng chính đậm, dòng phụ nhỏ)
function HeroRow(props: {
  icon: LucideIcon;
  title: string;
  note?: string | null;
}) {
  const Icon = props.icon;
  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="flex size-[1.875rem] shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-strong"
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold break-words text-gray-900">
          {props.title}
        </p>
        {props.note != null && (
          <p className="text-xs text-gray-600">{props.note}</p>
        )}
      </div>
    </div>
  );
}

// "08:00 · Ca sáng" (Figma): giờ Việt Nam rồi tên ca; mã ca lạ thì chỉ có giờ (không lộ mã thô)
function timeAndShift(detail: DoctorAppointmentDetail): string {
  const time = formatVietnamTime(detail.thoiGian);
  const shift = shiftLabel(detail.ca);
  return shift === null ? time : `${time} · ${shift}`;
}

// Thẻ đầu của trang (Figma `458:2`): mã lịch chữ đơn cách, chip trạng thái, tên dịch vụ, người khám kèm quan hệ, ngày và "giờ · ca", chuyên khoa, chi nhánh. Bỏ hàng tên chính bác sĩ (B5 không trả và người xem
// chính là bác sĩ, Q33): hàng đó chỉ còn chuyên khoa [đề xuất]. Tên dịch vụ làm tiêu đề thay "Khám {chuyên khoa}" của Figma [đề xuất].
export function AppointmentHero({
  detail,
}: {
  detail: DoctorAppointmentDetail;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-sm text-gray-600">{detail.maLichHen}</p>
        <StatusChip status={detail.trangThai} />
      </div>
      <h2 className="pt-2 text-lg font-bold break-words text-gray-900">
        {detail.dichVu}
      </h2>
      <div className="grid gap-4 pt-4 sm:grid-cols-2">
        <HeroRow
          icon={User}
          title={detail.nguoiKham.hoTen}
          note={relationLabel(detail.nguoiKham.quanHe)}
        />
        <HeroRow
          icon={CalendarDays}
          title={formatVietnamWeekdayDate(detail.thoiGian)}
          note={timeAndShift(detail)}
        />
        <HeroRow
          icon={Stethoscope}
          title={detail.chuyenKhoa}
          note={DETAIL_TEXT.rows.specialty}
        />
        <HeroRow icon={MapPin} title={detail.chiNhanh} />
      </div>
    </section>
  );
}

// Thẻ `Thông tin người khám` (Figma `458:2`; thẻ `Thông tin lịch hẹn` ở `ScheduleCard`). Giá trị lấy từ MỘT nguồn là chi tiết. KHÔNG Email, Giá khám, cọc, thanh toán (Q33, H10; BSI-02); thêm `Giới tính`, `Ngày sinh` (B5
// và Q33 trả cho Bác sĩ, Figma không vẽ) [đề xuất]. SĐT, giới tính, ngày sinh là của NGƯỜI KHÁM, trống thì "Chưa cập nhật". Ngày, giờ theo giờ Việt Nam. `lyDoKham` là chữ tự do của bệnh nhân (dữ liệu sức khoẻ):
// React thoát chuỗi, xuống dòng giữ bằng CSS.
export function ExamineeCard({ detail }: { detail: DoctorAppointmentDetail }) {
  const { rows } = DETAIL_TEXT;
  const { nguoiKham } = detail;
  return (
    <DetailCard icon={Users} title={DETAIL_TEXT.sections.patient}>
      <DetailFacts>
        <DetailFact label={rows.name}>{nguoiKham.hoTen}</DetailFact>
        <DetailFact label={rows.relation}>
          {relationLabel(nguoiKham.quanHe)}
        </DetailFact>
        <DetailFact label={rows.phone}>
          {nguoiKham.soDienThoai ?? DETAIL_TEXT.notProvided}
        </DetailFact>
        <DetailFact label={rows.gender}>
          {genderLabel(nguoiKham.gioiTinh)}
        </DetailFact>
        <DetailFact label={rows.birth}>
          {birthDateLabel(nguoiKham.ngaySinh)}
        </DetailFact>
        <DetailFact label={rows.reason} wide>
          <span className="whitespace-pre-line">
            {detail.lyDoKham ?? DETAIL_TEXT.noReason}
          </span>
        </DetailFact>
      </DetailFacts>
    </DetailCard>
  );
}

export function ScheduleCard({ detail }: { detail: DoctorAppointmentDetail }) {
  const { rows } = DETAIL_TEXT;
  return (
    <DetailCard icon={CalendarDays} title={DETAIL_TEXT.sections.appointment}>
      <DetailFacts>
        <DetailFact label={rows.date}>
          {formatVietnamWeekdayDate(detail.thoiGian)}
        </DetailFact>
        <DetailFact label={rows.time}>{timeAndShift(detail)}</DetailFact>
        <DetailFact label={rows.specialty}>{detail.chuyenKhoa}</DetailFact>
        <DetailFact label={rows.branch}>{detail.chiNhanh}</DetailFact>
      </DetailFacts>
    </DetailCard>
  );
}
