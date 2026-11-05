import { Link, useParams } from 'react-router';
import { ApiError } from '../../../shared/api/errors';
import { useSelectedBranch } from '../../../shared/branch-selection';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { getSpecialtyDetail } from '../api/search-service';
import { doctorCountLabel } from './doctor-count-label';
import { formatVnd } from './format-vnd';
import { SpecialtyImage } from './specialty-image';
import { useRemote } from './use-remote';

export const SPECIALTY_NOT_FOUND_MESSAGE = 'Không tìm thấy chuyên khoa này.';

// Đầu trang "Chi tiết chuyên khoa" (Figma 259:2). Danh sách bác sĩ bên dưới là F6.
export function SpecialtyDetailPage() {
  const { id = '' } = useParams();
  const { selection } = useSelectedBranch();
  const branchId = selection?.chiNhanhId ?? null;
  const { state, retry } = useRemote(
    (signal) => getSpecialtyDetail(id, branchId, signal),
    [id, branchId],
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
        <Link to="/chuyen-khoa" className="hover:underline">
          Chuyên khoa
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
            <p>{SPECIALTY_NOT_FOUND_MESSAGE}</p>
            <Link
              to="/chuyen-khoa"
              className="mt-2 inline-block text-sm font-medium underline"
            >
              Xem tất cả chuyên khoa
            </Link>
          </div>
        )}
        {state.status === 'error' && !notFound && (
          <ErrorState error={state.error} onRetry={retry} />
        )}
        {state.status === 'ready' && (
          <section className="flex flex-col gap-6 md:flex-row">
            <SpecialtyImage
              src={state.data.anhDaiDien}
              name={state.data.ten}
              className="h-56 w-full rounded-xl object-cover md:w-80"
            />
            <div>
              <h1 className="text-3xl font-semibold text-gray-900">
                {state.data.ten}
              </h1>
              {state.data.moTa && (
                <p className="mt-2 text-gray-700">{state.data.moTa}</p>
              )}
              <p className="mt-3 text-sm font-medium text-gray-700">
                {doctorCountLabel(state.data.soBacSi)}
              </p>
              {/* Không có bác sĩ ⇒ giaKhamTu null (hoặc chưa có trong API) ⇒ ẩn dòng giá (Q9) */}
              {state.data.giaKhamTu && (
                <p className="mt-1 text-sm text-gray-700">
                  Giá khám từ {formatVnd(state.data.giaKhamTu.giaKham)} · cọc{' '}
                  {formatVnd(state.data.giaKhamTu.mucDatCoc)}
                </p>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
