import { Star } from 'lucide-react';
import { Link } from 'react-router';
import { formatVnd } from '../../../shared/money/format-vnd';
import { bookingInfoPath } from '../../../shared/routes/booking-paths';
import type { SuggestedDoctor } from '../api/chatbot-types';
import {
  CHATBOT_TEXT,
  suggestPrice,
  suggestSlotSuffix,
} from '../widget/chatbot-text';
import { entityPath } from '../widget/entity-paths';
import { doctorDisplayName } from './doctor-label';
import { ratingLabel, slotDayMonthVn, timeLabelVn } from './suggest-format';
import { LINK_CLASS, PILL_CLASS } from './suggest-styles';

const TEXT = CHATBOT_TEXT.suggest;

function EntityLink({
  kind,
  id,
  children,
}: {
  kind: 'BacSi' | 'ChiNhanh';
  id: string;
  children: string;
}) {
  const path = entityPath(kind, id);
  if (path === null) return <span className="font-medium">{children}</span>;
  return (
    <Link to={path} className={LINK_CLASS}>
      {children}
    </Link>
  );
}

// Thẻ một bác sĩ: tên có chức danh (liên kết hồ sơ), chi nhánh, giá, điểm (ẩn khi chưa có), và các ô giờ trống. Ô giờ là LIÊN KẾT sang bước 4 của
// Đặt lịch khám (`bookingInfoPath`): máy chủ booking suy bác sĩ, dịch vụ, chi nhánh từ khung giờ; chatbot KHÔNG giữ chỗ, KHÔNG gọi API ghi.
// Khách bấm thì `RequireAuth` đưa tới đăng nhập rồi quay lại đúng đường dẫn này (`state.from`, T9). Giờ do máy chủ tính: ở đây chỉ đổi định dạng.
export function DoctorCard({ doctor }: { doctor: SuggestedDoctor }) {
  const name = doctorDisplayName(doctor.chucDanh, doctor.hoTen);
  const rating = ratingLabel(doctor.danhGia);
  const profile = entityPath('BacSi', doctor.bacSiId);
  return (
    <li className="rounded-xl border border-gray-200 bg-white p-3">
      <p className="text-sm font-semibold break-words">
        <EntityLink kind="BacSi" id={doctor.bacSiId}>
          {name}
        </EntityLink>
      </p>
      <p className="mt-0.5 text-sm break-words text-gray-700">
        <EntityLink kind="ChiNhanh" id={doctor.chiNhanh.chiNhanhId}>
          {doctor.chiNhanh.ten}
        </EntityLink>
      </p>
      <p className="mt-0.5 text-sm text-gray-900">
        {suggestPrice(formatVnd(doctor.giaKham))}
      </p>
      {rating !== null && (
        <p className="mt-0.5 flex items-center gap-1 text-sm text-gray-700">
          <Star
            aria-hidden="true"
            className="size-3.5 fill-amber-500 text-amber-500"
          />
          {rating}
        </p>
      )}
      <ul
        aria-label={`${TEXT.slotGroup}: ${name}`}
        className="mt-2 flex flex-wrap gap-1.5"
      >
        {doctor.khungGio.map((slot) => (
          <li key={slot.khungGioId}>
            <Link to={bookingInfoPath(slot.khungGioId)} className={PILL_CLASS}>
              {timeLabelVn(slot.batDau)}
              <span className="sr-only">
                {suggestSlotSuffix(slotDayMonthVn(slot.batDau), name)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {profile !== null && (
        <Link
          to={profile}
          className={`mt-2 inline-block text-sm ${LINK_CLASS}`}
        >
          {TEXT.fullSchedule}
        </Link>
      )}
    </li>
  );
}
