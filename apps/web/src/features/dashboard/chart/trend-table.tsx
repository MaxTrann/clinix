import type { TrendPoint } from '../api/dashboard-api';
import { formatCount } from '../format';
import { pointLabel, type TrendUnit } from './trend-scale';

// Bảng số thay thế cho biểu đồ xu hướng (dashboard F2; PLAN 5.11, DBD-02): cùng dữ liệu, mọi điểm một hàng, có tiêu đề cột.
// Khung `overflow-x-auto` để bảng cuộn TRONG khung, không đẩy trang tràn ngang ở 375 px (DBD-04).

export function TrendTable({
  id,
  points,
  unit,
  hidden,
}: {
  id: string;
  points: TrendPoint[];
  unit: TrendUnit;
  hidden: boolean;
}) {
  return (
    <div
      id={id}
      hidden={hidden}
      className="mt-3 max-h-72 overflow-auto rounded-xl border border-gray-100"
    >
      <table className="w-full text-left text-sm">
        <caption className="sr-only">
          Số lịch đặt mới {unit === 'Ngay' ? 'theo ngày' : 'theo tuần'}
        </caption>
        <thead className="sticky top-0 bg-gray-50 text-xs text-gray-600">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium whitespace-nowrap">
              {unit === 'Ngay' ? 'Ngày' : 'Tuần'}
            </th>
            <th
              scope="col"
              className="px-3 py-2 text-right font-medium whitespace-nowrap"
            >
              Số lịch đặt mới
            </th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.tuNgay} className="border-t border-gray-100">
              <th
                scope="row"
                className="px-3 py-1.5 font-normal whitespace-nowrap text-gray-700"
              >
                {pointLabel(point, unit)}
              </th>
              <td className="px-3 py-1.5 text-right font-medium text-text-primary">
                {formatCount(point.soLuong)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
