import type {
  ApproveBody,
  ApproveResult,
  RejectBody,
  RejectResult,
} from './request-handle-readers';

// Hàm gọi hai route GHI của MỘT vai trò (Lễ tân: `reception/reschedule-requests/:id/approve|reject`; Quản trị viên ở F5: `admin/…`). Tách khỏi `RescheduleRequestsApi` (đọc) để Pha B chỉ THÊM file: thành phần dùng chung
// chỉ biết giao diện này. POST KHÔNG nhận `signal`: yêu cầu đã gửi thì máy chủ vẫn xử lý dù trang bị gỡ, nên huỷ ở client chỉ làm người dùng không biết kết quả (nếp F2, F9).
export interface RescheduleRequestHandlers {
  approve: (yeuCauId: string, body: ApproveBody) => Promise<ApproveResult>;
  reject: (yeuCauId: string, body: RejectBody) => Promise<RejectResult>;
}
