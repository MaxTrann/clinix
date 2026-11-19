import { previewLeaveReason } from './leave-reason';

// Ô "Lý do nghỉ" (doctor UX2, G15). Lý do là chữ tự do của Bác sĩ: luôn in như chữ thường (React thoát ký tự, không `dangerouslySetInnerHTML`).
// Bản cắt dành cho mắt (`title` hiện đủ khi rê chuột, `aria-hidden` để trình đọc màn hình không đọc hai lần); bản đủ dành cho trình đọc màn hình (`sr-only`).
// `wrap-anywhere` để một từ rất dài không dấu cách bẻ dòng thay vì đẩy rộng cột; `min-w`/`max-w` là sàn và trần bề rộng của cột (bảng dùng bố cục tự động).
export function LeaveReasonCell({ reason }: { reason: string }) {
  const preview = previewLeaveReason(reason);
  return (
    <div className="max-w-80 min-w-40">
      {preview.truncated ? (
        <>
          <span aria-hidden="true" title={reason} className="wrap-anywhere">
            {preview.text}
          </span>
          <span className="sr-only">{reason}</span>
        </>
      ) : (
        <span className="wrap-anywhere">{reason}</span>
      )}
    </div>
  );
}
