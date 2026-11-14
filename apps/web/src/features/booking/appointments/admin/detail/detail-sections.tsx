import { CalendarDays, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  formatVietnamDate,
  formatVietnamTime,
  formatVnd,
} from '../../common/appointment-format';
import { DetailCard } from '../../common/detail-card';
import type { OperationsAppointmentDetail } from '../../common/operations-appointment';
import { DETAIL_TEXT, historyWhen } from './detail-messages';

// Một cặp "nhãn, giá trị" của thẻ (Figma `512:2`: nhãn nhỏ xám ở trên, giá trị đậm vừa ở dưới, hai cột). Màu chữ phụ theo thang chuẩn của ADR 0004 (`gray-600`), không chép `#6a7282` của Figma.
// `wide` chiếm cả hai cột (câu dài như lý do khám).
function Fact(props: {
  label: string;
  children: ReactNode;
  wide?: boolean;
  note?: string;
}) {
  return (
    <div className={props.wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-xs text-gray-600">{props.label}</dt>
      <dd className="pt-0.5 text-sm font-medium break-words text-gray-900">
        {props.children}
        {props.note !== undefined && (
          <span className="block text-xs font-normal text-gray-600">
            {props.note}
          </span>
        )}
      </dd>
    </div>
  );
}

function Facts({ children }: { children: ReactNode }) {
  return (
    <dl className="grid gap-x-4 gap-y-3 px-5 py-4 sm:grid-cols-2">
      {children}
    </dl>
  );
}

// Hai thẻ của Figma `512:2`: `Thông tin lịch hẹn` và `Thông tin bệnh nhân`. Giá trị lấy từ MỘT nguồn là chi tiết. Tiền là chuỗi decimal đưa nguyên ra `formatVnd`: không cộng, trừ, nhân,
// và `Còn phải thu` CHỈ khi `conPhaiThu` khác `null` (B4: chỉ `DaXacNhan`; không tự tính ở client). Bỏ `Kênh đặt`, `Email`, `Giới tính`, `Ngày sinh` (Q32, B4) và thẻ `Thanh toán`; thêm `Giá khám`,
// `Tiền cọc`, `Hạn thanh toán`, `Lý do hủy`, `Lý do khám` (API có, Figma thiếu) [đề xuất]. Ngày, giờ theo giờ Việt Nam.
export function DetailSections({
  detail,
}: {
  detail: OperationsAppointmentDetail;
}) {
  const { rows } = DETAIL_TEXT;
  const { nguoiKham, nguoiDat } = detail;
  return (
    <>
      <DetailCard icon={CalendarDays} title={DETAIL_TEXT.sections.appointment}>
        <Facts>
          <Fact label={rows.date}>{formatVietnamDate(detail.thoiGian)}</Fact>
          <Fact label={rows.time}>{formatVietnamTime(detail.thoiGian)}</Fact>
          <Fact label={rows.doctor}>{detail.bacSi}</Fact>
          <Fact label={rows.specialty}>{detail.chuyenKhoa}</Fact>
          <Fact label={rows.service}>{detail.dichVu}</Fact>
          <Fact label={rows.branch}>{detail.chiNhanh}</Fact>
          <Fact label={rows.price}>{formatVnd(detail.giaSnapshot)}</Fact>
          <Fact label={rows.deposit}>{formatVnd(detail.tienCoc)}</Fact>
          {detail.hanThanhToan !== null && (
            <Fact label={rows.paymentDeadline}>
              {historyWhen(
                formatVietnamDate(detail.hanThanhToan),
                formatVietnamTime(detail.hanThanhToan),
              )}
            </Fact>
          )}
          {detail.conPhaiThu !== null && (
            <Fact label={rows.due}>
              <span className="font-bold text-warning">
                {formatVnd(detail.conPhaiThu)}
              </span>
            </Fact>
          )}
          {detail.trangThai === 'DaHuy' && (
            <Fact label={rows.cancelReason} wide>
              <span className="whitespace-pre-line">
                {detail.lyDoHuy ?? DETAIL_TEXT.noReason}
              </span>
            </Fact>
          )}
        </Facts>
      </DetailCard>

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
    </>
  );
}
