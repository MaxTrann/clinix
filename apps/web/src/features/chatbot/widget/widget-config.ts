// Ngưỡng màn rộng của khung (PLAN 5.14): từ 640 px là hộp không chặn trang, dưới đó chiếm toàn màn hình. Chỉ JS quyết định
// (không dùng `sm:`) để test (`css: false`) kiểm được.
export const WIDE_QUERY = '(min-width: 640px)';

// `[CHỜ chat]`: đường dẫn trang Tin nhắn của Bệnh nhân. Chưa có trang thì `null` và nút "nhắn lễ tân" hiện đường dây nóng của phòng khám
// (PLAN 5.14). Khi scope chat có trang, đổi ĐÚNG chỗ này (PLAN chat dự kiến `/benh-nhan/tin-nhan`).
export const PATIENT_MESSAGES_PATH: string | null = null;
