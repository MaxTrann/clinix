import { DateStrip } from '../slots/date-strip';
import { SPECIALTY_SLOTS_SUBTITLE } from '../slots/slot-text';
import { useSlotDate } from '../slots/use-slot-date';
import { DoctorFilters } from './doctor-filters';
import { DoctorResults } from './doctor-results';
import { useDoctorSearch } from './use-doctor-search';

// Phần "Bác sĩ chuyên khoa …" ở chi tiết chuyên khoa (Figma 259:2: câu dẫn, dải 7 ngày và khung giờ của search PR-C2): dùng lại bộ lọc và thẻ của F5 với chuyên khoa cố định.
// H2 18,75 px đậm, cách thẻ đầu 22,5 px (Figma 259:99; search F14, K8).
export function SpecialtyDoctors({
  specialtyId,
  specialtyName,
}: {
  specialtyId: string;
  specialtyName: string;
}) {
  const search = useDoctorSearch({ chuyenKhoaId: specialtyId });
  const slotDate = useSlotDate();
  return (
    <section aria-labelledby="specialty-doctors-title" className="mt-6">
      <h2
        id="specialty-doctors-title"
        className="text-xl font-bold text-gray-900"
      >
        Bác sĩ chuyên khoa {specialtyName}
      </h2>
      <p className="mt-1.5 text-sm text-gray-500">{SPECIALTY_SLOTS_SUBTITLE}</p>
      <div className="mt-4">
        <DoctorFilters
          values={search.values}
          errors={search.errors}
          branches={search.branches}
          onChange={search.change}
        />
      </div>
      <div className="mt-5">
        <DateStrip
          dates={slotDate.dates}
          value={slotDate.date}
          today={slotDate.today}
          onChange={slotDate.setDate}
          showViewing
        />
      </div>
      <div className="mt-6">
        <DoctorResults
          state={search.doctors.state}
          retry={search.doctors.retry}
          page={search.page}
          onPageChange={search.setPage}
          onResetFilters={search.reset}
          slotDate={slotDate}
          variant="specialty"
        />
      </div>
    </section>
  );
}
