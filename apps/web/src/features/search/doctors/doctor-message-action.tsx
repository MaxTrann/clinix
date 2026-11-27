import { MessageSquare } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'react-router';
import { patientChatDoctorPath } from '../../../shared/routes/chat-paths';
import { useAuth } from '../../auth';

// Nút "Nhắn tin" với bác sĩ ở thẻ bác sĩ và trang chi tiết (chat F4 `[ĐỤNG search]`; 2.4.20 b1; PLAN chat MH7, T12; WCH-13). Thay cho nút vô hiệu "Chưa được triển khai".
//  - Bệnh nhân: liên kết tới trang Tin nhắn `?bacSi=` (đầu khung trước tin đầu; hội thoại chỉ tạo khi gửi tin đầu).
//  - Khách (chưa đăng nhập, hay phiên đang kiểm): CÙNG liên kết; khu Bệnh nhân do `RequireAuth` bọc nên khách đi đăng nhập rồi quay lại đúng trang này.
//  - Bác sĩ, Lễ tân, Quản trị viên: nút vô hiệu kèm chú thích "Chỉ Bệnh nhân nhắn tin" (máy chủ cũng chỉ cho Bệnh nhân, QCH-06).
// `features/search` không import `features/chat`: chỉ dùng đường dẫn ở `shared/routes/chat-paths.ts`.

export const PATIENT_ONLY_NOTE = 'Chỉ Bệnh nhân nhắn tin';

interface DoctorMessageActionProps {
  bacSiId: string;
  label: string;
  /** Khung chung của nút (kích thước, bo góc, viền); màu chữ do component tự thêm theo trạng thái. */
  className: string;
}

export function DoctorMessageAction({
  bacSiId,
  label,
  className,
}: DoctorMessageActionProps) {
  const { status, user } = useAuth();
  const noteId = useId();
  const otherRole = status === 'authenticated' && user?.vaiTro !== 'BenhNhan';
  const icon = <MessageSquare className="size-4" aria-hidden="true" />;

  if (otherRole)
    return (
      <span className="flex min-w-0 flex-col">
        <button
          type="button"
          disabled
          aria-describedby={noteId}
          className={`${className} text-gray-500`}
        >
          {icon}
          {label}
        </button>
        <span id={noteId} className="mt-1 text-xs text-gray-500">
          {PATIENT_ONLY_NOTE}
        </span>
      </span>
    );

  return (
    <Link
      to={patientChatDoctorPath(bacSiId)}
      className={`${className} text-gray-700 hover:bg-gray-50`}
    >
      {icon}
      {label}
    </Link>
  );
}
