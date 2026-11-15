import { useRef } from 'react';
import { useLocation, useParams } from 'react-router';
import { RECEPTION_APPOINTMENTS_PATH } from '../../../../../shared/routes/booking-paths';
import { LoadingState } from '../../../../../shared/ui/loading-state';
import { DetailFailure } from '../../common/detail-failure';
import { DetailColumns, DetailPageFrame } from '../../common/detail-frame';
import { readListSearch } from '../../common/list-search';
import { ActionNotice } from './action-notice';
import { CancelDialog } from './cancel-dialog';
import { DETAIL_TEXT } from './detail-messages';
import {
  ReceptionAppointmentCard,
  ReceptionCostCard,
  ReceptionHero,
  ReceptionPatientCard,
} from './detail-sections';
import { NoShowDialog } from './no-show-dialog';
import { ReceptionActions } from './reception-actions';
import { useReceptionActions } from './use-reception-actions';
import { useReceptionDetail } from './use-reception-detail';

// Trang chi tiết một lịch hẹn của Lễ tân (booking F12b; F8, F9 làm NGĂN kéo 420 px, Figma `488:2`; Đại đổi thành TRANG 14/11/2026, TRACKING 3.42 câu (h), lệch Figma có chủ ý, PLAN L38), cùng khung với Bệnh nhân
// và Quản trị viên (UI-12): `Quay lại danh sách` (kèm `search` của danh sách để khôi phục bộ lọc, KHÔNG có `q`), h1 `Chi tiết lịch hẹn`, thẻ đầu (mã, chip, chuyên khoa, bốn ô), rồi lưới hai cột: bên trái
// `Thông tin bệnh nhân` và `Thông tin lịch hẹn`; bên phải `Chi phí & Thanh toán` và thẻ `Thao tác` (Tiếp đón, Vắng mặt, Hủy lịch theo `chuyenDuoc[]`; `Thu tiền & tiếp đón` vô hiệu). Nội dung từ MỘT nguồn là
// chi tiết. Hộp huỷ và hộp vắng mặt là modal DUY NHẤT của trang (mỗi hộp một `useModalDialog`). Mã lịch hiện ngay (dưới h1) khi chi tiết chưa về; khi đã về, mã nằm ở thẻ đầu.
export function ReceptionDetailPage({ maLichHen }: { maLichHen: string }) {
  const location = useLocation();
  // h1 nhận tiêu điểm bằng mã khi nút đã mở hộp biến mất (409, 404...): chỗ trả tiêu điểm cuối cùng của trang
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { view, reload } = useReceptionDetail(maLichHen);
  const ready = view.kind === 'ready' ? view : null;
  const actions = useReceptionActions({
    maLichHen,
    patientName: ready?.data.nguoiKham.hoTen ?? '',
    detailRefreshing: ready?.refreshing ?? false,
    reload,
    fallbackFocusRef: headingRef,
  });
  const dialog = actions.dialog;

  return (
    <DetailPageFrame
      headingRef={headingRef}
      backTo={{
        pathname: RECEPTION_APPOINTMENTS_PATH,
        search: readListSearch(location.state),
      }}
      backLabel={DETAIL_TEXT.back}
      title={DETAIL_TEXT.title}
      busy={ready?.refreshing ?? view.kind === 'loading'}
      // Đang gửi thì không rời trang: rời giữa chừng làm mất kết quả (máy chủ vẫn xử lý)
      backDisabled={actions.state.kind === 'submitting'}
      onBackClick={(event) => {
        if (actions.isSending()) event.preventDefault();
      }}
    >
      {ready === null && (
        <p className="font-mono text-sm text-gray-600">{maLichHen}</p>
      )}
      {view.kind === 'loading' && (
        <LoadingState message={DETAIL_TEXT.loading} />
      )}
      {view.kind === 'error' && (
        <DetailFailure
          error={view.error}
          onRetry={reload}
          texts={DETAIL_TEXT}
        />
      )}
      {ready !== null && (
        <div className="mt-5 flex flex-col gap-4">
          {/* Kết quả hay lỗi của thao tác sau khi hộp đã đóng (và của `Tiếp đón`, không có hộp); hộp mở thì lỗi hiện trong hộp */}
          {dialog === null && (
            <ActionNotice
              state={actions.state}
              noticeRef={actions.noticeRef}
              onReload={actions.reloadFromNotice}
            />
          )}
          <ReceptionHero detail={ready.data} />
          <DetailColumns
            main={
              <>
                <ReceptionPatientCard detail={ready.data} />
                <ReceptionAppointmentCard detail={ready.data} />
              </>
            }
            side={
              <>
                <ReceptionCostCard detail={ready.data} />
                <ReceptionActions
                  detail={ready.data}
                  handlers={actions.handlers}
                  busy={actions.busy}
                  sending={actions.sendingCheckIn}
                />
              </>
            }
          />
        </div>
      )}
      {/* Hộp đang mở: dựng ở cấp trang, KHÔNG phụ thuộc `ready` (chi tiết có thể đang tải lại hay lỗi 404 trong lúc hộp còn hiện câu lỗi) */}
      {dialog !== null &&
        (dialog.target === 'DaHuy' ? (
          <CancelDialog
            state={actions.state}
            panelRef={actions.dialogPanelRef}
            onSubmit={(lyDo) =>
              void actions.submit({ trangThai: 'DaHuy', lyDo })
            }
            onDismiss={actions.closeDialog}
            onReload={actions.reloadAndClose}
          />
        ) : (
          <NoShowDialog
            patientName={dialog.patientName}
            state={actions.state}
            panelRef={actions.dialogPanelRef}
            onSubmit={() => void actions.submit({ trangThai: 'VangMat' })}
            onDismiss={actions.closeDialog}
            onReload={actions.reloadAndClose}
          />
        ))}
    </DetailPageFrame>
  );
}

// Phần tử của route: đọc mã lịch từ đường dẫn và đặt `key` theo mã, nên đổi sang lịch khác thì trang dựng lại và bản cũ của lịch khác không bao giờ hiện cho lịch mới
export function ReceptionDetailRoute() {
  const { maLichHen = '' } = useParams();
  return <ReceptionDetailPage key={maLichHen} maLichHen={maLichHen} />;
}
