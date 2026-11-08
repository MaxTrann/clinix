import { CircleCheck } from 'lucide-react';
import { SAVED_MESSAGE } from './profile-errors';

// Chữ success trên success-soft đạt 4,72:1 (ADR 0004)
const SUCCESS_BOX =
  'mb-3 flex items-start gap-2 rounded-xl border border-success-line bg-success-soft p-3 text-sm text-success';

// Thông báo "Đã cập nhật thông tin cá nhân." của trang hồ sơ, chuyển nguyên văn từ trang Bản thân (patient F3) để trang Lễ tân (F4) dùng chung.
// Vùng thông báo có sẵn trong DOM để người đọc màn hình nghe được câu thành công; ở lại tới khi sửa lại hoặc rời trang.
export function SavedNotice({ saved }: { saved: boolean }) {
  return (
    <div role="status">
      {saved && (
        <p className={SUCCESS_BOX}>
          <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{SAVED_MESSAGE}</span>
        </p>
      )}
    </div>
  );
}
