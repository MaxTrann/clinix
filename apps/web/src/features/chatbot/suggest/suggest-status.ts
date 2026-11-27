import {
  CHATBOT_TEXT,
  suggestSummaryEarliest,
  suggestSummaryPicked,
} from '../widget/chatbot-text';
import { dayHeadingLabel } from './suggest-dates';
import type { Selection, SuggestView } from './suggest-state';

// Dòng trạng thái của thẻ (đọc cho trình đọc màn hình qua `role="status"`): đang tải, tóm tắt kết quả, A5, hay chữ lỗi. Rỗng khi chưa chọn chuyên khoa.
export function statusTextOf(view: SuggestView, selection: Selection): string {
  const text = CHATBOT_TEXT.suggest;
  switch (view.kind) {
    case 'idle':
      return '';
    case 'loading':
      return text.loading;
    case 'error':
      return view.error.text;
    case 'empty':
      // A5 có hai lý do: không bác sĩ nào hay không ô giờ nào (thiếu lý do thì coi là không có khung giờ)
      return view.data.lyDoRong === 'KhongCoBacSi'
        ? text.emptyNoDoctor
        : text.emptyNoSlot;
    case 'result': {
      const { ngay, bacSi } = view.data;
      if (ngay === null) return '';
      const day = dayHeadingLabel(ngay);
      // Người dùng chưa chọn ngày: đây là ngày SỚM NHẤT do máy chủ chọn; đã chọn thì chỉ tóm tắt ngày đó
      return selection.ngay === null
        ? suggestSummaryEarliest(day, bacSi.length)
        : suggestSummaryPicked(day, bacSi.length);
    }
  }
}
