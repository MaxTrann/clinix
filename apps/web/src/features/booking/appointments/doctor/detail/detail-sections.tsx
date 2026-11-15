import { CalendarDays, MapPin, Stethoscope, User, Users } from 'lucide-react';
import {
  formatVietnamTime,
  formatVietnamWeekdayDate,
} from '../../common/appointment-format';
import { DetailCard, DetailFact, DetailFacts } from '../../common/detail-card';
import { DetailHero } from '../../common/detail-frame';
import type { DoctorAppointmentDetail } from '../api/doctor-appointment-types';
import { shiftLabel } from '../list-messages';
import {
  birthDateLabel,
  DETAIL_TEXT,
  genderLabel,
  relationLabel,
} from './detail-messages';

// "08:00 · Ca sáng" (Figma): giờ Việt Nam rồi tên ca; mã ca lạ thì chỉ có giờ (không lộ mã thô)
function timeAndShift(detail: DoctorAppointmentDetail): string {
  const time = formatVietnamTime(detail.thoiGian);
  const shift = shiftLabel(detail.ca);
  return shift === null ? time : `${time} · ${shift}`;
}

// Thẻ đầu của trang (Figma `458:2`): mã lịch chữ đơn cách, chip trạng thái, tên dịch vụ, người khám kèm quan hệ, ngày và "giờ · ca", chuyên khoa, chi nhánh. Bỏ hàng tên chính bác sĩ (B5 không trả và người xem
// chính là bác sĩ, Q33): hàng đó chỉ còn chuyên khoa [đề xuất]. Tên dịch vụ làm tiêu đề thay "Khám {chuyên khoa}" của Figma [đề xuất].
// F12 (UI-12, Đại 14/11/2026): dựng bằng `DetailHero` dùng chung với Bệnh nhân và Admin (bốn ô một hàng, nhãn nhỏ trên giá trị đậm) thay lưới hai cột của Figma `458:2`; bốn ô là Người khám, Ngày khám, Chuyên khoa, Chi nhánh.
export function AppointmentHero({
  detail,
}: {
  detail: DoctorAppointmentDetail;
}) {
  const { rows } = DETAIL_TEXT;
  return (
    <DetailHero
      ariaLabel={DETAIL_TEXT.summary}
      code={detail.maLichHen}
      status={detail.trangThai}
      title={detail.dichVu}
      cells={[
        {
          icon: User,
          label: rows.person,
          value: detail.nguoiKham.hoTen,
          note: relationLabel(detail.nguoiKham.quanHe),
        },
        {
          icon: CalendarDays,
          label: rows.date,
          value: formatVietnamWeekdayDate(detail.thoiGian),
          note: timeAndShift(detail),
        },
        {
          icon: Stethoscope,
          label: rows.specialty,
          value: detail.chuyenKhoa,
        },
        { icon: MapPin, label: rows.branch, value: detail.chiNhanh },
      ]}
    />
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
