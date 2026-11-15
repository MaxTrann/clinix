import { useLocation, useParams } from 'react-router';
import { DOCTOR_APPOINTMENTS_PATH } from '../../../../../shared/routes/booking-paths';
import { LoadingState } from '../../../../../shared/ui/loading-state';
import { ExamHeaderActions, ExamRecordCard } from '../../../../doctor';
import { DetailFailure } from '../../common/detail-failure';
import { DetailColumns, DetailPageFrame } from '../../common/detail-frame';
import { readListSearch } from '../../common/list-search';
import { DETAIL_FAILURE_TEXTS, DETAIL_TEXT } from './detail-messages';
import { AppointmentHero, ExamineeCard, ScheduleCard } from './detail-sections';
import { StatusTimeline } from './status-timeline';
import { useDoctorDetail } from './use-doctor-detail';

// Trang chi tiết một ca khám của Bác sĩ (booking F11; Figma `458:2`; F12 dựng lại theo KHUNG CHUNG của Bệnh nhân, UI-12, Đại 14/11/2026): `← Lịch hẹn`, h1 `Chi tiết ca khám`, thẻ đầu (mã, chip, dịch vụ, bốn ô Người khám,
// Ngày khám, Chuyên khoa, Chi nhánh); lưới hai cột: bên trái `Thông tin người khám` và `Hồ sơ khám bệnh`, bên phải `Thông tin lịch hẹn` và `Trạng thái ca khám`. Nội dung từ MỘT nguồn là chi tiết. Chi tiết chỉ ĐỌC (GET).
// Nút `Hoàn thành ca khám` (doctor-exam F1, POST; Figma `459:2`, `461:2`) do module `doctor` cung cấp: `ExamHeaderActions` đặt ở `headerAside` của `DetailPageFrame`, import CHỈ qua `features/doctor/index.ts` (Q20 phương án C;
// `trangThai` và `reload` đi qua props, không import kiểu của `doctor` hay của booking qua lại). Thẻ `Hồ sơ khám bệnh` (doctor-exam F2, chỉ đọc) cũng của `doctor`: `ExamRecordCard` nhận `trangThai` và `ghiChuKham` qua cùng đường `index.ts`; nút `Ghi hồ sơ khám`, `Chỉnh sửa ghi chú` là F3.
// Liên kết quay lại và h1 hiện ngay, kể cả khi đang tải hay lỗi.
export function DoctorDetailPage({ maLichHen }: { maLichHen: string }) {
  const location = useLocation();
  const { view, reload } = useDoctorDetail(maLichHen);
  const ready = view.kind === 'ready' ? view : null;

  return (
    <DetailPageFrame
      backTo={{
        pathname: DOCTOR_APPOINTMENTS_PATH,
        search: readListSearch(location.state),
      }}
      backLabel={DETAIL_TEXT.back}
      title={DETAIL_TEXT.title}
      busy={ready?.refreshing ?? view.kind === 'loading'}
      headerAside={
        ready === null ? undefined : (
          <ExamHeaderActions
            maLichHen={maLichHen}
            trangThai={ready.data.trangThai}
            onChanged={reload}
          />
        )
      }
    >
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
        <div className="mt-5 flex flex-col gap-4">
          <AppointmentHero detail={ready.data} />
          <DetailColumns
            main={
              <>
                <ExamineeCard detail={ready.data} />
                <ExamRecordCard
                  trangThai={ready.data.trangThai}
                  ghiChuKham={ready.data.ghiChuKham}
                />
              </>
            }
            side={
              <>
                <ScheduleCard detail={ready.data} />
                <StatusTimeline
                  trangThai={ready.data.trangThai}
                  ngayDat={ready.data.ngayDat}
                />
              </>
            }
          />
        </div>
      )}
    </DetailPageFrame>
  );
}

// Phần tử của route: đọc mã lịch từ đường dẫn và đặt `key` theo mã, nên đổi sang lịch khác thì trang dựng lại và bản cũ của lịch khác không bao giờ hiện cho lịch mới
export function DoctorDetailRoute() {
  const { maLichHen = '' } = useParams();
  return <DoctorDetailPage key={maLichHen} maLichHen={maLichHen} />;
}
