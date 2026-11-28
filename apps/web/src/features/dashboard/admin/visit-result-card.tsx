import type { AdminDashboard } from '../api/dashboard-api';
import { formatCount, formatPercent } from '../format';

// Khối "Kết quả lịch khám" (Figma `507:615`, vòng tròn và chú thích). Vẽ bằng SVG tự viết, không thêm thư viện biểu đồ (Q8).
// Tổng là số lịch ĐÃ CÓ KẾT QUẢ trong khoảng (mẫu số vắng mặt Q1): hoàn thành, đã tiếp đón, vắng mặt. Phần trăm vắng mặt lấy NGUYÊN số máy chủ trả (T5);
// độ dài từng cung chỉ là hình vẽ (tỉ lệ số đếm), không hiện thành số. Khác Figma: thêm phần "Đã tiếp đón" để ba phần cộng đúng bằng tổng.

const RADIUS = 60;
const STROKE = 20;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface Segment {
  key: string;
  label: string;
  count: number;
  /** Màu cung (lớp HẰNG cho `stroke`) và chấm chú thích (`bg`) */
  stroke: string;
  dot: string;
  /** Dòng số lớn của chú thích */
  headline: string;
}

export function VisitResultCard({ data }: { data: AdminDashboard }) {
  const total = data.vangMat.mauSo;
  const completed = data.trongKhoang.hoanThanh;
  const noShow = data.vangMat.tuSo;
  // Đã tiếp đón = đã có kết quả − hoàn thành − vắng mặt (ba trạng thái của mẫu số Q1); không âm phòng khi số lệch
  const checkedIn = Math.max(total - completed - noShow, 0);
  const segments: Segment[] = [
    {
      key: 'hoan-thanh',
      label: 'Hoàn thành',
      count: completed,
      stroke: 'stroke-blue-600',
      dot: 'bg-blue-600',
      headline: formatCount(completed),
    },
    {
      key: 'da-tiep-don',
      label: 'Đã tiếp đón, đang khám',
      count: checkedIn,
      stroke: 'stroke-cyan-300',
      dot: 'bg-cyan-300',
      headline: formatCount(checkedIn),
    },
    {
      key: 'vang-mat',
      label: 'Vắng mặt (no-show)',
      count: noShow,
      stroke: 'stroke-gray-300',
      dot: 'bg-gray-300',
      headline: formatPercent(data.vangMat.phanTram),
    },
  ];

  // Cung thứ i bắt đầu ở tổng độ dài các cung trước nó
  const arcs = segments.map((segment, index) => ({
    segment,
    length: total > 0 ? (segment.count / total) * CIRCUMFERENCE : 0,
    start: segments
      .slice(0, index)
      .reduce(
        (sum, previous) =>
          sum + (total > 0 ? (previous.count / total) * CIRCUMFERENCE : 0),
        0,
      ),
  }));

  return (
    <section
      aria-labelledby="dashboard-visits-title"
      className="rounded-2xl border border-gray-100 bg-white p-5"
    >
      <h2
        id="dashboard-visits-title"
        className="text-sm font-semibold text-text-primary"
      >
        Kết quả lịch khám
      </h2>
      <p className="mt-0.5 text-xs text-text-muted">
        Lịch có ngày khám trong khoảng đã chọn và đã có kết quả.
      </p>
      <div className="mt-4 flex flex-col items-center gap-8 sm:flex-row">
        <div className="relative size-40 shrink-0">
          <svg
            viewBox="0 0 160 160"
            className="size-40 -rotate-90"
            aria-hidden="true"
          >
            <circle
              cx="80"
              cy="80"
              r={RADIUS}
              fill="none"
              strokeWidth={STROKE}
              className="stroke-gray-100"
            />
            {arcs
              .filter(({ length }) => length > 0)
              .map(({ segment, length, start }) => (
                <circle
                  key={segment.key}
                  cx="80"
                  cy="80"
                  r={RADIUS}
                  fill="none"
                  strokeWidth={STROKE}
                  className={segment.stroke}
                  strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
                  strokeDashoffset={-start}
                />
              ))}
          </svg>
          <p className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[10px] text-text-muted">Tổng cộng</span>
            <span className="text-lg font-bold text-text-primary">
              {formatCount(total)}
            </span>
            <span className="text-[10px] text-text-muted">lượt khám</span>
          </p>
        </div>
        <ul className="flex flex-col gap-3">
          {segments.map((segment) => (
            <li key={segment.key} className="flex items-start gap-2">
              <span
                aria-hidden="true"
                className={`mt-1.5 size-2.5 shrink-0 rounded-full ${segment.dot}`}
              />
              <span>
                <span className="block text-lg font-bold text-text-primary">
                  {segment.headline}
                </span>
                <span className="block text-xs font-medium text-gray-700">
                  {segment.label}
                </span>
                <span className="block text-xs text-text-muted">
                  {formatCount(segment.count)} lượt khám
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
