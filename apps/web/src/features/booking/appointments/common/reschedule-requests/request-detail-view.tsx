import type { MouseEvent, ReactNode, Ref } from 'react';
import { useLocation } from 'react-router';
import { ApiError } from '../../../../../shared/api/errors';
import { LoadingState } from '../../../../../shared/ui/loading-state';
import { BOOKING_ERROR_CODES } from '../../../api/booking-errors';
import { DetailFailure } from '../detail-failure';
import { DetailColumns, DetailPageFrame } from '../detail-frame';
import type { KeepPreviousView } from '../use-keep-previous';
import { listSearchOf } from './request-back';
import {
  DecisionCard,
  DesiredSlotCard,
  OriginalAppointmentCard,
  PatientRequestCard,
  RequestSummary,
} from './request-detail-sections';
import { REQUEST_TEXT } from './request-text';
import type { RequestDetail } from './request-types';

const DETAIL_TEXTS = {
  notFound: REQUEST_TEXT.notFound,
  sessionExpired: REQUEST_TEXT.sessionExpired,
  forbidden: REQUEST_TEXT.forbiddenDetail,
};

// Id sai dạng trên URL: máy chủ cũng trả đúng 404 `KHONG_TIM_THAY` cho id sai dạng nên web hiện cùng câu mà KHÔNG gọi API (`DetailFailure` chọn câu theo `maLoi`)
const INVALID_ID_ERROR = new ApiError(404, {
  maLoi: BOOKING_ERROR_CODES.NOT_FOUND,
  thongBao: 'Không tìm thấy dữ liệu.',
});

// Trang chi tiết MỘT yêu cầu đổi lịch (reschedule F4; PLAN reschedule 5.12): quay lại danh sách (khôi phục tab, trang và bộ lọc từ `state.listSearch` của liên kết `Chi tiết`, đã kiểm lại và chuẩn hoá), h1, thẻ đầu,
// rồi lưới hai cột: lịch gốc và yêu cầu của bệnh nhân bên trái, khung giờ mong muốn và xử lý bên phải. THUẦN HIỂN THỊ: nhận `view` đã tải (`useRequestDetail`) để nơi gọi (Lễ tân; Quản trị viên ở F5) tự gọi hook của mình
// và, ở Pha B, cắm nút Duyệt, Từ chối (`actions`) cùng các hộp (`children`) mà không sửa file này. KHÔNG biết vai trò. Một câu cho mọi lỗi 404 (không có, chi nhánh khác, id sai dạng: cùng thân, không lộ có tồn tại hay không).
export function RequestDetailView(props: {
  // `null` khi id trên URL không đúng dạng id BIGINT: không gọi API, hiện cùng câu "không tìm thấy"
  view: KeepPreviousView<RequestDetail> | null;
  reload: () => void;
  listPath: string;
  headingRef?: Ref<HTMLHeadingElement>;
  // Nút Duyệt, Từ chối (Pha B) trong thẻ "Xử lý"; chỉ hiện khi yêu cầu còn chờ
  actions?: ReactNode;
  // Hộp thoại và panel của nơi gọi (dựng ở cấp trang, không phụ thuộc chi tiết đang tải lại)
  children?: ReactNode;
  // Đang gửi thì không rời trang (rời giữa chừng làm mất kết quả; máy chủ vẫn xử lý)
  backDisabled?: boolean;
  onBackClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const location = useLocation();
  const { view } = props;
  const ready = view !== null && view.kind === 'ready' ? view : null;

  return (
    <DetailPageFrame
      headingRef={props.headingRef}
      backTo={{
        pathname: props.listPath,
        search: listSearchOf(location.state),
      }}
      backLabel={REQUEST_TEXT.back}
      title={REQUEST_TEXT.detailTitle}
      busy={ready?.refreshing ?? view?.kind === 'loading'}
      backDisabled={props.backDisabled}
      onBackClick={props.onBackClick}
    >
      {view === null && (
        <DetailFailure
          error={INVALID_ID_ERROR}
          onRetry={props.reload}
          texts={DETAIL_TEXTS}
        />
      )}
      {view?.kind === 'loading' && (
        <LoadingState message={REQUEST_TEXT.detailLoading} />
      )}
      {view?.kind === 'error' && (
        <DetailFailure
          error={view.error}
          onRetry={props.reload}
          texts={DETAIL_TEXTS}
        />
      )}
      {ready !== null && (
        <div className="mt-5 flex flex-col gap-4">
          <RequestSummary detail={ready.data} />
          <DetailColumns
            main={
              <>
                <OriginalAppointmentCard detail={ready.data} />
                <PatientRequestCard detail={ready.data} />
              </>
            }
            side={
              <>
                <DesiredSlotCard detail={ready.data} />
                <DecisionCard detail={ready.data} actions={props.actions} />
              </>
            }
          />
        </div>
      )}
      {props.children}
    </DetailPageFrame>
  );
}
