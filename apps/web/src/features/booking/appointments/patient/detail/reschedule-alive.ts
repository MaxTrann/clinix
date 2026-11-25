// Hai trạng thái "còn sống" mà một lịch có thể chưa đổi được (chờ thanh toán, đã xác nhận). Trạng thái kết thúc (đã tiếp đón, hoàn thành, đã huỷ, vắng mặt, đã đổi lịch, mã lạ) thì ẩn nút "Đổi lịch" như nút Hủy
// (Đại chọn 25/11/2026, câu E của reschedule F1) và ẩn banner yêu cầu đổi lịch (reschedule F2: yêu cầu tồn không tự đóng khi lịch bị huỷ, PLAN Q7 (g), nên "Đang chờ duyệt" trên lịch đã huỷ là sai). Quy tắc theo
// trạng thái này chỉ để chọn ẩn hay vô hiệu; QUYỀN đổi vẫn theo cờ của máy chủ.
const STILL_ALIVE: readonly string[] = ['ChoThanhToan', 'DaXacNhan'];

export function isStillAlive(trangThai: string): boolean {
  return STILL_ALIVE.includes(trangThai);
}
