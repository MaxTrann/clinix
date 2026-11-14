import { useId, type ReactNode } from 'react';
import {
  formatVietnamTime,
  formatVietnamWeekdayDate,
  formatVnd,
} from '../../common/appointment-format';
import { DetailRow } from '../../common/detail-card';
import type { ReceptionAppointmentDetail } from '../api/reception-appointment-types';
import { DETAIL_TEXT, dateTimeLabel } from './detail-messages';

// Khối thông tin của Figma `488:2`: nền xám nhạt, tiêu đề chữ hoa nhỏ, các dòng "nhãn, giá trị" (dùng lại `DetailRow` của `common/`). Màu chữ phụ theo thang chuẩn của
// ADR 0004 (`gray-600`), không chép `#99a1af` của Figma (2,60:1).
function InfoBlock(props: { title: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="mt-4 rounded-xl bg-gray-50 px-4 py-3.5"
    >
      <h3
        id={titleId}
        className="text-xs font-semibold tracking-wide text-gray-600"
      >
        {props.title}
      </h3>
      <dl className="mt-1.5">{props.children}</dl>
    </section>
  );
}

// Ba khối theo Figma và API. Bỏ `Email` (API không trả, Q32) và `Kênh đặt` (Q37); thêm `Dịch vụ`, `Chi nhánh`, `Tiền cọc` (API có, Figma thiếu). Giá trị lấy từ MỘT nguồn là chi
// tiết (không trộn dòng danh sách cũ). Tiền là chuỗi decimal đưa nguyên ra `formatVnd`: không cộng, trừ, nhân.
export function DetailSections({
  detail,
}: {
  detail: ReceptionAppointmentDetail;
}) {
  const { rows } = DETAIL_TEXT;
  const { nguoiKham, nguoiDat } = detail;
  const when = dateTimeLabel(
    formatVietnamWeekdayDate(detail.thoiGian),
    formatVietnamTime(detail.thoiGian),
  );

  return (
    <>
      <InfoBlock title={DETAIL_TEXT.sections.patient}>
        <DetailRow
          label={rows.name}
          note={
            nguoiKham.laBanThan
              ? DETAIL_TEXT.ownPerson
              : DETAIL_TEXT.relativePerson
          }
        >
          {nguoiKham.hoTen}
        </DetailRow>
        {!nguoiKham.laBanThan && (
          <DetailRow label={rows.booker}>{nguoiDat.hoTen}</DetailRow>
        )}
        <DetailRow
          label={rows.phone}
          note={nguoiKham.laBanThan ? undefined : DETAIL_TEXT.bookerPhone}
        >
          {nguoiDat.soDienThoai}
        </DetailRow>
        <DetailRow label={rows.reason}>
          {detail.lyDoKham ?? DETAIL_TEXT.noReason}
        </DetailRow>
      </InfoBlock>

      <InfoBlock title={DETAIL_TEXT.sections.doctor}>
        <DetailRow label={rows.doctor}>{detail.bacSi}</DetailRow>
        <DetailRow label={rows.specialty}>{detail.chuyenKhoa}</DetailRow>
        <DetailRow label={rows.service}>{detail.dichVu}</DetailRow>
        <DetailRow label={rows.price}>
          {formatVnd(detail.giaSnapshot)}
        </DetailRow>
      </InfoBlock>

      <InfoBlock title={DETAIL_TEXT.sections.appointment}>
        <DetailRow label={rows.code}>
          <span className="font-mono">{detail.maLichHen}</span>
        </DetailRow>
        <DetailRow label={rows.date}>{when}</DetailRow>
        <DetailRow label={rows.branch}>{detail.chiNhanh}</DetailRow>
        <DetailRow label={rows.deposit}>{formatVnd(detail.tienCoc)}</DetailRow>
        {detail.hanThanhToan !== null && (
          <DetailRow label={rows.paymentDeadline}>
            {dateTimeLabel(
              formatVietnamWeekdayDate(detail.hanThanhToan),
              formatVietnamTime(detail.hanThanhToan),
            )}
          </DetailRow>
        )}
        {detail.trangThai === 'DaHuy' && (
          <DetailRow label={rows.cancelReason}>
            {detail.lyDoHuy ?? DETAIL_TEXT.noReason}
          </DetailRow>
        )}
      </InfoBlock>

      {detail.conPhaiThu !== null && (
        <section className="mt-4 rounded-xl bg-gray-50 px-4 py-3">
          <dl>
            <DetailRow label={rows.price}>
              {formatVnd(detail.giaSnapshot)}
            </DetailRow>
            <DetailRow label={rows.due}>
              <span className="font-bold text-warning">
                {formatVnd(detail.conPhaiThu)}
              </span>
            </DetailRow>
          </dl>
        </section>
      )}
    </>
  );
}
