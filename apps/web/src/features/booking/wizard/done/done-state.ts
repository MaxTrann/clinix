import { DONE_TEXT, ENDED_SENTENCES } from './done-messages';

// Bước 6 vẽ gì cho một lịch hẹn: CHỈ MỘT chỗ quyết định theo `trangThai` (TRACKING 3.36 F7-G), để "Đặt lịch thành công" không bao giờ hiện cho lịch không ở `DaXacNhan`.
//   receipt  `DaXacNhan`: phiếu hẹn "Đặt lịch thành công" (Figma `453:2`).
//   notice   mọi trạng thái khác: một thông báo đúng trạng thái, không phiếu, không thẻ chi phí. `needsPayment` chỉ ở `ChoThanhToan` (liên kết tới trang Thanh toán).
// Mã trạng thái lạ (kể cả `DaDoiLich` nếu backend lỡ trả) ⇒ thông báo trung tính, không lộ mã thô.
export type DoneView =
  | { kind: 'receipt' }
  | {
      kind: 'notice';
      title: string;
      sentence: string;
      needsPayment: boolean;
    };

export type NoticeView = Extract<DoneView, { kind: 'notice' }>;

export function doneViewOf(trangThai: string): DoneView {
  switch (trangThai) {
    case 'DaXacNhan':
      return { kind: 'receipt' };
    case 'ChoThanhToan':
      return {
        kind: 'notice',
        title: DONE_TEXT.pendingTitle,
        sentence: DONE_TEXT.pendingNote,
        needsPayment: true,
      };
    case 'DaHuy':
    case 'VangMat':
    case 'HoanThanh':
    case 'DaTiepDon':
      return {
        kind: 'notice',
        title: DONE_TEXT.statusTitle,
        sentence: ENDED_SENTENCES[trangThai],
        needsPayment: false,
      };
    default:
      return {
        kind: 'notice',
        title: DONE_TEXT.statusTitle,
        sentence: DONE_TEXT.unknownState,
        needsPayment: false,
      };
  }
}
