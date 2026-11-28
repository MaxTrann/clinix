import { useId, useState } from 'react';
import type { AdminDashboard } from '../api/dashboard-api';
import { formatCount } from '../format';
import {
  axisLabel,
  axisScale,
  barPercent,
  labelledIndexes,
  pointLabel,
  trendSummary,
} from './trend-scale';
import { TrendTable } from './trend-table';

// Khối "Xu hướng đăng ký khám" (dashboard F2; PLAN 5.11; Q5, Q8). Bố cục khung theo Figma `507:460` (thẻ trắng, lưới ngang mảnh, nhãn trục xám);
// Figma vẽ đường "Tiền khám đã thu", PLAN chốt CỘT đếm lịch đặt mới (L10), nên vẽ cột. SVG tự viết, không thêm thư viện (Q8).
// Cột vẽ trong SVG `preserveAspectRatio="none"` để co theo chiều rộng khung; chữ trục là HTML đặt theo phần trăm nên không bị kéo méo.
// Trình đọc màn hình: SVG là `role="img"` có tên tóm tắt; số chi tiết ở bảng mở bằng nút "Xem bảng số" (DBD-02).

export const TREND_EMPTY_TEXT = 'Chưa có lịch đặt mới trong khoảng đã chọn.';

/** Bề rộng một ô cột trong hệ toạ độ SVG; cột chiếm 70% ô, chừa khe giữa các cột. */
const SLOT = 10;
const BAR = 7;

export function TrendChart({ trend }: { trend: AdminDashboard['xuHuong'] }) {
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();
  const titleId = useId();
  const points = trend.diem;
  const unit = trend.donVi;
  const { top, ticks } = axisScale(
    Math.max(0, ...points.map((point) => point.soLuong)),
  );
  const isEmpty = top === 0;
  const width = Math.max(points.length, 1) * SLOT;
  const labelled = labelledIndexes(points.length);

  return (
    <section
      aria-labelledby={titleId}
      className="min-w-0 rounded-2xl border border-gray-100 bg-white p-5"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id={titleId} className="text-sm font-semibold text-text-primary">
            Xu hướng đăng ký khám
          </h2>
          <p className="mt-0.5 text-xs text-text-muted">
            Lịch đặt mới{' '}
            {unit === 'Ngay' ? 'theo ngày' : 'theo tuần (thứ Hai đến Chủ nhật)'}
            , tính theo ngày đặt; gồm lịch đã huỷ hay hết hạn, không tính lịch
            sinh ra khi đổi lịch.
          </p>
        </div>
        <button
          type="button"
          aria-expanded={showTable}
          aria-controls={tableId}
          onClick={() => setShowTable((shown) => !shown)}
          className="min-h-11 shrink-0 self-start rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {showTable ? 'Ẩn bảng số' : 'Xem bảng số'}
        </button>
      </div>

      <div className="mt-4 flex gap-2">
        {/* Trục dọc: vạch từ trên xuống; vạch cao nhất là đỉnh trục ("số lớn nhất ở trục", PLAN 5.11) */}
        <div
          aria-hidden="true"
          className="relative h-48 w-8 shrink-0 text-right text-[11px] text-gray-400"
        >
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-0 -translate-y-1/2"
              style={{ top: `${100 - barPercent(tick, top || 1)}%` }}
            >
              {formatCount(tick)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <svg
            role="img"
            aria-label={trendSummary(points, unit)}
            viewBox={`0 0 ${width} 100`}
            preserveAspectRatio="none"
            className="block h-48 w-full overflow-visible"
          >
            {ticks.map((tick) => {
              const y = 100 - barPercent(tick, top || 1);
              return (
                <line
                  key={tick}
                  x1="0"
                  x2={width}
                  y1={y}
                  y2={y}
                  vectorEffect="non-scaling-stroke"
                  strokeDasharray={tick === 0 ? undefined : '3 3'}
                  className={tick === 0 ? 'stroke-gray-300' : 'stroke-gray-100'}
                />
              );
            })}
            {points.map((point, index) => {
              const height = barPercent(point.soLuong, top);
              return (
                <rect
                  key={point.tuNgay}
                  data-testid="trend-bar"
                  x={index * SLOT + (SLOT - BAR) / 2}
                  y={100 - height}
                  width={BAR}
                  height={height}
                  rx="1"
                  className="fill-blue-500"
                >
                  <title>{`${pointLabel(point, unit)}: ${formatCount(point.soLuong)} lịch`}</title>
                </rect>
              );
            })}
          </svg>
          {isEmpty && (
            <p className="absolute inset-x-0 top-1/3 text-center text-sm text-gray-500">
              {TREND_EMPTY_TEXT}
            </p>
          )}
          {/* Trục ngang: chỉ một số điểm có nhãn để không chồng chữ; nhãn đặt giữa cột của nó */}
          <div
            aria-hidden="true"
            className="relative mt-1 h-4 text-[11px] text-gray-400"
          >
            {labelled.map((index) => {
              const point = points[index];
              if (point === undefined) return null;
              return (
                <span
                  key={point.tuNgay}
                  data-testid="trend-axis-label"
                  className="absolute -translate-x-1/2 whitespace-nowrap"
                  style={{ left: `${((index + 0.5) / points.length) * 100}%` }}
                >
                  {axisLabel(point)}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Luôn có trong DOM để `aria-controls` trỏ tới phần tử có thật; ẩn bằng `hidden` */}
      <TrendTable
        id={tableId}
        points={points}
        unit={unit}
        hidden={!showTable}
      />
    </section>
  );
}
