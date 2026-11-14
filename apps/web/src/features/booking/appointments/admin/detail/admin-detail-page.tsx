import { useRef } from 'react';
import { useLocation, useParams } from 'react-router';
import { ADMIN_APPOINTMENTS_PATH } from '../../../../../shared/routes/booking-paths';
import { LoadingState } from '../../../../../shared/ui/loading-state';
import { ActionNotice } from '../../common/action-notice';
import { appointmentStateLabel } from '../../common/appointment-status';
import { DetailColumns, DetailPageFrame } from '../../common/detail-frame';
import { DetailFailure } from '../../common/detail-failure';
import { readListSearch } from '../../common/list-search';
import { refundResultLine } from '../../common/refund-text';
import { DETAIL_TEXT, doneLabel } from './detail-messages';
import {
  AdminAppointmentCard,
  AdminCostCard,
  AdminHero,
  AdminPatientCard,
} from './detail-sections';
import { HistoryPanel } from './history-panel';
import { OverrideActions } from './override-actions';
import { OverrideDialog } from './override-dialog';
import { useAdminDetail } from './use-admin-detail';
import { useOverride } from './use-override';

// Trang chi tiết một lịch hẹn của Quản trị viên (booking F10; Figma `512:2`; F12 dựng lại theo KHUNG CHUNG của Bệnh nhân, UI-11, UI-12, Đại 14/11/2026: Figma `512:2` chỉ rộng 840 px và lệch trái nên trang chưa
// đủ cả trang): `Quay lại danh sách`, h1 `Chi tiết lịch hẹn`, thẻ đầu (mã, chip, chuyên khoa, bốn ô), rồi lưới hai cột: bên trái `Thông tin lịch hẹn` và `Thông tin bệnh nhân`; bên phải `Chi phí & Thanh toán`,
// panel `Lịch sử trạng thái` và thẻ `Thao tác` (nhóm nút override theo `chuyenDuoc[]`, chỗ Figma dành cho thẻ `Thanh toán` đang ẩn: [đề xuất]). Nội dung từ MỘT nguồn là chi tiết. Hộp override là modal
// duy nhất của trang. Mã lịch hiện ngay (dưới h1) khi chi tiết chưa về; khi đã về, mã nằm ở thẻ đầu.
export function AdminDetailPage({ maLichHen }: { maLichHen: string }) {
  const location = useLocation();
  const backRef = useRef<HTMLAnchorElement>(null);
  const { view, reload } = useAdminDetail(maLichHen);
  const ready = view.kind === 'ready' ? view : null;
  const override = useOverride({
    maLichHen,
    detailRefreshing: ready?.refreshing ?? false,
    reload,
    fallbackFocusRef: backRef,
  });
  const dialog = override.dialog;

  return (
    <DetailPageFrame
      backRef={backRef}
      backTo={{
        pathname: ADMIN_APPOINTMENTS_PATH,
        search: readListSearch(location.state),
      }}
      backLabel={DETAIL_TEXT.back}
      title={DETAIL_TEXT.title}
      busy={ready?.refreshing ?? view.kind === 'loading'}
      // Đang gửi thì không rời trang: rời giữa chừng làm mất kết quả (máy chủ vẫn xử lý)
      backDisabled={override.state.kind === 'submitting'}
      onBackClick={(event) => {
        if (override.isSending()) event.preventDefault();
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
          {/* Kết quả hay lỗi của override sau khi hộp đã đóng; hộp mở thì lỗi hiện trong hộp */}
          {dialog === null && (
            <ActionNotice
              state={override.state}
              noticeRef={override.noticeRef}
              onReload={override.reloadFromNotice}
              renderSuccess={(result) => (
                <>
                  <p className="font-medium">
                    {doneLabel(appointmentStateLabel(result.trangThai))}
                  </p>
                  {result.trangThai === 'DaHuy' && (
                    <p className="pt-1">{refundResultLine(result.hoanCoc)}</p>
                  )}
                </>
              )}
            />
          )}
          <AdminHero detail={ready.data} />
          <DetailColumns
            main={
              <>
                <AdminAppointmentCard detail={ready.data} />
                <AdminPatientCard detail={ready.data} />
              </>
            }
            side={
              <>
                <AdminCostCard detail={ready.data} />
                <HistoryPanel entries={ready.data.lichSuTrangThai} />
                <OverrideActions
                  detail={ready.data}
                  busy={override.busy}
                  onOpen={(target, trigger) =>
                    override.open(target, trigger, ready.data.trangThai)
                  }
                />
              </>
            }
          />
        </div>
      )}

      {/* Hộp đang mở: dựng ở cấp trang, KHÔNG phụ thuộc `ready` (chi tiết có thể đang tải lại hay lỗi 404 trong lúc hộp còn hiện câu lỗi) */}
      {dialog !== null && (
        <OverrideDialog
          maLichHen={maLichHen}
          target={dialog.target}
          fromState={dialog.fromState}
          state={override.state}
          panelRef={override.panelRef}
          onSubmit={(lyDo) =>
            void override.submit({ trangThai: dialog.target, lyDo })
          }
          onDismiss={override.closeDialog}
          onReload={override.reloadAndClose}
        />
      )}
    </DetailPageFrame>
  );
}

// Phần tử của route: đọc mã lịch từ đường dẫn và đặt `key` theo mã, nên đổi sang lịch khác thì trang dựng lại và bản cũ của lịch khác không bao giờ hiện cho lịch mới
export function AdminDetailRoute() {
  const { maLichHen = '' } = useParams();
  return <AdminDetailPage key={maLichHen} maLichHen={maLichHen} />;
}
