import { Calendar, Stethoscope } from 'lucide-react';
import type { PatientAppointmentDetail } from '../api/patient-appointment-types';
import { LIST_TEXT } from '../list-messages';
import { DetailCard, DetailRow } from '../../common/detail-card';
import { DETAIL_TEXT } from './detail-messages';

// Cột trái của trang chi tiết (Figma `420:2`). `Dịch vụ` là hàng THÊM (Figma thiếu mà API có, Đại duyệt 12/11/2026); `Kênh đặt` BỎ (PLAN Q37, L-list).
// `lyDoKham` là dữ liệu người dùng nhập: chỉ in ra dạng chữ (React thoát ký tự), `null` hay rỗng ⇒ "Không ghi lý do".
export function DetailInfoCard({
  detail,
}: {
  detail: PatientAppointmentDetail;
}) {
  const reason = detail.lyDoKham === null ? '' : detail.lyDoKham.trim();
  return (
    <DetailCard icon={Calendar} title={DETAIL_TEXT.infoTitle}>
      <dl className="px-5 py-1">
        <DetailRow label={DETAIL_TEXT.service}>{detail.dichVu}</DetailRow>
        <DetailRow label={DETAIL_TEXT.branch}>{detail.chiNhanh}</DetailRow>
        <DetailRow label={DETAIL_TEXT.reason}>
          {reason === '' ? DETAIL_TEXT.noReason : reason}
        </DetailRow>
        <DetailRow
          label={DETAIL_TEXT.person}
          note={
            detail.nguoiKham.laBanThan
              ? LIST_TEXT.ownPerson
              : LIST_TEXT.relativePerson
          }
        >
          {detail.nguoiKham.hoTen}
        </DetailRow>
      </dl>
    </DetailCard>
  );
}

// Chữ tĩnh của Figma: hồ sơ khám do `doctor` ghi (`ho_so_kham` chưa có), không có dữ liệu nào để hiện
export function RecordCard() {
  return (
    <DetailCard icon={Stethoscope} title={DETAIL_TEXT.recordTitle}>
      <p className="px-5 py-4 text-sm text-gray-600">
        {DETAIL_TEXT.recordNote}
      </p>
    </DetailCard>
  );
}
