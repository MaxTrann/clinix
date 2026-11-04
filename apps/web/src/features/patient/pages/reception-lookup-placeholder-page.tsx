import { EmptyState } from '../../../shared/ui/empty-state';

// Trang giữ chỗ của F2 cho "Tra cứu bệnh nhân"; F8 thay bằng trang thật ở patient-routes.tsx (Q21e).
export function ReceptionLookupPlaceholderPage() {
  return (
    <section>
      <h1 className="text-xl font-semibold text-gray-900">Tra cứu bệnh nhân</h1>
      <EmptyState message="Chưa được triển khai." />
    </section>
  );
}
