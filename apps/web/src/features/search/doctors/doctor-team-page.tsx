import { useSearchParams } from 'react-router';
import { getSpecialties } from '../api/search-service';
import { Breadcrumb } from '../breadcrumb';
import { useRemote } from '../../../shared/hooks/use-remote';
import { DateStrip } from '../slots/date-strip';
import { useSlotDate } from '../slots/use-slot-date';
import { DoctorFilters } from './doctor-filters';
import { DoctorResults } from './doctor-results';
import { useDoctorSearch } from './use-doctor-search';
import { PUBLIC_CONTAINER } from '../layout';

// Trang "Đội ngũ bác sĩ" (Figma 260:2): không bắt chọn dịch vụ (Q11). Có dải "Ngày khám" và khung giờ (search PR-C2);
// thêm lọc giá/đánh giá/sắp xếp theo Q12 (chưa có frame Figma). Nhịp dọc theo Figma 260:52 đến 260:158 (search F14, B1):
// đường dẫn → H1 18,75; H1 → dòng mô tả 5,625; mô tả → bộ lọc 22,5.
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
  const slotDate = useSlotDate();
  // Danh sách chuyên khoa cho ô chọn; lỗi tải thì ô chỉ còn "Tất cả chuyên khoa", danh sách bác sĩ vẫn dùng được
  const specialties = useRemote(
    (signal) => getSpecialties({ chiNhanhId: null }, signal),
    [],
  );

  return (
    <main className={`${PUBLIC_CONTAINER} py-8`}>
      <Breadcrumb
        items={[{ label: 'Trang chủ', to: '/' }, { label: 'Bác sĩ' }]}
      />
      <h1 className="mt-5 text-3xl font-bold text-gray-900">Đội ngũ bác sĩ</h1>
      <p className="mt-1.5 text-gray-600">
        Tìm bác sĩ phù hợp với nhu cầu thăm khám của bạn.
      </p>

      <div className="mt-6">
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
      <div className="mt-5">
        <DateStrip
          dates={slotDate.dates}
          value={slotDate.date}
          today={slotDate.today}
          onChange={slotDate.setDate}
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
          variant="team"
        />
      </div>
    </main>
  );
}
