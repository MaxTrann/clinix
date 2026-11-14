import { ChevronLeft } from 'lucide-react';
import { useRef } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { ADMIN_APPOINTMENTS_PATH } from '../../../../../shared/routes/booking-paths';
import { LoadingState } from '../../../../../shared/ui/loading-state';
import { ActionNotice } from '../../common/action-notice';
import { appointmentStateLabel } from '../../common/appointment-status';
import { DetailFailure } from '../../common/detail-failure';
import { readListSearch } from '../../common/list-search';
import { refundResultLine } from '../../common/refund-text';
import { StatusChip } from '../../common/status-chip';
import { DETAIL_TEXT, doneLabel } from './detail-messages';
import { DetailSections } from './detail-sections';
import { HistoryPanel } from './history-panel';
import { OverrideActions } from './override-actions';
import { OverrideDialog } from './override-dialog';
import { useAdminDetail } from './use-admin-detail';
import { useOverride } from './use-override';

// Trang chi tiết một lịch hẹn của Quản trị viên (booking F10; Figma `512:2`): `Quay lại danh sách`, h1 `Chi tiết lịch hẹn`, mã, chip trạng thái; lưới ba cột: hai thẻ thông tin (hai cột) và, bên phải,
// panel `Lịch sử trạng thái` cùng thẻ `Thao tác` (nhóm nút override theo `chuyenDuoc[]`, chỗ Figma dành cho thẻ `Thanh toán` đang ẩn: [đề xuất]). Nội dung từ MỘT nguồn là chi tiết. Hộp override là modal
// duy nhất của trang. Mã lịch ở đầu trang hiện ngay; nội dung hiện sau khi chi tiết về.
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
    <section
      aria-busy={ready?.refreshing ?? view.kind === 'loading'}
      className="max-w-[52.5rem]"
    >
      <Link
        ref={backRef}
        to={{
          pathname: ADMIN_APPOINTMENTS_PATH,
          search: readListSearch(location.state),
        }}
        // Đang gửi thì không rời trang: rời giữa chừng làm mất kết quả (máy chủ vẫn xử lý)
        aria-disabled={override.state.kind === 'submitting'}
        onClick={(event) => {
          if (override.isSending()) event.preventDefault();
        }}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 hover:underline"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        {DETAIL_TEXT.back}
      </Link>

      <div className="flex items-start justify-between gap-3 pt-3">
        <div>
          <h1 className="text-[1.3333rem] leading-normal font-bold text-gray-900">
            {DETAIL_TEXT.title}
          </h1>
          <p className="font-mono text-sm text-gray-600">{maLichHen}</p>
        </div>
        {ready !== null && <StatusChip status={ready.data.trangThai} />}
      </div>

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
        <>
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
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <DetailSections detail={ready.data} />
            </div>
            <div className="space-y-4">
              <HistoryPanel entries={ready.data.lichSuTrangThai} />
              <OverrideActions
                detail={ready.data}
                busy={override.busy}
                onOpen={(target, trigger) =>
                  override.open(target, trigger, ready.data.trangThai)
                }
              />
            </div>
          </div>
        </>
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
    </section>
  );
}

// Phần tử của route: đọc mã lịch từ đường dẫn và đặt `key` theo mã, nên đổi sang lịch khác thì trang dựng lại và bản cũ của lịch khác không bao giờ hiện cho lịch mới
export function AdminDetailRoute() {
  const { maLichHen = '' } = useParams();
  return <AdminDetailPage key={maLichHen} maLichHen={maLichHen} />;
}
