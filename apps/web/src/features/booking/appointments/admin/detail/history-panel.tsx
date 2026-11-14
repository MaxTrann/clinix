import { Clock } from 'lucide-react';
import {
  formatVietnamDate,
  formatVietnamTime,
} from '../../common/appointment-format';
import { appointmentStateLabel } from '../../common/appointment-status';
import { DetailCard } from '../../common/detail-card';
import type { HistoryEntry } from '../api/admin-appointment-types';
import { DETAIL_TEXT, historyWhen, overrideTitle } from './detail-messages';

// Tiêu đề một mục: `TaoLich` "Tạo lịch hẹn", `HuyLich` "Hủy lịch hẹn", `OverrideLichHen` "Đổi trạng thái: {từ} → {đến}" (trạng thái lạ hay vắng ⇒ "Chưa xác định", không lộ mã thô)
function entryTitle(entry: HistoryEntry): string {
  switch (entry.loai) {
    case 'TaoLich':
      return DETAIL_TEXT.history.created;
    case 'HuyLich':
      return DETAIL_TEXT.history.cancelled;
    case 'OverrideLichHen':
      return overrideTitle(
        appointmentStateLabel(entry.tuTrangThai ?? ''),
        appointmentStateLabel(entry.denTrangThai ?? ''),
      );
  }
}

// Panel "Lịch sử trạng thái" (Figma `512:2`; PLAN Q28, L26; B4-E). Danh sách theo ĐÚNG thứ tự máy chủ trả (web không sắp lại). Giờ theo GIỜ VIỆT NAM. `lyDo` là chữ tự do của nhân sự: hiện làm
// văn bản (React thoát chuỗi, không `dangerouslySetInnerHTML`), giữ xuống dòng, không bao giờ là HTML. KHÔNG hiện người thực hiện (B4 không trả). Ghi chú cuối nói rõ chỗ chưa có mốc
// (tiếp đón, Vắng mặt, xác nhận thanh toán: TECH_DEBT 111) để không tưởng là đủ mọi lần đổi.
export function HistoryPanel({
  entries,
}: {
  entries: readonly HistoryEntry[];
}) {
  return (
    <DetailCard icon={Clock} title={DETAIL_TEXT.sections.history}>
      <div className="px-5 py-4">
        {entries.length === 0 ? (
          <p className="text-xs text-gray-600 italic">
            {DETAIL_TEXT.history.empty}
          </p>
        ) : (
          <ol className="space-y-3">
            {entries.map((entry, index) => (
              <li
                key={`${entry.thoiDiem}-${index}`}
                className="border-l-2 border-gray-200 pl-3"
              >
                <p className="text-sm font-medium text-gray-900">
                  {entryTitle(entry)}
                </p>
                <p className="text-xs text-gray-600">
                  {historyWhen(
                    formatVietnamDate(entry.thoiDiem),
                    formatVietnamTime(entry.thoiDiem),
                  )}
                </p>
                {entry.lyDo !== null && (
                  <p className="pt-0.5 text-xs break-words whitespace-pre-line text-gray-700">
                    {DETAIL_TEXT.history.reasonPrefix}
                    {entry.lyDo}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
        <p className="pt-3 text-xs text-gray-600">{DETAIL_TEXT.history.note}</p>
      </div>
    </DetailCard>
  );
}
