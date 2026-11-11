import { READ_ONLY_NOTE } from './reception-labels';
import { ScheduleBoard } from './schedule-board';
import { useReceptionBranchName } from './use-reception-data';

// Trang "Lịch làm việc bác sĩ" của Lễ tân (doctor F5; Figma `486:2`, `499:2`, `500:2`; WL-08, WL-09). CHỈ XEM: không có "+", Phân công hay Gỡ ca.
// Phần thân (lọc, lưới, ngăn kéo) dùng chung với trang Admin ở `ScheduleBoard`.
export function ReceptionSchedulePage() {
  const branchName = useReceptionBranchName();
  return (
    <section className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">
          Lịch làm việc bác sĩ
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
          Chỉ xem
          {branchName !== null && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-300 bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-brand-strong">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-brand-strong"
              />
              {branchName}
            </span>
          )}
        </p>
      </header>
      <ScheduleBoard source="reception" footerNote={READ_ONLY_NOTE} />
    </section>
  );
}
