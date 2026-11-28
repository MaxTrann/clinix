// Phản hồi `GET /admin/dashboard` "không có dữ liệu" cho bộ API giả dùng chung (dashboard F1). Từ F1, mở `/admin` là mở trang Tổng quan, nên mọi test
// của khu Admin (khung, thanh bên, đăng nhập) gọi đường dẫn này; trả thân đúng hình dạng để trang không báo lỗi giữa các ca không liên quan (PLAN R3).
// Test của chính trang Tổng quan dùng `failNext` để trả số liệu riêng.
export const EMPTY_ADMIN_DASHBOARD = {
  boLoc: { tuNgay: '2026-10-19', denNgay: '2026-11-17', chiNhanhId: null },
  capNhatLuc: '2026-11-17T03:00:00.000Z',
  homNay: { ngay: '2026-11-17', lichKham: 0, hoanThanh: 0 },
  trongKhoang: { lichKham: 0, hoanThanh: 0 },
  vangMat: { tuSo: 0, mauSo: 0, phanTram: null },
  khungGio: { tuSo: 0, mauSo: 0, phanTram: null },
  tienCoc: { soKhoan: 0, tongTien: '0.00' },
  hoanTien: { soKhoan: 0, tongTien: '0.00', soKhoanDangLoi: 0 },
  xuHuong: { donVi: 'Ngay', diem: [] },
  choDuyet: { nghiPhep: 0, doiLich: 0, thayDoiChiNhanh: 0, rutTien: 0 },
  coDuLieu: false,
} as const;
