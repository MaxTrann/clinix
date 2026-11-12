import { ChevronLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { ApiError } from '../../../shared/api/errors';
import { ErrorState } from '../../../shared/ui/error-state';
import { LoadingState } from '../../../shared/ui/loading-state';
import { getServices } from '../api/search-service';
import { serviceListPath } from '../search-paths';
import { useRemote } from '../../../shared/hooks/use-remote';
import { DoctorFilters } from './doctor-filters';
import {
  DOCTOR_EMPTY_HINT_WITH_SERVICE,
  DoctorResults,
} from './doctor-results';
import { useDoctorSearch } from './use-doctor-search';

export const SERVICE_NOT_FOUND_MESSAGE = 'Không tìm thấy dịch vụ này.';

// Bước 3 "Bác sĩ" (Figma 446:2, không khung giờ): bác sĩ nhận dịch vụ đã chọn + bộ lọc. Tên dịch vụ lấy từ danh sách của nhóm.
export function DoctorListPage() {
  const { groupId = '', serviceId = '' } = useParams();
  const search = useDoctorSearch({ dichVuKhamId: serviceId });
  // Không lọc theo chi nhánh khi tra tên: dịch vụ vẫn có tên dù chi nhánh đang chọn không cung cấp
  const services = useRemote(
    (signal) => getServices(groupId, null, signal),
    [groupId],
  );
  const service =
    services.state.status === 'ready'
      ? services.state.data.items.find((s) => s.dichVuKhamId === serviceId)
      : undefined;
  const serviceMissing =
    (services.state.status === 'ready' && !service) ||
    (services.state.status === 'error' &&
      services.state.error instanceof ApiError &&
      services.state.error.status === 404);
  const backToServices = (
    <Link to={serviceListPath(groupId)} className="underline">
      Chọn dịch vụ khác
    </Link>
  );

  return (
    <main className="mx-auto max-w-300 px-7.5 py-8">
      <Link
        to={serviceListPath(groupId)}
        className="inline-flex items-center gap-1 text-sm text-gray-700 hover:underline"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Chọn lại dịch vụ khám
      </Link>
      <h1 className="mt-4 text-3xl font-semibold text-gray-900">Chọn bác sĩ</h1>
      {service && (
        <p className="mt-1 text-gray-600">
          Dịch vụ: <strong className="text-gray-900">{service.ten}</strong>
        </p>
      )}

      {services.state.status === 'loading' && <LoadingState />}
      {services.state.status === 'error' && !serviceMissing && (
        <ErrorState error={services.state.error} onRetry={services.retry} />
      )}
      {serviceMissing ? (
        <div
          role="alert"
          className="mt-6 rounded-xl border border-gray-200 p-4"
        >
          <p>{SERVICE_NOT_FOUND_MESSAGE}</p>
          <div className="mt-2 text-sm font-medium">{backToServices}</div>
        </div>
      ) : (
        <>
          <div className="mt-6">
            <DoctorFilters
              values={search.values}
              errors={search.errors}
              branches={search.branches}
              onChange={search.change}
            />
          </div>
          <div className="mt-6">
            <DoctorResults
              state={search.doctors.state}
              retry={search.doctors.retry}
              page={search.page}
              onPageChange={search.setPage}
              onResetFilters={search.reset}
              emptyAction={backToServices}
              emptyHint={DOCTOR_EMPTY_HINT_WITH_SERVICE}
            />
          </div>
        </>
      )}
    </main>
  );
}
