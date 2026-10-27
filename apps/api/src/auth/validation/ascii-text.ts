// Tiện ích văn bản ASCII dùng chung cho chính sách email/SĐT. Không phụ thuộc gì để frontend sao chép được.

// Chỉ cắt khoảng trắng ASCII (dấu cách, tab, xuống dòng…), cố ý KHÔNG dùng String.trim():
// trim() còn cắt cả U+00A0 và các khoảng trắng Unicode, khiến email có ký tự lạ ở đầu/cuối vẫn lọt qua.
export function trimAsciiWhitespace(text: string): string {
  return text.replace(/^[ \t\n\r\f\v]+|[ \t\n\r\f\v]+$/g, '');
}
