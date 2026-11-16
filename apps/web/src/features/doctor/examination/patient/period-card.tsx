import type { RemoteState } from '../../../../shared/hooks/use-remote';
import { LoadingState } from '../../../../shared/ui/loading-state';
import type { ExamListPage } from '../api/patient-exam-types';
import { FailureBox } from './failure-box';
import { MonthGrid } from './month-grid';
import { PATIENT_TEXT } from './patient-exam-text';
import { YearTabs } from './year-tabs';

// Thẻ "năm và 12 tháng" (Figma `414:192`): hàng tab năm rồi lưới tháng. Tab năm luôn hiện (đổi năm được cả khi lưới đang tải hay lỗi); lưới là kết quả của bước A (`demTheoThang`): đang tải ⇒ một dòng trạng thái, lỗi ⇒ hộp lỗi
// kèm `Thử lại` chạy lại bước A. Không bao giờ vẽ lưới của năm hay người khám khác.
export function PeriodCard({
  years,
  year,
  onYear,
  counts,
  onRetry,
  month,
  onMonth,
}: {
  years: readonly number[];
  year: number;
  onYear: (year: number) => void;
  counts: RemoteState<ExamListPage>;
  onRetry: () => void;
  month: number | null;
  onMonth: (month: number) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <YearTabs years={years} selected={year} onSelect={onYear} />
      {counts.status === 'ready' ? (
        <MonthGrid
          counts={counts.data.demTheoThang}
          selected={month}
          onSelect={onMonth}
        />
      ) : (
        <div className="px-3 py-1">
          {counts.status === 'loading' ? (
            <LoadingState message={PATIENT_TEXT.loading} />
          ) : (
            <FailureBox error={counts.error} onRetry={onRetry} />
          )}
        </div>
      )}
    </div>
  );
}
