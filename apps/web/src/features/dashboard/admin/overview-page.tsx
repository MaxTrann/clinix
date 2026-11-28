import {
  CalendarCheck,
  CalendarDays,
  ChartColumn,
  CircleArrowDown,
  CircleArrowUp,
  Stethoscope,
  TrendingDown,
  Users,
} from 'lucide-react';
import { useSearchParams } from 'react-router';
import { ApiError } from '../../../shared/api/errors';
import { useRemote } from '../../../shared/hooks/use-remote';
import { formatVnd } from '../../../shared/money/format-vnd';
import { formatDate, todayVn } from '../../../shared/schedule/week';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { OfflineBanner } from '../../../shared/ui/offline-banner';
import { AdminForbiddenPage, useAdminScope } from '../../admin';
import {
  getAdminDashboard,
  listBranchOptions,
  type AdminDashboard,
  type Ratio,
} from '../api/dashboard-api';
import {
  formatCount,
  formatLongDate,
  formatPercent,
  formatRange,
} from '../format';
import {
  defaultRange,
  filterFromSearch,
  filterToSearch,
  type DashboardFilter,
} from './filter';
import { FilterBar } from './filter-bar';
import { LOADING_TEXT } from './loading-text';
import { MetricCard } from './metric-card';
import { PendingList } from './pending-list';
import { VisitResultCard } from './visit-result-card';

// Trang Tổng quan của Quản trị viên tại `/admin` (dashboard F1; Figma `507:2` Toàn hệ thống, `587:2` Chi nhánh; PLAN dashboard 5.11).
// Bố cục bám Figma; NỘI DUNG theo PLAN (quyết định của Trung 28/11/2026): không doanh thu, không so sánh kỳ trước, không danh sách chờ, không biểu đồ dịch vụ
// (L10). Biểu đồ xu hướng là của F2. Mọi số là của máy chủ (T5): trang chỉ định dạng.
// URL là nguồn duy nhất của bộ lọc (T11); `useRemote` huỷ yêu cầu cũ khi bộ lọc đổi nên phản hồi cũ về sau không đè kết quả mới (DWB-08).

export const EMPTY_TEXT = 'Không có dữ liệu trong khoảng thời gian đã chọn.';
export const BRANCH_NOT_FOUND_TEXT = 'Không tìm thấy chi nhánh.';

/** "x trên y …" hoặc "Chưa đủ dữ liệu" khi mẫu số 0 (PLAN 5.8). */
function ratioNote(ratio: Ratio, what: string): string {
  return ratio.mauSo === 0
    ? 'Chưa đủ dữ liệu'
    : `${formatCount(ratio.tuSo)} trên ${formatCount(ratio.mauSo)} ${what}`;
}

export function AdminOverviewPage() {
  const scope = useAdminScope();
  const isSystemAdmin = scope.phamVi === 'ToanHeThong';
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = filterFromSearch(searchParams, isSystemAdmin);
  const today = todayVn();
  const range =
    filter.tuNgay !== null && filter.denNgay !== null
      ? { tuNgay: filter.tuNgay, denNgay: filter.denNgay }
      : defaultRange(today);

  const dashboard = useRemote(
    (signal) => getAdminDashboard(filter, signal),
    [filter.tuNgay, filter.denNgay, filter.chiNhanhId],
  );
  // Quản trị viên Chi nhánh không chọn chi nhánh nên không gọi danh sách; lỗi danh sách chỉ làm ô lọc còn "Tất cả chi nhánh"
  const branches = useRemote(
    (signal) =>
      isSystemAdmin ? listBranchOptions(signal) : Promise.resolve([]),
    [isSystemAdmin ? 'ToanHeThong' : 'ChiNhanh'],
  );

  const update = (next: DashboardFilter) =>
    setSearchParams(filterToSearch(next));

  const state = dashboard.state;
  // 403 (phạm vi hỏng hay bị gỡ quyền giữa chừng): trang "không đủ quyền" có sẵn của khu Admin (DWB-09)
  if (
    state.status === 'error' &&
    state.error instanceof ApiError &&
    state.error.status === 403
  )
    return <AdminForbiddenPage />;

  return (
    <div className="flex flex-col gap-4">
      <OfflineBanner />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Tổng quan</h1>
          <p className="text-sm text-gray-500">{formatLongDate(today)}</p>
        </div>
        <FilterBar
          key={`${range.tuNgay}|${range.denNgay}`}
          range={range}
          today={today}
          scopeLabel={
            scope.phamVi === 'ToanHeThong'
              ? 'Toàn hệ thống'
              : `Chi nhánh: ${scope.chiNhanh.ten}`
          }
          branches={
            isSystemAdmin
              ? branches.state.status === 'ready'
                ? branches.state.data
                : []
              : null
          }
          chiNhanhId={filter.chiNhanhId}
          onApplyRange={(next) => update({ ...filter, ...next })}
          onChangeBranch={(chiNhanhId) => update({ ...filter, chiNhanhId })}
          onReload={dashboard.retry}
        />
      </div>

      {state.status === 'loading' && <LoadingState message={LOADING_TEXT} />}
      {state.status === 'error' &&
        (state.error instanceof ApiError && state.error.status === 404 ? (
          <div
            role="alert"
            className="flex flex-col items-start gap-2 rounded-xl border border-warning-line bg-warning-soft px-3 py-2 text-sm text-warning"
          >
            <p>{BRANCH_NOT_FOUND_TEXT}</p>
            <button
              type="button"
              className="font-medium underline"
              onClick={() => update({ ...filter, chiNhanhId: null })}
            >
              Xem phạm vi của tôi
            </button>
          </div>
        ) : (
          <ErrorState error={state.error} onRetry={dashboard.retry} />
        ))}
      {state.status === 'ready' && (
        <OverviewContent
          data={state.data}
          isSystemAdmin={isSystemAdmin}
          filteredByBranch={filter.chiNhanhId !== null}
        />
      )}
    </div>
  );
}

function OverviewContent({
  data,
  isSystemAdmin,
  filteredByBranch,
}: {
  data: AdminDashboard;
  isSystemAdmin: boolean;
  filteredByBranch: boolean;
}) {
  const period = formatRange(data.boLoc.tuNgay, data.boLoc.denNgay);
  const failing = data.hoanTien.soKhoanDangLoi;
  return (
    <>
      {!data.coDuLieu && (
        <p
          role="status"
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600"
        >
          {EMPTY_TEXT}
        </p>
      )}
      {/* Hai khối có tiêu đề cho trình đọc màn hình; `contents` để tám thẻ chảy chung một lưới 4 cột như Figma */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <section aria-labelledby="dashboard-today" className="contents">
          <h2 id="dashboard-today" className="sr-only">
            Hôm nay
          </h2>
          <ul className="contents">
            <MetricCard
              label="Lịch khám hôm nay"
              value={formatCount(data.homNay.lichKham)}
              icon={CalendarCheck}
              tone="cyan"
              note="Chưa gồm lịch chờ thanh toán"
            />
            <MetricCard
              label="Ca hoàn thành hôm nay"
              value={formatCount(data.homNay.hoanThanh)}
              icon={Stethoscope}
              tone="blue"
              note={`Hôm nay, ${formatDate(data.homNay.ngay)}`}
            />
          </ul>
        </section>
        <section aria-labelledby="dashboard-period" className="contents">
          <h2 id="dashboard-period" className="sr-only">
            Trong khoảng đã chọn
          </h2>
          <ul className="contents">
            <MetricCard
              label="Lịch khám trong kỳ"
              value={formatCount(data.trongKhoang.lichKham)}
              icon={CalendarDays}
              tone="blue"
              note={period}
            />
            <MetricCard
              label="Lượt khám hoàn thành"
              value={formatCount(data.trongKhoang.hoanThanh)}
              icon={Users}
              tone="cyan"
              note={period}
            />
            <MetricCard
              label="Tỷ lệ vắng mặt (no-show)"
              value={formatPercent(data.vangMat.phanTram)}
              icon={TrendingDown}
              tone="red"
              note={ratioNote(data.vangMat, 'lịch đã có kết quả')}
            />
            <MetricCard
              label="Tỷ lệ sử dụng khung giờ"
              value={formatPercent(data.khungGio.phanTram)}
              icon={ChartColumn}
              tone="indigo"
              note={ratioNote(
                data.khungGio,
                'khung giờ đã phát ra (trừ nghỉ phép đã duyệt)',
              )}
            />
            <MetricCard
              label="Tiền cọc thu trong kỳ"
              value={formatVnd(data.tienCoc.tongTien)}
              icon={CircleArrowDown}
              tone="emerald"
              note={`${formatCount(data.tienCoc.soKhoan)} khoản cọc qua ví`}
            />
            <MetricCard
              label="Đã hoàn vào ví trong kỳ"
              value={formatVnd(data.hoanTien.tongTien)}
              icon={CircleArrowUp}
              tone="orange"
              note={`${formatCount(data.hoanTien.soKhoan)} khoản hoàn`}
              warning={
                failing > 0
                  ? `${formatCount(failing)} khoản hoàn đang lỗi, chưa vào ví`
                  : undefined
              }
            />
          </ul>
        </section>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <VisitResultCard data={data} />
        <PendingList
          pending={data.choDuyet}
          isSystemAdmin={isSystemAdmin}
          filteredByBranch={filteredByBranch}
        />
      </div>
    </>
  );
}
