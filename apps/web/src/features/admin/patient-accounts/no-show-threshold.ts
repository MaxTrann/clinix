import { request } from '../../../shared/api/client';

// Ngưỡng no-show hiện hành (`GET /admin/system-config`, B5; chỉ Toàn hệ thống đọc được, đúng đối tượng thấy nút "Mở khoá no-show").
// Chỉ đọc `nguongNoShow`; 11 tham số còn lại bị bỏ. Chưa cấu hình (`null`) hay giá trị lạ thì trả `null`: màn KHÔNG bịa ngưỡng mặc định.
export async function getNoShowThreshold(
  signal?: AbortSignal,
): Promise<number | null> {
  const config = await request<{ nguongNoShow?: number | null }>(
    '/admin/system-config',
    { signal },
  );
  return typeof config.nguongNoShow === 'number' ? config.nguongNoShow : null;
}
