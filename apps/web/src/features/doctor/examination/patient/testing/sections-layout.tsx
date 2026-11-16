import { useLocation } from 'react-router';
import type { PatientExamCards } from '../patient-exam-sections';

// Hai thành phần giả cho `render-sections.tsx` (doctor-exam F6), tách riêng vì quy tắc `react-refresh/only-export-components`: file có thành phần chỉ được xuất thành phần.
// `SectionsLayout` vẽ hai cột giả như booking đặt thẻ hồ sơ ở cột trái và thẻ đánh giá ở cột phải; `LocationProbe` hiện đường dẫn, query và `location.state` hiện tại (liên kết sổ khám, dữ liệu không được lọt vào URL hay state).
export function SectionsLayout({ record, rating }: PatientExamCards) {
  return (
    <>
      <div data-testid="left-column">{record}</div>
      <div data-testid="right-column">{rating}</div>
    </>
  );
}

export function LocationProbe() {
  const location = useLocation();
  return (
    <>
      <p data-testid="url">{`${location.pathname}${location.search}`}</p>
      <p data-testid="state">{JSON.stringify(location.state)}</p>
    </>
  );
}
