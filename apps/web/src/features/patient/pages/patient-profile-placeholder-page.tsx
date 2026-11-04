import { EmptyState } from '../../../shared/ui/empty-state';

// Trang giữ chỗ của F1 cho "Hồ sơ người khám"; F3 thay bằng trang thật ở patient-routes.tsx (Q21e).
export function PatientProfilePlaceholderPage() {
  return (
    <section>
      <h1 className="text-xl font-semibold text-gray-900">Hồ sơ người khám</h1>
      <EmptyState message="Chưa được triển khai." />
    </section>
  );
}
