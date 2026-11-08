/** F8 thêm bốn endpoint cho `/`: test khung/chi nhánh trả danh sách rỗng đúng hợp đồng. */
export function emptyPublicHomeResponse(input: string): Response | null {
  const path = new URL(input, 'http://localhost').pathname;
  let body: unknown;
  switch (path) {
    case '/api/public/overview':
      body = { soChuyenKhoa: 0, soBacSi: 0, soDichVu: 0 };
      break;
    case '/api/public/service-groups':
      body = { items: [] };
      break;
    case '/api/public/specialties':
      body = { items: [], total: 0, page: 1, pageSize: 8, soCoBacSi: 0 };
      break;
    case '/api/public/doctors':
      body = { items: [], total: 0, page: 1, pageSize: 8 };
      break;
    default:
      return null;
  }
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
