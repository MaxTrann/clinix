import { Info } from 'lucide-react';
import { Link } from 'react-router';
import { LOGIN_PATH, useAuth } from '../auth';

// Dải nhắc đăng nhập ở cuối danh sách nhóm dịch vụ (Bước 1). Figma `444:2` là khung bệnh nhân đã đăng nhập nên KHÔNG có dải này;
// nguồn là Make `BookingWizard.tsx` dòng 1637 đến 1642 (search UI PR-B, Đại chọn chỉ Bước 1, 17/11/2026). Màu theo token cảnh báo (ADR 0004):
// chữ amber-900 đậm hơn `warning` (amber-700) của Make để dư tương phản trên nền amber-50.
// Chỉ vẽ khi ĐÃ BIẾT là khách (`unauthenticated`): đang kiểm tra phiên (`checking`) hay lỗi mạng khi kiểm tra (`error`) chưa phải "chưa đăng nhập",
// và vẽ rồi gỡ sẽ làm trang nhấp nháy. Không `role="alert"`/`status`: dải hiện sau khi phiên khôi phục xong, không nên đọc chen hay chiếm tiêu điểm.
export function GuestLoginBanner() {
  const { status } = useAuth();
  if (status !== 'unauthenticated') return null;

  return (
    <div className="mt-5 flex gap-3 rounded-xl border border-warning-line bg-warning-soft p-4 text-base text-amber-900">
      <Info className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <p>
        Bạn có thể xem dịch vụ và lịch trống trước. Cần{' '}
        <Link to={LOGIN_PATH} className="font-semibold underline">
          đăng nhập
        </Link>{' '}
        để hoàn tất đặt lịch ở bước 4.
      </p>
    </div>
  );
}
