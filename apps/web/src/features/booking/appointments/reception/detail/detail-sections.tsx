import {
  Calendar,
  CalendarDays,
  MapPin,
  Stethoscope,
  User,
  Users,
  Wallet,
} from 'lucide-react';
import {
  formatVietnamDate,
  formatVietnamTime,
  formatVietnamWeekdayDate,
  formatVnd,
} from '../../common/appointment-format';
import {
  DetailCard,
  DetailFact as Fact,
  DetailFacts as Facts,
  DetailRow,
} from '../../common/detail-card';
import { DetailHero } from '../../common/detail-frame';
import type { ReceptionAppointmentDetail } from '../api/reception-appointment-types';
import { DETAIL_TEXT, dateTimeLabel } from './detail-messages';

// Thẻ đầu và ba thẻ thông tin của trang chi tiết Lễ tân (booking F12b; F8 dựng ba khối nền xám trong NGĂN, Figma `488:2`, nay là TRANG cùng khung với Quản trị viên và Bệnh nhân, UI-12). Giá trị lấy
// từ MỘT nguồn là chi tiết (không trộn dòng danh sách cũ: trạng thái có thể đã đổi ở nơi khác). Tiền là chuỗi decimal đưa nguyên ra `formatVnd`: không cộng, trừ, nhân, và `Còn phải thu` CHỈ khi
// `conPhaiThu` khác `null` (B3: chỉ `DaXacNhan`; không tự tính ở client). Bỏ `Email` (API không trả, Q32) và `Kênh đặt` (Q37); thêm `Dịch vụ`, `Chi nhánh`, `Tiền cọc`, `Hạn thanh toán`, `Lý do hủy`
// (API có, Figma thiếu) [đề xuất]. Ngày, giờ theo giờ Việt Nam.

// Thẻ đầu (như trang Bệnh nhân, Figma `420:2`): mã, chip trạng thái, chuyên khoa và bốn ô Người khám, Ngày khám, Bác sĩ, Chi nhánh
export function ReceptionHero({
  detail,
}: {
  detail: ReceptionAppointmentDetail;
}) {
  const { rows } = DETAIL_TEXT;
  return (
    <DetailHero
      ariaLabel={DETAIL_TEXT.summary}
      code={detail.maLichHen}
      status={detail.trangThai}
      title={detail.chuyenKhoa}
      cells={[
        {
          icon: User,
          label: rows.person,
          value: detail.nguoiKham.hoTen,
          note: detail.nguoiKham.laBanThan
            ? DETAIL_TEXT.ownPerson
            : DETAIL_TEXT.relativePerson,
        },
        {
          icon: Calendar,
          label: rows.date,
          value: formatVietnamWeekdayDate(detail.thoiGian),
          note: formatVietnamTime(detail.thoiGian),
        },
        { icon: Stethoscope, label: rows.doctor, value: detail.bacSi },
        { icon: MapPin, label: rows.branch, value: detail.chiNhanh },
      ]}
    />
  );
}

// Thẻ `Thông tin bệnh nhân`: họ tên kèm Bản thân hay Người thân, người đặt (khi khác người khám), SĐT của NGƯỜI ĐẶT (Q32), lý do khám
export function ReceptionPatientCard({
  detail,
}: {
  detail: ReceptionAppointmentDetail;
}) {
  const { rows } = DETAIL_TEXT;
  const { nguoiKham, nguoiDat } = detail;
  return (
    <DetailCard icon={Users} title={DETAIL_TEXT.sections.patient}>
      <Facts>
        <Fact
          label={rows.name}
          note={
            nguoiKham.laBanThan
              ? DETAIL_TEXT.ownPerson
              : DETAIL_TEXT.relativePerson
          }
        >
          {nguoiKham.hoTen}
        </Fact>
        {!nguoiKham.laBanThan && (
          <Fact label={rows.booker}>{nguoiDat.hoTen}</Fact>
        )}
        <Fact
          label={rows.phone}
          note={nguoiKham.laBanThan ? undefined : DETAIL_TEXT.bookerPhone}
        >
          {nguoiDat.soDienThoai}
        </Fact>
        <Fact label={rows.reason} wide>
          <span className="whitespace-pre-line">
            {detail.lyDoKham ?? DETAIL_TEXT.noReason}
          </span>
        </Fact>
      </Facts>
    </DetailCard>
  );
}

// Thẻ `Thông tin lịch hẹn`: ngày, giờ, bác sĩ, chuyên khoa, dịch vụ, chi nhánh và, khi đã hủy, lý do hủy. Tiền ở `ReceptionCostCard`
export function ReceptionAppointmentCard({
  detail,
}: {
  detail: ReceptionAppointmentDetail;
}) {
  const { rows } = DETAIL_TEXT;
  return (
    <DetailCard icon={CalendarDays} title={DETAIL_TEXT.sections.appointment}>
      <Facts>
        <Fact label={rows.date}>{formatVietnamDate(detail.thoiGian)}</Fact>
        <Fact label={rows.time}>{formatVietnamTime(detail.thoiGian)}</Fact>
        <Fact label={rows.doctor}>{detail.bacSi}</Fact>
        <Fact label={rows.specialty}>{detail.chuyenKhoa}</Fact>
        <Fact label={rows.service}>{detail.dichVu}</Fact>
        <Fact label={rows.branch}>{detail.chiNhanh}</Fact>
        {detail.trangThai === 'DaHuy' && (
          <Fact label={rows.cancelReason} wide>
            <span className="whitespace-pre-line">
              {detail.lyDoHuy ?? DETAIL_TEXT.noReason}
            </span>
          </Fact>
        )}
      </Facts>
    </DetailCard>
  );
}

// Thẻ `Chi phí & Thanh toán`: giá khám, tiền cọc, hạn thanh toán (khi có), còn phải thu (khi `conPhaiThu` khác `null`)
export function ReceptionCostCard({
  detail,
}: {
  detail: ReceptionAppointmentDetail;
}) {
  const { rows } = DETAIL_TEXT;
  return (
    <DetailCard icon={Wallet} title={DETAIL_TEXT.sections.cost}>
      <dl className="px-5 py-1">
        <DetailRow label={rows.price}>
          {formatVnd(detail.giaSnapshot)}
        </DetailRow>
        <DetailRow label={rows.deposit}>{formatVnd(detail.tienCoc)}</DetailRow>
        {detail.hanThanhToan !== null && (
          <DetailRow label={rows.paymentDeadline}>
            {dateTimeLabel(
              formatVietnamWeekdayDate(detail.hanThanhToan),
              formatVietnamTime(detail.hanThanhToan),
            )}
          </DetailRow>
        )}
        {detail.conPhaiThu !== null && (
          <DetailRow label={rows.due}>
            <span className="font-bold text-warning">
              {formatVnd(detail.conPhaiThu)}
            </span>
          </DetailRow>
        )}
      </dl>
    </DetailCard>
  );
}
