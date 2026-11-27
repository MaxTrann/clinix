import type { RefObject } from 'react';
import type { ChatPartner, Relationship } from '../api/chat-types';
import { RELATIONSHIP_LABELS } from './chat-format';
import type { OutgoingMessage } from './use-message-thread';

// Mảnh giao diện dùng chung của khung tin hội thoại đã có (`MessageThread`, chat F3) và khung trước tin đầu (`StartThread`, chat F4): đầu khung, banner,
// bong bóng tin đang gửi hay gửi lỗi. Tách ra để hai khung giống hệt nhau mà không chép mã.

export const BANNER_TEXT =
  'Chỉ tư vấn sơ bộ, không thay khám trực tiếp, không kê đơn.';

interface ThreadHeaderProps {
  /** `null` khi đầu khung chưa tải xong: tiêu đề tạm "Hội thoại". */
  partner: ChatPartner | null;
  quanHe: Relationship | null;
  headingRef: RefObject<HTMLHeadingElement | null>;
  /** Màn hẹp: nút "Quay lại" về danh sách; màn rộng: `null`. */
  onBack: (() => void) | null;
}

/** MỘT tiêu đề cho mọi trạng thái (đang tải, lỗi, sẵn sàng): tiêu điểm đặt lúc mở vẫn giữ khi dữ liệu về. */
export function ThreadHeader({
  partner,
  quanHe,
  headingRef,
  onBack,
}: ThreadHeaderProps) {
  return (
    <header className="flex min-w-0 flex-wrap items-center gap-2 border-b border-gray-200 p-3">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="min-h-11 shrink-0 rounded-xl border border-gray-300 px-3 text-sm font-medium"
        >
          Quay lại
        </button>
      )}
      <h2
        id="chat-thread-title"
        ref={headingRef}
        tabIndex={-1}
        className="min-w-0 truncate text-base font-semibold text-gray-900"
      >
        {partner ? partner.tenHienThi : 'Hội thoại'}
        {partner?.soDienThoai && (
          <span className="font-normal text-gray-500">
            {' '}
            · {partner.soDienThoai}
          </span>
        )}
      </h2>
      {quanHe && (
        <span className="rounded-full bg-gray-100 px-2 text-xs text-gray-700">
          {RELATIONSHIP_LABELS[quanHe]}
        </span>
      )}
    </header>
  );
}

export function ThreadBanner() {
  return (
    <p className="border-b border-warning-line bg-warning-soft px-3 py-2 text-sm text-warning">
      {BANNER_TEXT}
    </p>
  );
}

/** Tin của mình chưa có trên máy chủ: "Đang gửi…" hay câu lỗi kèm "Gửi lại" (nội dung giữ nguyên, A1). */
export function OutgoingBubble({
  item,
  onResend,
}: {
  item: OutgoingMessage;
  onResend: (item: OutgoingMessage) => void;
}) {
  return (
    <li className="flex flex-col items-end">
      <div className="max-w-[85%] rounded-2xl bg-brand-soft px-3 py-2 text-sm text-gray-900 opacity-80">
        {item.tep && (
          // chat F6: tệp đang gửi hay gửi lỗi chỉ hiện tên (tệp ở máy); sau khi gửi xong, khung hiện tệp theo dữ liệu MÁY CHỦ trả
          <p className="break-all text-xs text-gray-600">
            Tệp đính kèm: {item.tep.name}
          </p>
        )}
        {item.noiDung && (
          <p className="whitespace-pre-wrap break-words">{item.noiDung}</p>
        )}
      </div>
      {item.status === 'sending' ? (
        <p className="mt-1 text-xs text-gray-500">Đang gửi…</p>
      ) : (
        <p role="alert" className="mt-1 text-right text-xs text-danger-strong">
          {item.error}{' '}
          <button
            type="button"
            onClick={() => onResend(item)}
            className="font-semibold underline"
          >
            Gửi lại
          </button>
        </p>
      )}
    </li>
  );
}
