import { Plus } from 'lucide-react';
import { Link } from 'react-router';
import { BOOKING_PATH } from '../../../../shared/routes/booking-paths';
import { AppointmentFilters } from './appointment-filters';
import { AppointmentResults } from './appointment-results';
import { LIST_TEXT } from './list-messages';
import { useAppointmentList } from './use-appointment-list';
import { useFilterOptions } from './use-filter-options';

// Trang "Lịch hẹn của tôi" của Bệnh nhân (booking F1; Figma `411:2`): tiêu đề và nút `Đặt lịch khám`, ô tìm và năm bộ lọc, thẻ lọc trạng thái có số đếm,
// bảng, chuyển trang. h1 luôn hiện, kể cả khi đang tải hay lỗi. Chỉ ĐỌC dữ liệu (GET): không gọi API ghi. Bộ lọc chỉ ở bộ nhớ của trang, không ở URL
// hay kho trình duyệt. Nút `Chi tiết` vô hiệu tới F2.
export function AppointmentListPage() {
  const list = useAppointmentList();
  const options = useFilterOptions();

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[1.3333rem] leading-normal font-bold text-gray-900">
            {LIST_TEXT.title}
          </h1>
          <p className="pt-[0.2667rem] text-[0.8667rem] leading-normal text-gray-600">
            {LIST_TEXT.subtitle}
          </p>
        </div>
        {/* Figma `#0092b8` chữ trắng chỉ 3,62:1: nền nút dùng `brand-strong` 5,28:1 (ADR 0004) */}
        <Link
          to={BOOKING_PATH}
          className="inline-flex min-h-[2.4rem] items-center gap-1.5 rounded-xl bg-brand-strong px-4 text-sm font-medium text-white hover:bg-cyan-800"
        >
          <Plus aria-hidden="true" className="size-4" />
          {LIST_TEXT.bookButton}
        </Link>
      </div>
      <AppointmentFilters list={list} options={options} />
      <AppointmentResults list={list} />
    </section>
  );
}
