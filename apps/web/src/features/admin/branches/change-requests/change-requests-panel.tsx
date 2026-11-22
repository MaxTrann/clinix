import { useId, useState } from 'react';
import { ErrorState } from '../../../../shared/ui/error-state';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { CHANGE_REQUEST_PAGE_SIZE } from './change-request-service';
import { humanDate, humanTime, statusLabel } from './change-request-format';
import type { ChangeRequestListItem } from './change-request-types';
import {
  ApproveDialog,
  CancelDialog,
  RejectDialog,
  RescheduleDialog,
  WithdrawDialog,
} from './request-dialogs';
import { RequestDetail } from './request-detail';
import { actionsFor, isOverdue, type ActionKind } from './request-actions';
import {
  REQUEST_TABS,
  useChangeRequestList,
  useNoticeDays,
  useTabCounts,
  type RequestTab,
} from './use-change-requests';
import styles from './change-requests.module.css';

// Khối "Yêu cầu thay đổi lịch / dịch vụ chi nhánh" trên tab Chi nhánh (admin F6b; Figma 542:2 Toàn hệ thống, 693:2 Chi nhánh).
// Nút nào hiện cho ai: `request-actions.ts`. Ẩn nút chỉ để giao diện gọn; quyền và trạng thái thật kiểm ở máy chủ.

const TAB_LABELS: Record<RequestTab, string> = {
  ChoDuyet: 'Chờ duyệt',
  DaDuyet: 'Đã duyệt',
  TuChoi: 'Từ chối',
  DaRut: 'Đã rút',
  DaHuy: 'Đã hủy',
};

interface OpenDialog {
  kind: ActionKind;
  request: ChangeRequestListItem;
  /** Mốc "bây giờ" chụp lúc mở hộp thoại, để gợi ý mốc sớm nhất không đổi khi đang chọn */
  now: Date;
}

const ACTION_BUTTONS: Record<ActionKind, { label: string; className: string }> =
  {
    approve: { label: 'Duyệt', className: styles.approveButton },
    reject: { label: 'Từ chối', className: styles.rejectButton },
    withdraw: { label: 'Rút', className: styles.rejectButton },
    reschedule: { label: 'Dời hiệu lực', className: styles.approveButton },
    cancel: { label: 'Hủy', className: styles.rejectButton },
  };

function badgeClass(item: ChangeRequestListItem): string {
  if (item.trangThai === 'ChoDuyet') return styles.badgePending;
  if (item.trangThai === 'DaDuyet' && item.apDungLuc === null)
    return isOverdue(item) ? styles.badgeOverdue : styles.badgeApproved;
  if (item.trangThai === 'DaDuyet') return styles.badgeApproved;
  return styles.badgeRejected;
}

function cardClass(item: ChangeRequestListItem): string {
  if (isOverdue(item))
    return `${styles.requestCard} ${styles.requestCardOverdue}`;
  if (item.trangThai === 'ChoDuyet')
    return `${styles.requestCard} ${styles.requestCardPending}`;
  return styles.requestCard;
}

function RequestCard({
  item,
  isSystemAdmin,
  expanded,
  refreshKey,
  onToggle,
  onAction,
}: {
  item: ChangeRequestListItem;
  isSystemAdmin: boolean;
  expanded: boolean;
  refreshKey: number;
  onToggle: () => void;
  onAction: (kind: ActionKind) => void;
}) {
  const detailId = useId();
  return (
    <article
      className={cardClass(item)}
      aria-label={`Yêu cầu của ${item.chiNhanh.ten}`}
    >
      <div className={styles.requestRow}>
        <div className={styles.requestMain}>
          <div className={styles.requestTitle}>
            <h3>{item.chiNhanh.ten}</h3>
            <span className={badgeClass(item)}>{statusLabel(item)}</span>
          </div>
          <p className={styles.requestMeta}>
            Gửi bởi <b>{item.nguoiDeXuat.hoTen}</b> ·{' '}
            {humanDate(item.thoiDiemTao)}
            {item.hieuLucTu &&
              ` · Dự kiến có hiệu lực ${humanTime(item.hieuLucTu)}`}
          </p>
        </div>
        <div className={styles.requestActions}>
          <button
            type="button"
            className={styles.detailLink}
            aria-expanded={expanded}
            aria-controls={expanded ? detailId : undefined}
            onClick={onToggle}
          >
            <img src="/assets/admin/branches/view-detail.svg" alt="" />
            {expanded ? 'Thu gọn' : 'Chi tiết'}
          </button>
          {actionsFor(item, isSystemAdmin).map((kind) => (
            <button
              key={kind}
              type="button"
              className={ACTION_BUTTONS[kind].className}
              onClick={() => onAction(kind)}
            >
              {ACTION_BUTTONS[kind].label}
            </button>
          ))}
        </div>
      </div>
      {/* Q48, CN-111: quá hạn thì nói rõ vì sao chưa áp dụng và cách thoát (dời hoặc hủy); câu chữ [đề xuất] */}
      {isOverdue(item) && (
        <p className={styles.overdueNote} role="note">
          Đến thời điểm dự kiến vẫn còn lịch hẹn hoặc ca làm việc chưa xử lý nên
          thay đổi chưa được áp dụng.{' '}
          {isSystemAdmin
            ? 'Xử lý hết danh sách trong Chi tiết rồi dời hiệu lực, hoặc hủy yêu cầu.'
            : 'Vui lòng xử lý các lịch hẹn, ca làm việc trong Chi tiết; Quản trị viên Toàn hệ thống sẽ dời hiệu lực hoặc hủy yêu cầu.'}
        </p>
      )}
      {expanded && (
        <div id={detailId}>
          <RequestDetail
            id={item.yeuCauThayDoiChiNhanhId}
            refreshKey={refreshKey}
          />
        </div>
      )}
    </article>
  );
}

export function ChangeRequestsPanel({
  isSystemAdmin,
  refreshKey,
  onChanged,
}: {
  isSystemAdmin: boolean;
  /** Tăng khi trang bên ngoài vừa tạo yêu cầu mới (Sửa lịch / dịch vụ) để khối này tải lại */
  refreshKey: number;
  /** Có thao tác thành công: báo trang bên ngoài tải lại danh sách chi nhánh (nhãn "có yêu cầu đang mở") */
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<RequestTab>('ChoDuyet');
  const [page, setPage] = useState(1);
  const [localKey, setLocalKey] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const [message, setMessage] = useState('');
  const key = refreshKey * 1000 + localKey;
  const list = useChangeRequestList(tab, page, key);
  const counts = useTabCounts(key);
  const noticeDays = useNoticeDays(isSystemAdmin, key);
  const pendingCount =
    counts.status === 'success' ? counts.data.counts.ChoDuyet : null;
  const hasOverdue = counts.status === 'success' && counts.data.coQuaHan;
  const notConfigured =
    noticeDays?.status === 'success' && noticeDays.data === null;
  const soNgayBaoTruoc =
    noticeDays?.status === 'success' ? noticeDays.data : undefined;

  function selectTab(next: RequestTab) {
    setTab(next);
    setPage(1);
    setExpandedId(null);
    setMessage('');
  }

  function handleDone(text: string) {
    setDialog(null);
    setMessage(text);
    setExpandedId(null);
    setLocalKey((value) => value + 1);
    onChanged();
  }

  const pageCount =
    list.state.status === 'success'
      ? Math.max(1, Math.ceil(list.state.data.total / CHANGE_REQUEST_PAGE_SIZE))
      : 1;
  const dialogProps = dialog && {
    request: dialog.request,
    onCancel: () => setDialog(null),
    onDone: handleDone,
  };

  return (
    <section className={styles.panel} aria-labelledby="change-requests-title">
      <header className={styles.panelHeader}>
        <h2 id="change-requests-title">
          <img src="/assets/admin/branches/request-history.svg" alt="" />
          Yêu cầu thay đổi lịch / dịch vụ chi nhánh
          {pendingCount !== null && pendingCount > 0 && (
            <span className={styles.pendingCount}>{pendingCount} chờ</span>
          )}
        </h2>
        {notConfigured && (
          <p className={styles.configWarning} role="note">
            <img src="/assets/admin/branches/config-warning.svg" alt="" />
            Chưa cấu hình số ngày báo trước
          </p>
        )}
      </header>

      {/* Banner quá hạn (Q48, CN-109/CN-111 phần giao diện) [đề xuất]: bấm để mở tab Đã duyệt, nơi có các yêu cầu quá hạn */}
      {hasOverdue && (
        <div className={styles.overdueBanner} role="alert">
          <span>
            Có yêu cầu thay đổi đã quá hạn nhưng chưa áp dụng vì còn lịch hẹn
            hoặc ca làm việc chưa xử lý.
          </span>
          {tab !== 'DaDuyet' && (
            <button type="button" onClick={() => selectTab('DaDuyet')}>
              Xem yêu cầu quá hạn
            </button>
          )}
        </div>
      )}

      <div
        className={styles.tabs}
        role="tablist"
        aria-label="Trạng thái yêu cầu"
      >
        {REQUEST_TABS.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`change-requests-tab-${value}`}
            aria-selected={tab === value}
            aria-controls="change-requests-tabpanel"
            className={tab === value ? styles.activeTab : styles.tab}
            onClick={() => selectTab(value)}
          >
            {TAB_LABELS[value]}
            <span className={styles.tabCount}>
              ({counts.status === 'success' ? counts.data.counts[value] : '…'})
            </span>
          </button>
        ))}
      </div>

      <div
        id="change-requests-tabpanel"
        role="tabpanel"
        aria-labelledby={`change-requests-tab-${tab}`}
        className={styles.tabPanel}
      >
        {message && (
          <p className={styles.actionMessage} role="status">
            {message}
          </p>
        )}
        {list.state.status === 'loading' && (
          <LoadingState message="Đang tải yêu cầu…" />
        )}
        {list.state.status === 'error' && (
          <ErrorState error={list.state.error} onRetry={list.retry} />
        )}
        {list.state.status === 'success' &&
          list.state.data.items.length === 0 && (
            <p className={styles.empty}>Không có yêu cầu nào.</p>
          )}
        {list.state.status === 'success' &&
          list.state.data.items.map((item) => (
            <RequestCard
              key={item.yeuCauThayDoiChiNhanhId}
              item={item}
              isSystemAdmin={isSystemAdmin}
              expanded={expandedId === item.yeuCauThayDoiChiNhanhId}
              refreshKey={key}
              onToggle={() =>
                setExpandedId((current) =>
                  current === item.yeuCauThayDoiChiNhanhId
                    ? null
                    : item.yeuCauThayDoiChiNhanhId,
                )
              }
              onAction={(kind) => {
                setMessage('');
                setDialog({ kind, request: item, now: new Date() });
              }}
            />
          ))}
        {pageCount > 1 && (
          <nav className={styles.pagination} aria-label="Phân trang yêu cầu">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              Trang trước
            </button>
            <span>
              Trang {page} / {pageCount}
            </span>
            <button
              type="button"
              disabled={page >= pageCount}
              onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
            >
              Trang sau
            </button>
          </nav>
        )}
      </div>

      {dialog && dialogProps && dialog.kind === 'approve' && (
        <ApproveDialog
          {...dialogProps}
          soNgayBaoTruoc={soNgayBaoTruoc}
          now={dialog.now}
        />
      )}
      {dialog && dialogProps && dialog.kind === 'reschedule' && (
        <RescheduleDialog
          {...dialogProps}
          soNgayBaoTruoc={soNgayBaoTruoc}
          now={dialog.now}
        />
      )}
      {dialogProps && dialog?.kind === 'reject' && (
        <RejectDialog {...dialogProps} />
      )}
      {dialogProps && dialog?.kind === 'cancel' && (
        <CancelDialog {...dialogProps} />
      )}
      {dialogProps && dialog?.kind === 'withdraw' && (
        <WithdrawDialog {...dialogProps} />
      )}
    </section>
  );
}
