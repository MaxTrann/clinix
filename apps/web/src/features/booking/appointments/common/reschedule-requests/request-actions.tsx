import { HANDLE_TEXT } from './request-handle-text';

// Hai nút "Duyệt" và "Từ chối" trong thẻ "Xử lý" của yêu cầu đang chờ (reschedule F4 Pha B1; PLAN reschedule 5.7). Nơi gọi chỉ vẽ khi yêu cầu còn `ChoDuyet` (đã xử lý thì KHÔNG có nút nào). `canApprove` là `coTheDuyet` CỦA MÁY
// CHỦ (web không tự suy): `false` ⇒ "Duyệt" vô hiệu và thẻ đã có câu giải thích theo `lyDoKhongDuyet`, còn "Từ chối" LUÔN dùng được (yêu cầu tồn, R6). Cả hai khoá khi đang gửi hay chi tiết đang tải lại (nút cũ còn hiện nên
// phải vô hiệu tới khi bản mới về). Nút gửi chính nó cho nơi gọi (`currentTarget`) để trả tiêu điểm khi đóng hộp.
export function RequestActions(props: {
  canApprove: boolean;
  busy: boolean;
  onApprove: (trigger: HTMLElement) => void;
  onReject: (trigger: HTMLElement) => void;
}) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={!props.canApprove || props.busy}
        onClick={(event) => props.onApprove(event.currentTarget)}
        className="min-h-[2.6rem] flex-1 rounded-xl bg-brand-strong px-5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {HANDLE_TEXT.approve}
      </button>
      <button
        type="button"
        disabled={props.busy}
        onClick={(event) => props.onReject(event.currentTarget)}
        className="min-h-[2.6rem] flex-1 rounded-xl border border-danger bg-white px-5 text-sm font-semibold text-danger-strong hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-50"
      >
        {HANDLE_TEXT.reject}
      </button>
    </div>
  );
}
