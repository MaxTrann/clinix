import { Link, useParams } from 'react-router';
import { ApiError } from '../../../shared/api/errors';
import { useSelectedBranch } from '../../../shared/branch-selection';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { getBranchDetail } from '../api/search-service';
import type { BranchDetail, WeekdayHours } from '../api/search-types';
import { formatDayHours } from '../format/weekly-hours';
import { doctorCountLabel } from '../specialties/doctor-count-label';
import { useRemote } from '../use-remote';

export const BRANCH_NOT_FOUND_MESSAGE = 'Không tìm thấy chi nhánh này.';
export const CHOOSE_BRANCH_LABEL = 'Chọn làm chi nhánh của tôi';
export const CURRENT_BRANCH_LABEL = 'Đang là chi nhánh của bạn';

const DAY_NAMES = [
  'Thứ Hai',
  'Thứ Ba',
  'Thứ Tư',
  'Thứ Năm',
  'Thứ Sáu',
  'Thứ Bảy',
  'Chủ nhật',
];

// Luôn đủ 7 dòng Thứ Hai…Chủ nhật; thứ API không trả về coi như chưa khai báo ⇒ "Nghỉ" (Q4).
function sevenDays(week: readonly WeekdayHours[]) {
  return DAY_NAMES.map((name, index) => {
    const day = week.find((item) => item.thuTrongTuan === index + 1);
    return {
      name,
      text: formatDayHours(day ?? { thuTrongTuan: index + 1, hoatDong: null }),
    };
  });
}

// Trang "Chi tiết chi nhánh" (chưa có frame Figma — PLAN search Q8, Q25): bố cục như chi tiết chuyên khoa.
export function BranchDetailPage() {
  const { id = '' } = useParams();
  const { selection, select } = useSelectedBranch();
  const { state, retry } = useRemote(
    (signal) => getBranchDetail(id, signal),
    [id],
  );

  const notFound =
    state.status === 'error' &&
    state.error instanceof ApiError &&
    state.error.status === 404;

  return (
    <main className="mx-auto max-w-300 px-7.5 py-8">
      <nav aria-label="Đường dẫn" className="text-sm text-gray-600">
        <Link to="/" className="hover:underline">
          Trang chủ
        </Link>
        <span aria-hidden="true"> / </span>
        <Link to="/chi-nhanh" className="hover:underline">
          Chi nhánh
        </Link>
        {state.status === 'ready' && (
          <>
            <span aria-hidden="true"> / </span>
            <span aria-current="page">{state.data.ten}</span>
          </>
        )}
      </nav>

      <div className="mt-6">
        {state.status === 'loading' && <LoadingState />}
        {notFound && (
          <div role="alert" className="rounded-xl border border-gray-200 p-4">
            <p>{BRANCH_NOT_FOUND_MESSAGE}</p>
            <Link
              to="/chi-nhanh"
              className="mt-2 inline-block text-sm font-medium underline"
            >
              Xem tất cả chi nhánh
            </Link>
          </div>
        )}
        {state.status === 'error' && !notFound && (
          <ErrorState error={state.error} onRetry={retry} />
        )}
        {state.status === 'ready' && (
          <BranchDetailBody
            detail={state.data}
            isSelected={selection?.chiNhanhId === state.data.chiNhanhId}
            onChoose={() => select(state.data.chiNhanhId, 'NguoiDung')}
          />
        )}
      </div>
    </main>
  );
}

function BranchDetailBody({
  detail,
  isSelected,
  onChoose,
}: {
  detail: BranchDetail;
  isSelected: boolean;
  onChoose: () => void;
}) {
  const days = sevenDays(
    Array.isArray(detail.lichHoatDong) ? detail.lichHoatDong : [],
  );
  const services = Array.isArray(detail.dichVuKham) ? detail.dichVuKham : [];
  return (
    <section>
      <h1 className="text-3xl font-semibold text-gray-900">{detail.ten}</h1>
      <p className="mt-2 text-gray-700">{detail.diaChi}</p>
      <p className="mt-1 text-sm font-medium text-gray-700">
        {doctorCountLabel(detail.soBacSi)}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {isSelected ? (
          <p
            role="status"
            className="rounded-[0.625rem] bg-brand-soft px-4 py-2 text-sm font-medium text-cyan-800"
          >
            {CURRENT_BRANCH_LABEL}
          </p>
        ) : (
          <button
            type="button"
            onClick={onChoose}
            className="rounded-[0.625rem] bg-amber-500 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-amber-400"
          >
            {CHOOSE_BRANCH_LABEL}
          </button>
        )}
        {/* Trang bác sĩ theo chi nhánh là F6 */}
        <button
          type="button"
          disabled
          title="Chưa được triển khai"
          className="rounded-[0.625rem] bg-gray-100 px-4 py-2 text-sm font-medium text-gray-500"
        >
          Xem bác sĩ tại chi nhánh
          <span className="sr-only"> (chưa được triển khai)</span>
        </button>
      </div>

      <h2 className="mt-8 text-xl font-semibold text-gray-900">
        Giờ nhận khám
      </h2>
      <table className="mt-3 w-full max-w-md text-sm">
        <tbody>
          {days.map((day) => (
            <tr key={day.name} className="border-b border-gray-100">
              <th
                scope="row"
                className="py-2 pr-4 text-left font-medium text-gray-700"
              >
                {day.name}
              </th>
              <td className="py-2 text-gray-700">{day.text}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mt-8 text-xl font-semibold text-gray-900">
        Dịch vụ đang cung cấp
      </h2>
      {services.length === 0 ? (
        <p className="mt-2 text-sm text-gray-600">
          Chưa có dịch vụ nào tại chi nhánh này.
        </p>
      ) : (
        <ul className="mt-3 list-disc pl-5 text-sm text-gray-700">
          {services.map((service) => (
            <li key={service.dichVuKhamId}>{service.ten}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
