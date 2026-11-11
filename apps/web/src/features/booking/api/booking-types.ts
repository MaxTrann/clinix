// Kiểu dữ liệu của module booking (phần web). F3 chỉ có kết quả của cổng vào; F4 đến F7 thêm kiểu của người thân, `checks`, lịch hẹn.

// `GET /booking/eligibility` (B7; PLAN booking 5.9): HTTP 200 kể cả khi bị khoá, vì đây là KẾT QUẢ của cổng chứ không phải lỗi.
// `lyDo` chỉ có khi `choPhepDatLich = false`. API không trả số lần vắng mặt hay ngưỡng khoá nên giao diện không giữ số nào.
export interface EligibilityResult {
  choPhepDatLich: boolean;
  lyDo?: string;
  soLichHenToiDaMoiHoSo: number;
}
