import { NotFoundCard } from '../shared/ui/error-page-card';

// Giữ tên và đường dẫn: `require-auth.tsx` và `router/routes.tsx` import từ đây. Giao diện nằm ở thẻ dùng chung (doctor UX1, G4).
export function NotFoundPage() {
  return <NotFoundCard />;
}
