import type { ReactNode } from 'react';

// Thông báo chặn của luồng đặt lịch (A4, liên kết sai, lỗi theo `maLoi`). Dùng thay `ErrorState` khi cần câu riêng theo mã:
// `ErrorState` chỉ có ba câu chung (mạng, quá giờ, lỗi chung). `children` là hành động (liên kết hoặc nút "Thử lại").
export function BookingNotice({
  message,
  children,
}: {
  message: string;
  children?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="my-2 rounded-xl border border-warning-line bg-warning-soft p-3 text-sm text-warning"
    >
      <p>{message}</p>
      {children}
    </div>
  );
}
