import type { SlotState } from './request-types';

// Câu hiển thị cho chi tiết yêu cầu đổi lịch (reschedule F4; PLAN reschedule 5.7, 5.13). Chữ là `[đề xuất]` (Q13), nhóm sửa khi duyệt PR. Chọn câu theo MÃ (`lyDoKhongDuyet`,
// `khungGioMongMuon.trangThai`), KHÔNG theo `thongBao` của máy chủ, và KHÔNG bao giờ in mã thô ra màn hình. Hàm thuần.

const CAN_REJECT = 'Bạn vẫn có thể từ chối.';

// Khoá là `maLoi` của `lyDoKhongDuyet` (B8); dùng `Map` (không phải đối tượng thường) để mã lạ như "constructor" không trúng khoá của nguyên mẫu.
// Yêu cầu tồn (R6): lịch gốc không còn đổi được thì CHỈ chặn Duyệt, Từ chối luôn dùng được.
const NOT_APPROVABLE = new Map<string, string>([
  [
    'LICH_HEN_KHONG_CHO_DOI',
    `Lịch hẹn gốc không còn ở trạng thái đã xác nhận (đã huỷ, đã tiếp đón, vắng mặt hoặc đã đổi) nên không thể duyệt. ${CAN_REJECT}`,
  ],
  [
    'LICH_HEN_DA_QUA_GIO',
    `Đã quá giờ cho phép đổi lịch hẹn gốc nên không thể duyệt. ${CAN_REJECT}`,
  ],
  [
    'HO_SO_NGUOI_THAN_DA_NGUNG',
    `Hồ sơ người thân đã ngừng sử dụng nên không thể duyệt. ${CAN_REJECT}`,
  ],
  [
    'CHUOI_DOI_LICH_QUA_DAI',
    `Lịch hẹn này đã đổi quá nhiều lần nên không thể duyệt. ${CAN_REJECT}`,
  ],
  [
    'HE_THONG_CHUA_CAU_HINH',
    `Hệ thống chưa cấu hình số lần đổi lịch nên chưa thể duyệt. ${CAN_REJECT}`,
  ],
]);

// `YEU_CAU_DA_XU_LY` và `KHONG_TIM_THAY` không xảy ra khi yêu cầu còn chờ; mã lạ cũng ra câu này
const GENERIC_NOT_APPROVABLE = `Chưa thể duyệt yêu cầu này. ${CAN_REJECT}`;

export function notApprovableMessage(lyDoKhongDuyet: string): string {
  return NOT_APPROVABLE.get(lyDoKhongDuyet) ?? GENERIC_NOT_APPROVABLE;
}

// Chỉ là thông tin lúc xem: quyết định thật ở lúc duyệt (máy chủ khoá khung giờ rồi mới kiểm)
const SLOT_MESSAGES: Readonly<Record<SlotState, string>> = {
  ConTrong: 'Khung giờ mong muốn hiện còn trống.',
  DangGiuCho: 'Khung giờ mong muốn đang được giữ chỗ cho người khác.',
  DaDat:
    'Khung giờ mong muốn đã có người đặt. Hãy chọn khung giờ khác hoặc từ chối.',
  HetHan: 'Khung giờ mong muốn đã qua.',
};

export function slotStateMessage(state: SlotState): string {
  return SLOT_MESSAGES[state];
}
