import { ChevronLeft } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router';
import { DOCTOR_APPOINTMENTS_PATH } from '../../../../../shared/routes/booking-paths';
import { LoadingState } from '../../../../../shared/ui/loading-state';
import { DetailFailure } from '../../common/detail-failure';
import { readListSearch } from '../../common/list-search';
import { DETAIL_FAILURE_TEXTS, DETAIL_TEXT } from './detail-messages';
import { AppointmentHero, ExamineeCard, ScheduleCard } from './detail-sections';
import { RecordCard } from './record-card';
import { StatusTimeline } from './status-timeline';
import { useDoctorDetail } from './use-doctor-detail';

// Trang chi tiết một ca khám của Bác sĩ (booking F11; Figma `458:2`): `← Lịch hẹn`, h1 `Chi tiết ca khám`, thẻ đầu (mã, chip, dịch vụ, người khám, ngày giờ, chuyên khoa, chi nhánh); lưới hai cột: bên trái
// `Thông tin người khám` và `Hồ sơ khám bệnh`, bên phải `Thông tin lịch hẹn` và `Trạng thái ca khám`. Nội dung từ MỘT nguồn là chi tiết. Chỉ ĐỌC (GET): KHÔNG nút đổi trạng thái hay ghi hồ sơ (`Hoàn thành ca khám`,
// `Ghi hồ sơ khám`, `Chỉnh sửa ghi chú` là của module `doctor`: chỗ thêm là cột phải của hàng tiêu đề trang này và thẻ `RecordCard`). Liên kết quay lại và h1 hiện ngay, kể cả khi đang tải hay lỗi.
export function DoctorDetailPage({ maLichHen }: { maLichHen: string }) {
  const location = useLocation();
  const { view, reload } = useDoctorDetail(maLichHen);
  const ready = view.kind === 'ready' ? view : null;

  return (
    <section
      aria-busy={ready?.refreshing ?? view.kind === 'loading'}
      className="max-w-[67.5rem]"
    >
      <Link
        to={{
          pathname: DOCTOR_APPOINTMENTS_PATH,
          search: readListSearch(location.state),
        }}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 hover:underline"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        {DETAIL_TEXT.back}
      </Link>

      <h1 className="pt-3 text-[1.3333rem] leading-normal font-bold text-gray-900">
        {DETAIL_TEXT.title}
      </h1>

      {view.kind === 'loading' && (
        <LoadingState message={DETAIL_TEXT.loading} />
      )}
      {view.kind === 'error' && (
        <DetailFailure
          error={view.error}
          onRetry={reload}
          texts={DETAIL_FAILURE_TEXTS}
        />
      )}
      {ready !== null && (
        <div className="mt-4 space-y-4">
          <AppointmentHero detail={ready.data} />
          <div className="grid items-start gap-4 lg:grid-cols-5">
            <div className="space-y-4 lg:col-span-3">
              <ExamineeCard detail={ready.data} />
              <RecordCard trangThai={ready.data.trangThai} />
            </div>
            <div className="space-y-4 lg:col-span-2">
              <ScheduleCard detail={ready.data} />
              <StatusTimeline
                trangThai={ready.data.trangThai}
                ngayDat={ready.data.ngayDat}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// Phần tử của route: đọc mã lịch từ đường dẫn và đặt `key` theo mã, nên đổi sang lịch khác thì trang dựng lại và bản cũ của lịch khác không bao giờ hiện cho lịch mới
export function DoctorDetailRoute() {
  const { maLichHen = '' } = useParams();
  return <DoctorDetailPage key={maLichHen} maLichHen={maLichHen} />;
}
