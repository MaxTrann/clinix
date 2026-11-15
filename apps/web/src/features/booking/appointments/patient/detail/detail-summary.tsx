import { Calendar, MapPin, Stethoscope, User } from 'lucide-react';
import {
  formatVietnamTime,
  formatVietnamWeekdayDate,
} from '../../common/appointment-format';
import { DetailHero } from '../../common/detail-frame';
import type { PatientAppointmentDetail } from '../api/patient-appointment-types';
import { LIST_TEXT } from '../list-messages';
import { DETAIL_TEXT } from './detail-messages';

// Thẻ đầu của trang chi tiết (Figma `420:2`): mã, chip trạng thái, tên chuyên khoa và bốn ô Bác sĩ, Ngày khám, Chi nhánh, Người khám. Giờ theo giờ Việt Nam
// (hàm của F1). Không có chức danh bác sĩ và "(Ca sáng)" vì API không trả (TRACKING 3.27 F2-E (5)). F12: dựng bằng `DetailHero` dùng chung với Admin và Bác sĩ (UI-12).
export function DetailSummary({
  detail,
}: {
  detail: PatientAppointmentDetail;
}) {
  return (
    <DetailHero
      ariaLabel={DETAIL_TEXT.summary}
      code={detail.maLichHen}
      status={detail.trangThai}
      title={detail.chuyenKhoa}
      cells={[
        { icon: Stethoscope, label: DETAIL_TEXT.doctor, value: detail.bacSi },
        {
          icon: Calendar,
          label: DETAIL_TEXT.visitDate,
          value: formatVietnamWeekdayDate(detail.thoiGian),
          note: formatVietnamTime(detail.thoiGian),
        },
        { icon: MapPin, label: DETAIL_TEXT.branch, value: detail.chiNhanh },
        {
          icon: User,
          label: DETAIL_TEXT.person,
          value: detail.nguoiKham.hoTen,
          note: detail.nguoiKham.laBanThan
            ? LIST_TEXT.ownPerson
            : LIST_TEXT.relativePerson,
        },
      ]}
    />
  );
}
