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
import type { OperationsAppointmentDetail } from '../../common/operations-appointment';
import { DETAIL_TEXT, historyWhen } from './detail-messages';

// Thẻ đầu, hai thẻ thông tin và thẻ chi phí của trang chi tiết Quản trị viên (booking F10; F12 dựng lại theo khung chung của Bệnh nhân, UI-11, UI-12). Giá trị lấy từ MỘT nguồn là chi tiết. Tiền là chuỗi
// decimal đưa nguyên ra `formatVnd`: không cộng, trừ, nhân, và `Còn phải thu` CHỈ khi `conPhaiThu` khác `null` (B4: chỉ `DaXacNhan`; không tự tính ở client). Bỏ `Kênh đặt`, `Email`, `Giới tính`, `Ngày sinh`
// (Q32, B4); thêm `Giá khám`, `Tiền cọc`, `Hạn thanh toán`, `Lý do hủy`, `Lý do khám` (API có, Figma thiếu) [đề xuất]. Ngày, giờ theo giờ Việt Nam.

// Thẻ đầu (như trang Bệnh nhân, Figma `420:2`): mã, chip trạng thái, chuyên khoa và bốn ô Bác sĩ, Ngày khám, Chi nhánh, Người khám
export function AdminHero({ detail }: { detail: OperationsAppointmentDetail }) {
  const { rows } = DETAIL_TEXT;
  return (
    <DetailHero
      ariaLabel={DETAIL_TEXT.summary}
      code={detail.maLichHen}
      status={detail.trangThai}
      title={detail.chuyenKhoa}
      cells={[
        { icon: Stethoscope, label: rows.doctor, value: detail.bacSi },
        {
          icon: Calendar,
          label: rows.date,
          value: formatVietnamWeekdayDate(detail.thoiGian),
          note: formatVietnamTime(detail.thoiGian),
        },
        { icon: MapPin, label: rows.branch, value: detail.chiNhanh },
        {
          icon: User,
          label: rows.person,
          value: detail.nguoiKham.hoTen,
          note: detail.nguoiKham.laBanThan
            ? DETAIL_TEXT.ownPerson
            : DETAIL_TEXT.relativePerson,
        },
      ]}
    />
  );
}

// Thẻ `Thông tin lịch hẹn` (Figma `512:2`): ngày, giờ, bác sĩ, chuyên khoa, dịch vụ, chi nhánh và, khi đã hủy, lý do hủy. Tiền chuyển sang `AdminCostCard` (F12)
export function AdminAppointmentCard({
  detail,
}: {
  detail: OperationsAppointmentDetail;
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

// Thẻ `Chi phí & Thanh toán` (như trang Bệnh nhân; chỗ của thẻ `Thanh toán` ở Figma `512:2`): giá khám, tiền cọc, hạn thanh toán (khi có), còn phải thu (khi `conPhaiThu` khác `null`). KHÔNG số nào do client tính
export function AdminCostCard({
  detail,
}: {
  detail: OperationsAppointmentDetail;
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
            {historyWhen(
              formatVietnamDate(detail.hanThanhToan),
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

// Thẻ `Thông tin bệnh nhân`: họ tên kèm Bản thân hay Người thân, người đặt (khi khác người khám), SĐT của NGƯỜI ĐẶT (Q32), lý do khám
export function AdminPatientCard({
  detail,
}: {
  detail: OperationsAppointmentDetail;
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
