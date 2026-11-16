import type { LucideIcon } from 'lucide-react';
import { useId, type ReactNode } from 'react';

// Khung thẻ của hai khối ở chi tiết lịch hẹn của Bệnh nhân (doctor-exam F6; Figma `422:2`, `424:2`): thẻ trắng viền xám, đầu thẻ có biểu tượng và tiêu đề `h2`. Cùng lớp với `DetailCard` của booking (khung chung F12) để hai khối này khớp các thẻ bên cạnh;
// là BẢN CHÉP vì `features/doctor` không được import booking (Q20, WHT-10; `TECH_DEBT` 168 (b): đã có `Frame` của F3). Vùng có tên theo tiêu đề để trình đọc màn hình và test tìm được.
export function ExamCard({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="overflow-hidden rounded-2xl border border-gray-200 bg-white"
    >
      <h2
        id={headingId}
        className="flex items-center gap-2 border-b border-gray-100 px-5 py-3.5 text-sm font-semibold text-gray-900"
      >
        <Icon aria-hidden="true" className="size-4 text-gray-600" />
        {title}
      </h2>
      {children}
    </section>
  );
}
