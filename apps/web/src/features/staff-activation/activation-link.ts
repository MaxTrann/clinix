// Liên kết kích hoạt trong thư: `WEB_ORIGIN/kich-hoat#id=<id>&token=<token>` (PLAN admin 5.5, Q25). Hai giá trị nằm ở FRAGMENT (sau dấu #)
// nên không vào log máy chủ hay header Referer. Trang đọc rồi xoá chúng khỏi thanh địa chỉ.

export interface ActivationLink {
  id: string;
  token: string;
}

// Đọc `{ id, token }` từ `location.hash`. Hàm THUẦN (không ghi gì), nên gọi lại bao nhiêu lần cũng cho cùng kết quả: StrictMode gọi hàm
// khởi tạo của `useState` hai lần. Quy tắc:
// - cần đúng MỘT `id` và MỘT `token`, không rỗng; trùng khoá là mơ hồ nên coi như không hợp lệ;
// - khoá thừa bị bỏ qua và không bao giờ được gửi đi (chỉ `id` và `token` vào thân yêu cầu);
// - KHÔNG kiểm dạng giá trị (id là số, token 43 ký tự base64url): dạng sai vẫn đi tới API và nhận cùng `LIEN_KET_KHONG_HOP_LE` như mọi lý do
//   khác (NS-35), nên FE không giữ bản sao quy tắc của API để lệch dần.
export function readActivationLink(hash: string): ActivationLink | null {
  if (!hash.startsWith('#')) return null;
  const params = new URLSearchParams(hash.slice(1));
  const ids = params.getAll('id');
  const tokens = params.getAll('token');
  if (ids.length !== 1 || tokens.length !== 1) return null;
  const [id = ''] = ids;
  const [token = ''] = tokens;
  if (id === '' || token === '') return null;
  return { id, token };
}

// Xoá fragment khỏi thanh địa chỉ NGAY khi trang tải (Q25). `replaceState` THAY mục lịch sử hiện tại (không thêm mục, nên Back không quay
// về URL có token) và giữ `history.state` của router. Không có fragment thì không làm gì: StrictMode chạy effect hai lần.
export function clearActivationFragment(): void {
  if (window.location.hash === '') return;
  window.history.replaceState(
    window.history.state,
    '',
    window.location.pathname + window.location.search,
  );
}
