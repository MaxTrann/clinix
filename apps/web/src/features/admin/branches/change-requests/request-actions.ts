import type { ChangeRequestListItem } from './change-request-types';

// Thao tác người đang xem được làm trên một yêu cầu thay đổi chi nhánh (admin F6b; PLAN admin 5.4; Q3, Q47, Q48). HÀM THUẦN.
// - Duyệt, Từ chối: Admin Toàn hệ thống, yêu cầu Chờ duyệt.
// - Rút: đúng người gửi (`laCuaToi`, máy chủ tính từ phiên), yêu cầu Chờ duyệt; Admin Toàn hệ thống tự gửi cũng rút được.
// - Dời hiệu lực: Admin Toàn hệ thống, yêu cầu quá hạn chờ xử lý.
// - Hủy: Admin Toàn hệ thống, yêu cầu Đã duyệt mà chưa áp dụng (kể cả quá hạn, Q47).
// Chỉ để quyết định hiện nút; máy chủ (B9, B10, B21, B22) vẫn kiểm quyền và trạng thái.

export type ActionKind =
  'approve' | 'reject' | 'withdraw' | 'cancel' | 'reschedule';

/** Quá hạn chờ xử lý (Q48): đã duyệt, chưa áp dụng, job đã đánh dấu `qua_han_luc`. */
export function isOverdue(item: ChangeRequestListItem): boolean {
  return (
    item.trangThai === 'DaDuyet' &&
    item.apDungLuc === null &&
    item.quaHanLuc !== null
  );
}

/** Thứ tự trả về là thứ tự hiện nút. */
export function actionsFor(
  item: ChangeRequestListItem,
  isSystemAdmin: boolean,
): ActionKind[] {
  const actions: ActionKind[] = [];
  if (item.trangThai === 'ChoDuyet') {
    if (isSystemAdmin) actions.push('approve', 'reject');
    if (item.laCuaToi) actions.push('withdraw');
  }
  if (isSystemAdmin && isOverdue(item)) actions.push('reschedule');
  if (isSystemAdmin && item.trangThai === 'DaDuyet' && item.apDungLuc === null)
    actions.push('cancel');
  return actions;
}
