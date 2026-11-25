import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router';
import { useMediaQuery } from '../../../shared/hooks/use-media-query';
import { useRemote } from '../../../shared/hooks/use-remote';
import { useAuth } from '../../auth';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../api/notification-api';
import {
  READ_FILTERS,
  type NotificationItem,
  type ReadFilter,
} from '../api/notification-types';
import { NotificationDetail } from '../center/notification-detail';
import { notificationLinkPath } from '../center/notification-links';
import { NotificationPagination } from '../center/notification-pagination';
import { NotificationRow } from '../center/notification-row';
import {
  CENTER_TEXT,
  EMPTY_TEXT,
  FILTER_LABELS,
  loadErrorMessage,
} from '../center/notification-text';
import {
  getUnreadSnapshot,
  setUnreadCount,
  subscribeUnread,
} from '../unread/unread-store';

// Trang Trung tâm thông báo, MỘT thành phần cho mọi vai trò (notification F2; PLAN 5.10; use case 2.4.59 b1 đến b4, A1).
// - Bộ lọc và trang ở URL (`?loc=`, `?trang=`); KHÔNG giữ thông báo ở kho trình duyệt (WTB-17).
// - Số chưa đọc luôn là số của MÁY CHỦ (kho chung của F1, cập nhật từ `soChuaDoc` trả về), không đếm danh sách đang hiện (WTB-17).
// - Mở một thông báo chưa đọc ⇒ `POST read` ĐÚNG một lần: gọi trong trình xử lý sự kiện (không trong effect, nên `StrictMode` không gọi hai lần) và chặn theo id (bấm đúp).
// - Panel chi tiết dùng chính dòng của danh sách (đã có đủ nội dung), không gọi `GET /notifications/:id`.

const WIDE_QUERY = '(min-width: 1024px)';

function parseFilter(value: string | null): ReadFilter {
  return READ_FILTERS.find((filter) => filter === value) ?? 'tat-ca';
}

function parsePage(value: string | null): number {
  return value !== null && /^[1-9][0-9]{0,5}$/.test(value) ? Number(value) : 1;
}

export function NotificationCenterPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const filter = parseFilter(params.get('loc'));
  const page = parsePage(params.get('trang'));
  const wide = useMediaQuery(WIDE_QUERY);
  const store = useSyncExternalStore(subscribeUnread, getUnreadSnapshot);

  // Số chưa đọc TĂNG (thăm dò của F1) khi đang ở trang 1 ⇒ tải lại để thông báo mới hiện ngay (WTB-03). Ở trang khác thì không kéo người dùng đi
  const reloadKey = page === 1 ? store.increases : -1;
  const { state, retry } = useRemote(
    async (signal) => ({
      data: await getNotifications({ page, filter }, signal),
      // Mốc "bây giờ" cho thời gian tương đối, lấy cùng lúc với dữ liệu
      now: Date.now(),
    }),
    [page, filter, reloadKey],
  );
  const data = state.status === 'ready' ? state.data.data : null;
  const now = state.status === 'ready' ? state.data.now : 0;

  // Đồng bộ chuông với số của máy chủ trả kèm danh sách
  useEffect(() => {
    if (data) setUnreadCount(data.soChuaDoc);
  }, [data]);

  const [selected, setSelected] = useState<NotificationItem | null>(null);
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(new Set());
  const [markFailedId, setMarkFailedId] = useState<string | null>(null);
  const sentIds = useRef(new Set<string>());
  const [markAll, setMarkAll] = useState<'idle' | 'pending' | 'failed'>('idle');
  const markAllPending = useRef(false);

  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const focusRowId = useRef<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const isRead = (item: NotificationItem) => item.daDoc || readIds.has(item.id);
  const unread = store.unread ?? data?.soChuaDoc ?? null;
  const detailAsScreen = !wide && selected !== null;

  const open = (item: NotificationItem) => {
    setSelected(item);
    setMarkFailedId(null);
    if (isRead(item) || sentIds.current.has(item.id)) return;
    sentIds.current.add(item.id);
    markNotificationRead(item.id).then(
      (result) => {
        setReadIds((prev) => new Set(prev).add(item.id));
        setUnreadCount(result.soChuaDoc);
      },
      () => {
        // Thất bại: vẫn xem được, nhắc nhỏ; mở lại thì thử lần nữa (WTB-08)
        sentIds.current.delete(item.id);
        setMarkFailedId(item.id);
      },
    );
  };

  const close = () => {
    focusRowId.current = selected?.id ?? null;
    setSelected(null);
  };

  const runMarkAll = async () => {
    if (markAllPending.current) return;
    markAllPending.current = true;
    setMarkAll('pending');
    try {
      const result = await markAllNotificationsRead();
      setUnreadCount(result.soChuaDoc);
      setMarkAll('idle');
      retry();
    } catch {
      setMarkAll('failed');
    } finally {
      markAllPending.current = false;
    }
  };

  const goTo = (next: { filter?: ReadFilter; page?: number }) => {
    const nextFilter = next.filter ?? filter;
    const nextPage = next.page ?? 1;
    const query = new URLSearchParams();
    if (nextFilter !== 'tat-ca') query.set('loc', nextFilter);
    if (nextPage > 1) query.set('trang', String(nextPage));
    setParams(query);
  };

  // Màn hẹp: mở chi tiết ⇒ tiêu điểm vào tiêu đề; Esc đóng (WTB-13)
  useEffect(() => {
    if (!detailAsScreen) return;
    headingRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        focusRowId.current = selected?.id ?? null;
        setSelected(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [detailAsScreen, selected?.id]);

  // Đóng chi tiết ⇒ tiêu điểm về hàng vừa mở (WTB-13)
  useEffect(() => {
    const id = focusRowId.current;
    if (id === null || detailAsScreen) return;
    const row = rowRefs.current.get(id);
    if (row) {
      row.focus();
      focusRowId.current = null;
    }
  });

  if (!user) return null;

  const detail = selected && (
    <NotificationDetail
      item={{ ...selected, daDoc: isRead(selected) }}
      linkPath={notificationLinkPath(selected.lienKet, user.vaiTro)}
      markFailed={markFailedId === selected.id}
      now={now || Date.parse(selected.thoiDiemTao)}
      onBack={wide ? undefined : close}
      headingRef={headingRef}
    />
  );

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[24px] leading-[36px] font-extrabold tracking-[-0.3px] text-gray-900">
            {CENTER_TEXT.title}
          </h1>
          {unread !== null && (
            <p className="text-sm text-gray-600">
              {unread === 0
                ? 'Bạn không có thông báo chưa đọc.'
                : `Bạn có ${unread} thông báo chưa đọc.`}
            </p>
          )}
        </div>
        {!detailAsScreen && (
          <button
            type="button"
            onClick={() => void runMarkAll()}
            // Vô hiệu khi không còn chưa đọc (theo số của máy chủ) hay đang gửi (WTB-09)
            disabled={markAll === 'pending' || unread === null || unread === 0}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {markAll === 'pending'
              ? CENTER_TEXT.markAllPending
              : CENTER_TEXT.markAll}
          </button>
        )}
      </div>
      {markAll === 'failed' && (
        <p role="alert" className="text-sm text-danger">
          {CENTER_TEXT.markAllFailed}
        </p>
      )}

      {detailAsScreen ? (
        detail
      ) : (
        <div
          className={
            wide ? 'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4' : ''
          }
        >
          <div className="flex min-w-0 flex-col gap-3">
            <div
              role="group"
              aria-label={CENTER_TEXT.tabsLabel}
              className="flex flex-wrap gap-2"
            >
              {READ_FILTERS.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => goTo({ filter: value })}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                    filter === value
                      ? 'bg-brand-strong text-white'
                      : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {FILTER_LABELS[value]}
                </button>
              ))}
            </div>

            {state.status === 'loading' && (
              // Khung giữ chỗ khi tải (WTB-10)
              <div
                role="status"
                aria-label={CENTER_TEXT.loading}
                className="flex flex-col gap-2"
              >
                {[0, 1, 2].map((key) => (
                  <div
                    key={key}
                    aria-hidden="true"
                    className="h-20 animate-pulse rounded-xl bg-gray-100"
                  />
                ))}
              </div>
            )}

            {state.status === 'error' && (
              <div
                role="alert"
                className="rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong"
              >
                <p>{loadErrorMessage(state.error)}</p>
                <button
                  type="button"
                  onClick={retry}
                  className="mt-1 font-medium underline"
                >
                  {CENTER_TEXT.retry}
                </button>
              </div>
            )}

            {data && data.items.length === 0 && (
              <div className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600">
                {data.total > 0 && page > 1 ? (
                  // Trang vượt cuối (URL gõ tay hay danh sách vừa ngắn lại): rỗng có lối quay lại (WTB-07)
                  <>
                    <p>{CENTER_TEXT.pastEnd}</p>
                    <button
                      type="button"
                      onClick={() =>
                        goTo({
                          page: Math.ceil(data.total / data.pageSize),
                        })
                      }
                      className="mt-1 font-medium text-brand-strong underline"
                    >
                      {CENTER_TEXT.toLastPage}
                    </button>
                  </>
                ) : (
                  <p>{EMPTY_TEXT[filter]}</p>
                )}
              </div>
            )}

            {data && data.items.length > 0 && (
              <ul
                aria-label={CENTER_TEXT.listLabel}
                className="flex flex-col gap-2"
              >
                {data.items.map((item) => (
                  <li key={item.id}>
                    <NotificationRow
                      item={item}
                      read={isRead(item)}
                      selected={selected?.id === item.id}
                      now={now}
                      onSelect={() => open(item)}
                      buttonRef={(element) => {
                        if (element) rowRefs.current.set(item.id, element);
                        else rowRefs.current.delete(item.id);
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}

            {data && (
              <NotificationPagination
                page={page}
                pageCount={Math.ceil(data.total / data.pageSize)}
                onPageChange={(next) => goTo({ page: next })}
              />
            )}
          </div>

          {wide &&
            (detail ?? (
              <p className="self-start rounded-xl border border-dashed border-gray-200 px-3 py-6 text-center text-sm text-gray-500">
                {CENTER_TEXT.chooseHint}
              </p>
            ))}
        </div>
      )}
    </section>
  );
}
