import { Link, useSearchParams } from 'react-router';
import { getSpecialties } from '../api/search-service';
import { useRemote } from '../../../shared/hooks/use-remote';
import { DoctorFilters } from './doctor-filters';
import { DoctorResults } from './doctor-results';
import { useDoctorSearch } from './use-doctor-search';

// Trang "Đội ngũ bác sĩ" (Figma 260:2): không bắt chọn dịch vụ (Q11). Bỏ dải "Ngày khám" và khung giờ (`[SAU]`);
// thêm lọc giá/đánh giá/sắp xếp theo Q12 (chưa có frame Figma).
export function DoctorTeamPage() {
  const [params] = useSearchParams();
  const query = (params.get('q') ?? '').trim().slice(0, 100);
  const serviceId = params.get('dichVuKhamId') ?? '';
  // Khi điều hướng đến cùng trang với từ khoá khác, khởi tạo lại bộ lọc từ URL.
  return (
    <DoctorTeamContent
      key={JSON.stringify([query, serviceId])}
      initialQuery={query}
      serviceId={serviceId}
    />
  );
}

function DoctorTeamContent({
  initialQuery,
  serviceId,
}: {
  initialQuery: string;
  serviceId: string;
}) {
  const search = useDoctorSearch({ initialQuery, dichVuKhamId: serviceId });
  // Danh sách chuyên khoa cho ô chọn; lỗi tải thì ô chỉ còn "Tất cả chuyên khoa", danh sách bác sĩ vẫn dùng được
  const specialties = useRemote(
    (signal) => getSpecialties({ chiNhanhId: null }, signal),
    [],
  );

  return (
    <main className="mx-auto max-w-300 px-7.5 py-8">
      <nav aria-label="Đường dẫn" className="text-sm text-gray-600">
        <Link to="/" className="hover:underline">
          Trang chủ
        </Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Bác sĩ</span>
      </nav>
      <h1 className="mt-3 text-3xl font-semibold text-gray-900">
        Đội ngũ bác sĩ
      </h1>
      <p className="mt-1 text-gray-600">
        Tìm bác sĩ phù hợp với nhu cầu thăm khám của bạn.
      </p>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
        <DoctorFilters
          values={search.values}
          errors={search.errors}
          branches={search.branches}
          specialties={
            specialties.state.status === 'ready'
              ? specialties.state.data.items
              : []
          }
          keywordPlaceholder="Tìm theo tên bác sĩ hoặc chuyên khoa"
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
        />
      </div>
    </main>
  );
}
