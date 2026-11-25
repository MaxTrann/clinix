// Chữ của trang đổi lịch hẹn và nút ở chi tiết (reschedule F1, F2). Toàn bộ là [đề xuất], chờ nhóm duyệt (Figma chưa có frame cho đổi lịch: PLAN reschedule 4.4; Q13: Đại sửa chữ khi duyệt PR).
// Câu theo `maLoi` nằm ở `reschedule-errors.ts` (PLAN 5.13), không lặp ở đây.
export const RESCHEDULE_TEXT = {
  // Nút ở chi tiết lịch hẹn (WDH-01)
  changeButton: 'Đổi lịch',
  requestButton: 'Gửi yêu cầu đổi lịch',
  pendingReason: 'Lịch hẹn này đã có yêu cầu đổi lịch đang chờ duyệt.',
  // Trang chọn khung giờ (WDH-02)
  title: 'Đổi lịch hẹn',
  backToDetail: 'Chi tiết lịch hẹn',
  loading: 'Đang tải thông tin đổi lịch...',
  currentTitle: 'Lịch hiện tại',
  visitDate: 'Ngày khám',
  visitTime: 'Giờ khám',
  pickTitle: 'Chọn khung giờ mới',
  pickHint:
    'Chỉ đổi được sang khung giờ còn trống của cùng bác sĩ. Chọn một khung giờ để tiếp tục, lịch hiện tại chưa thay đổi.',
  requestNotice:
    'Bạn đã dùng hết số lần tự đổi. Chọn khung giờ mới, ở bước sau bạn nhập lý do để gửi yêu cầu cho Lễ tân duyệt; lịch hiện tại được giữ nguyên cho tới khi có kết quả.',
  // Hai số lấy NGUYÊN từ máy chủ, không tính toán ở client (dùng khi "còn n lần" không hiện được)
  usedCount: (used: number, max: number) =>
    `Bạn đã tự đổi ${used} trên ${max} lần.`,
  backToDetailLink: 'Quay lại chi tiết lịch hẹn',
  retry: 'Thử lại',
  // Màn xác nhận (reschedule F2; WDH-34, WDH-35)
  confirmTitle: 'Xác nhận đổi lịch',
  pickAnother: 'Chọn khung giờ khác',
  invalidLink: 'Liên kết chọn khung giờ không hợp lệ.',
  appointmentTitle: 'Lịch hẹn',
  doctor: 'Bác sĩ',
  specialty: 'Chuyên khoa',
  branch: 'Chi nhánh',
  person: 'Người khám',
  newTitle: 'Lịch mới',
  // `n` là số lần còn lại do MÁY CHỦ báo (`soLanToiDa` trừ `soLanDaDoi`), chỉ để hiện; còn được tự đổi hay không do `loai` của máy chủ quyết
  remaining: (n: number) =>
    `Bạn còn ${n} lần tự đổi cho lịch hẹn này. Lần đổi này sẽ dùng 1 lần.`,
  requestConfirmNotice:
    'Yêu cầu sẽ chuyển cho Lễ tân duyệt; lịch hẹn giữ nguyên tới khi có kết quả.',
  confirmButton: 'Xác nhận đổi lịch',
  sending: 'Đang gửi…',
  slotNotUsable:
    'Khung giờ này không dùng được để đổi lịch. Vui lòng chọn khung giờ khác.',
  // Ô lý do (WDH-04). Chữ giới hạn lấy từ tham số để F3 (1 đến 255) dùng lại cùng thành phần.
  reasonLabel: 'Lý do đổi lịch',
  reasonHint: 'Lễ tân sẽ đọc lý do này khi xem xét yêu cầu.',
  reasonCount: (length: number, max: number) => `${length}/${max} ký tự`,
  reasonRange: (min: number, max: number) =>
    `Lý do phải từ ${min} đến ${max} ký tự.`,
  reasonControl:
    'Lý do có ký tự không được phép (ví dụ phím Tab). Vui lòng xoá ký tự đó.',
  // POST không biết kết quả khi mất mạng hay quá giờ: máy chủ có thể đã ghi (nếp hộp huỷ). Gửi lại vẫn an toàn: lần hai ra 404 hay 409, không bao giờ đổi hai lần.
  uncertain:
    'Mất kết nối khi đang gửi, chưa rõ lịch hẹn đã được đổi hay chưa. Hãy kiểm tra trong Lịch hẹn của tôi trước khi gửi lại.',
  afterUncertainHint:
    'Có thể lịch hẹn đã được đổi hoặc yêu cầu đã được gửi ở lần trước. Hãy xem Lịch hẹn của tôi.',
  myAppointments: 'Lịch hẹn của tôi',
  // Thông báo một lần sau khi gửi (WDH-05, WDH-41)
  doneNotice: 'Đã đổi lịch hẹn thành công. Đây là lịch hẹn mới của bạn.',
  requestSentNotice:
    'Đã gửi yêu cầu đổi lịch. Lịch hẹn giữ nguyên khung giờ cũ cho tới khi Lễ tân xử lý.',
  // Banner `yeuCauDoiLich` ở chi tiết lịch (WDH-09, WDH-40)
  bannerTitle: 'Yêu cầu đổi lịch',
  bannerPending: 'Đang chờ duyệt',
  bannerPendingNote:
    'Lịch hẹn giữ nguyên khung giờ hiện tại cho tới khi Lễ tân xử lý.',
  bannerRejected: 'Bị từ chối',
  bannerRejectedNote: 'Lịch hẹn của bạn vẫn giữ nguyên khung giờ cũ.',
  bannerApproved: 'Yêu cầu đổi lịch đã được duyệt.',
  bannerWanted: 'Khung giờ mong muốn',
  bannerSent: 'Đã gửi lúc',
  // Dòng thêm ở trang chi tiết khi 404 (WDH-42): lịch cũ sau khi đổi là 404 cùng thân với mọi lý do khác
  replacedHint: 'Lịch hẹn này không còn hoặc đã được đổi sang lịch mới.',
} as const;
