import { CalendarDays } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { ApiError } from '../../../shared/api/errors';
import { useSelectedBranch } from '../../../shared/branch-selection';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { getSpecialtyDetail } from '../api/search-service';
import { Breadcrumb } from '../breadcrumb';
import { BOOKING_PATH } from '../search-paths';
import { DoctorCountChip } from './doctor-count-chip';
import { formatVnd } from './format-vnd';
import { SpecialtyImage } from './specialty-image';
import { SpecialtyDoctors } from '../doctors/specialty-doctors';
import { useRemote } from '../../../shared/hooks/use-remote';
import { PUBLIC_CONTAINER } from '../layout';

export const SPECIALTY_NOT_FOUND_MESSAGE = 'Không tìm thấy chuyên khoa này.';
export const SPECIALTY_BOOKING_LABEL = 'Đặt lịch khám';

// "Chi tiết chuyên khoa" (Figma 259:2): phần đầu + danh sách bác sĩ của chuyên khoa (F6).
// Thẻ đầu theo Figma 259:63 (search F14, K7): viền, bo 15, cột ảnh 220 + cột chữ, đệm chữ 22,5; nút "Đặt lịch khám" chỉ khi có bác sĩ.
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
    <main className={`${PUBLIC_CONTAINER} py-8`}>
      <Breadcrumb
        items={[
          { label: 'Trang chủ', to: '/' },
          { label: 'Chuyên khoa', to: '/chuyen-khoa' },
          ...(state.status === 'ready' ? [{ label: state.data.ten }] : []),
        ]}
      />

      <div className="mt-5">
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
          <section className="overflow-hidden rounded-[15px] border border-gray-200 bg-white md:grid md:grid-cols-[220px_minmax(0,1fr)]">
            <div className="p-[15px]">
              <SpecialtyImage
                src={state.data.anhDaiDien}
                name={state.data.ten}
                className="h-48 w-full rounded-lg object-cover md:h-full md:min-h-[184px]"
              />
            </div>
            <div className="p-6">
              <h1 className="text-2xl font-bold text-gray-900">
                {state.data.ten}
              </h1>
              {state.data.moTa && (
                <p className="mt-2 leading-relaxed text-gray-600">
                  {state.data.moTa}
                </p>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <DoctorCountChip count={state.data.soBacSi} large />
                {/* Không có bác sĩ ⇒ giaKhamTu null (hoặc chưa có trong API) ⇒ ẩn chip giá (Q9) */}
                {state.data.giaKhamTu && (
                  <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-600">
                    Giá khám từ {formatVnd(state.data.giaKhamTu.giaKham)} · cọc{' '}
                    {formatVnd(state.data.giaKhamTu.mucDatCoc)}
                  </span>
                )}
              </div>
              {/* Figma 259:88: cam; chữ trắng của Figma chỉ đạt 2,13:1 nên dùng chữ gray-900 trên nền cam token `cta` như nút ở header (10,30:1; ADR 0004) */}
              {state.data.soBacSi > 0 && (
                <Link
                  to={BOOKING_PATH}
                  className="mt-5 inline-flex h-12 items-center gap-2 rounded-[13.375px] bg-cta px-5 text-sm font-medium text-gray-900 hover:bg-cta-hover"
                >
                  <CalendarDays className="size-4" aria-hidden="true" />
                  {SPECIALTY_BOOKING_LABEL}
                </Link>
              )}
            </div>
          </section>
        )}
        {state.status === 'ready' && (
          <SpecialtyDoctors specialtyId={id} specialtyName={state.data.ten} />
        )}
      </div>
    </main>
  );
}
