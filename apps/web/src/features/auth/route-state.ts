// `location.state` là dữ liệu chưa kiểm dạng: có thể do trang khác đặt, hoặc cũ từ lịch sử trình duyệt.
export function textFrom(state: unknown, key: string): string | null {
  if (typeof state !== 'object' || state === null) return null;
  const value = (state as Record<string, unknown>)[key];
  return typeof value === 'string' && value !== '' ? value : null;
}
