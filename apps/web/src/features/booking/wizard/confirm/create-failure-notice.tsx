import { Link } from 'react-router';
import {
  BOOKING_PATH,
  PATIENT_APPOINTMENTS_PATH,
  bookingInfoPath,
} from '../../../../shared/routes/booking-paths';
import { BookingNotice } from '../booking-notice';
import type { CreateFailure, CreateFailureLink } from './create-failure';

// Thông báo khi `POST /booking/appointments` lỗi (booking F5): câu và liên kết do `describeCreateFailure` chọn theo `maLoi`; ở đây chỉ vẽ. Liên kết "Lịch hẹn của tôi" mở TAB MỚI
// (như "Thêm hồ sơ người thân mới" ở Bước 4) để bản nháp ở tab này còn nguyên khi người dùng kiểm tra rồi quay lại. `reselect` TẠM về Bước 1 (F3 (k), TECH_DEBT 121).
const LINK_CLASS = 'mt-2 block font-medium underline';

function FailureLink({
  link,
  khungGioId,
}: {
  link: CreateFailureLink;
  khungGioId: string;
}) {
  switch (link) {
    case 'reselect':
      return (
        <Link to={BOOKING_PATH} className={LINK_CLASS}>
          Chọn lại dịch vụ
        </Link>
      );
    case 'editProfile':
      return (
        <Link to={bookingInfoPath(khungGioId)} className={LINK_CLASS}>
          Sửa thông tin người khám
        </Link>
      );
    case 'editReason':
      return (
        <Link to={bookingInfoPath(khungGioId)} className={LINK_CLASS}>
          Sửa lý do khám
        </Link>
      );
    case 'myAppointments':
      return (
        <Link
          to={PATIENT_APPOINTMENTS_PATH}
          target="_blank"
          rel="noopener noreferrer"
          className={LINK_CLASS}
        >
          Lịch hẹn của tôi
          <span className="sr-only"> (mở trong tab mới)</span>
        </Link>
      );
  }
}

export function CreateFailureNotice({
  failure,
  khungGioId,
}: {
  failure: CreateFailure;
  khungGioId: string;
}) {
  return (
    <BookingNotice message={failure.message}>
      {failure.note !== undefined && <p className="mt-2">{failure.note}</p>}
      {failure.links.map((link) => (
        <FailureLink key={link} link={link} khungGioId={khungGioId} />
      ))}
    </BookingNotice>
  );
}
