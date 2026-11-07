import { DoctorFilters } from './doctor-filters';
import { DoctorResults } from './doctor-results';
import { useDoctorSearch } from './use-doctor-search';

// Phần "Bác sĩ chuyên khoa …" ở chi tiết chuyên khoa (Figma 259:2, bỏ dải 7 ngày và khung giờ): dùng lại bộ lọc và thẻ của F5 với chuyên khoa cố định.
export function SpecialtyDoctors({
  specialtyId,
  specialtyName,
}: {
  specialtyId: string;
  specialtyName: string;
}) {
  const search = useDoctorSearch({ chuyenKhoaId: specialtyId });
  return (
    <section aria-labelledby="specialty-doctors-title" className="mt-10">
      <h2
        id="specialty-doctors-title"
        className="text-2xl font-semibold text-gray-900"
      >
        Bác sĩ chuyên khoa {specialtyName}
      </h2>
      <div className="mt-4">
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
        />
      </div>
    </section>
  );
}
