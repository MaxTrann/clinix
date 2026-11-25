import { ArrowLeft } from 'lucide-react';
import type { Ref } from 'react';
import { Link } from 'react-router';
import type { NotificationItem } from '../api/notification-types';
import { GROUP_ICONS } from './notification-icons';
import { NotificationTime } from './notification-row';
import { CENTER_TEXT, GROUP_LABELS, LINK_LABELS } from './notification-text';

// Panel chi tiết (notification F2, PLAN 5.10; WTB-08, WTB-11, WTB-14): nội dung ĐẦY ĐỦ dạng chữ (giữ xuống dòng), nhóm, thời gian, nút liên kết nếu vai trò mở được.
// Màn hẹp: là màn riêng có nút "Quay lại" (nơi gọi truyền `onBack`); màn rộng: cột bên phải, không có nút đó.

export function NotificationDetail({
  item,
  linkPath,
  markFailed,
  now,
  onBack,
  headingRef,
}: {
  item: NotificationItem;
  linkPath: string | null;
  markFailed: boolean;
  now: number;
  onBack?: () => void;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const group = item.nhom ?? 'Khac';
  const Icon = GROUP_ICONS[group];
  return (
    <section
      aria-label={CENTER_TEXT.detailLabel}
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-gray-100 bg-white p-4"
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex h-8 w-fit items-center gap-1.5 rounded-lg px-1 text-sm font-medium text-brand-strong hover:bg-gray-50"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {CENTER_TEXT.back}
        </button>
      )}
      <p className="flex items-center gap-2 text-xs font-medium text-gray-600">
        <Icon className="size-4" aria-hidden="true" />
        {GROUP_LABELS[group]}
      </p>
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="text-lg font-bold break-words text-gray-900"
      >
        {item.tieuDe}
      </h2>
      <NotificationTime iso={item.thoiDiemTao} now={now} />
      {/* Chữ thường: thẻ HTML trong nội dung hiện nguyên chữ (WTB-12) */}
      <p className="text-sm break-words whitespace-pre-line text-gray-800">
        {item.noiDung}
      </p>
      {markFailed && (
        <p role="status" className="text-xs text-gray-600">
          {CENTER_TEXT.markOneFailed}
        </p>
      )}
      {linkPath !== null && item.lienKet !== null && (
        <Link
          to={linkPath}
          className="w-fit rounded-lg bg-brand-strong px-3 py-2 text-sm font-medium text-white hover:bg-brand-hover"
        >
          {LINK_LABELS[item.lienKet.kieu]}
        </Link>
      )}
    </section>
  );
}
