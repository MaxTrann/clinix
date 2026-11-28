import { ChevronDown, RotateCw } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { DateField } from '../../../shared/masked-input/date-field';
import type { BranchOption } from '../api/dashboard-api';
import {
  activePreset,
  PERIOD_PRESETS,
  presetRange,
  RANGE_PROBLEM_TEXT,
  rangeProblem,
  type PeriodPreset,
} from './filter';

// Hàng bộ lọc của trang Tổng quan (Figma `507:308`; PLAN dashboard 5.11; T11). Thứ tự như Figma: nhãn phạm vi, ô chi nhánh (CHỈ Toàn hệ thống), bốn nút kỳ,
// khoảng ngày. Khác Figma có chủ đích: ô khoảng ngày là hai ô ngày kèm nút "Áp dụng" (Figma vẽ một nút mở lịch); thêm nút "Tải lại" (T9: không tự làm mới).
// Kiểm khoảng ngày TẠI CHỖ trước khi gọi (thiếu, đảo ngược, quá 366 ngày): lỗi thì không gọi API (DWB-04).
// Nơi dùng gắn `key` theo bộ lọc hiện tại nên ô ngày nháp tự về đúng giá trị khi bộ lọc đổi từ nơi khác (bấm nút kỳ, quay lại trang).

export interface FilterBarProps {
  range: { tuNgay: string; denNgay: string };
  today: string;
  scopeLabel: string;
  /** `null` = Quản trị viên Chi nhánh: không có ô chi nhánh, không bao giờ gửi `chiNhanhId` (DWB-05) */
  branches: BranchOption[] | null;
  chiNhanhId: string | null;
  onApplyRange: (range: { tuNgay: string; denNgay: string }) => void;
  onChangeBranch: (chiNhanhId: string | null) => void;
  onReload: () => void;
}

const CONTROL =
  'min-h-11 rounded-xl border border-gray-200 bg-white px-3 text-xs text-gray-700';

export function FilterBar({
  range,
  today,
  scopeLabel,
  branches,
  chiNhanhId,
  onApplyRange,
  onChangeBranch,
  onReload,
}: FilterBarProps) {
  const [tuNgay, setTuNgay] = useState(range.tuNgay);
  const [denNgay, setDenNgay] = useState(range.denNgay);
  const [problem, setProblem] = useState<string | null>(null);
  const fromId = useId();
  const toId = useId();
  const active = activePreset(range, today);

  function apply(event: FormEvent) {
    event.preventDefault();
    const found = rangeProblem(tuNgay, denNgay);
    if (found !== null) {
      setProblem(RANGE_PROBLEM_TEXT[found]);
      return;
    }
    setProblem(null);
    onApplyRange({ tuNgay, denNgay });
  }

  function choosePreset(preset: PeriodPreset) {
    setProblem(null);
    onApplyRange(presetRange(preset, today));
  }

  return (
    <div className="flex flex-col gap-2 lg:items-end">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
        <span className="inline-flex min-h-8 items-center self-start rounded-xl border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 sm:self-auto">
          {scopeLabel}
        </span>
        {branches !== null && (
          <label className="relative">
            <span className="sr-only">Chi nhánh</span>
            <select
              className={`${CONTROL} w-full appearance-none pr-8 sm:w-48`}
              value={chiNhanhId ?? ''}
              onChange={(event) =>
                onChangeBranch(
                  event.target.value === '' ? null : event.target.value,
                )
              }
            >
              <option value="">Tất cả chi nhánh</option>
              {branches.map((branch) => (
                <option key={branch.chiNhanhId} value={branch.chiNhanhId}>
                  {branch.ten}
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-3 size-3 -translate-y-1/2 text-gray-500"
            />
          </label>
        )}
        <div
          role="group"
          aria-label="Chọn nhanh kỳ"
          className="flex overflow-hidden rounded-xl border border-gray-200 bg-white"
        >
          {PERIOD_PRESETS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={active === key}
              onClick={() => choosePreset(key)}
              className={`min-h-11 flex-1 border-r border-gray-100 px-3 text-sm font-medium whitespace-nowrap last:border-r-0 ${
                active === key
                  ? 'bg-brand-strong text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <form
        onSubmit={apply}
        noValidate
        className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end"
      >
        {/* Ô ngày dùng chung `DateField` (dd/mm/yyyy, nút lịch; luật UX1-61: không `input type="date"` ngoài nó). Nhãn gắn bằng `htmlFor`, không bọc */}
        <div className="flex items-center gap-2">
          <label htmlFor={fromId} className="text-xs text-gray-600">
            Từ ngày
          </label>
          <DateField
            id={fromId}
            value={tuNgay}
            max={denNgay || undefined}
            onChange={setTuNgay}
            className={CONTROL}
            wrapperClassName="flex-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor={toId} className="text-xs text-gray-600">
            Đến ngày
          </label>
          <DateField
            id={toId}
            value={denNgay}
            min={tuNgay || undefined}
            onChange={setDenNgay}
            className={CONTROL}
            wrapperClassName="flex-1"
          />
        </div>
        <button
          type="submit"
          className="min-h-11 rounded-xl bg-brand-strong px-4 text-sm font-medium text-white hover:bg-brand-hover"
        >
          Áp dụng
        </button>
        <button
          type="button"
          onClick={onReload}
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <RotateCw aria-hidden="true" className="size-4" />
          Tải lại
        </button>
      </form>
      {problem && (
        <p role="alert" className="text-xs font-medium text-danger">
          {problem}
        </p>
      )}
    </div>
  );
}
