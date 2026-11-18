import { formatVietnamDate } from '../../common/appointment-format';
import { DETAIL_TEXT } from './detail-messages';

// Hàng "Ngày đặt lịch" (`ngayDat`, ngày Việt Nam) ở cuối thẻ "Trạng thái ca khám" (Figma `458:304`). Chỉ trang Bác sĩ có hàng này (Bệnh nhân bỏ từ F2, Quản trị viên không có):
// truyền vào `footer` của `StatusTimeline` dùng chung (booking F13), nên khi mã trạng thái lạ và không vẽ bước nào thì thẻ vẫn còn hàng này.
export function BookedOnRow(props: { ngayDat: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-gray-100 pt-3 text-sm">
      <span className="text-gray-600">{DETAIL_TEXT.bookedOn}</span>
      <span className="font-medium text-gray-900">
        {formatVietnamDate(props.ngayDat)}
      </span>
    </div>
  );
}
