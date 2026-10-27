/** Ký tự escape dành cho mệnh đề SQL LIKE ... ESCAPE '!'. */
export const LIKE_ESCAPE_CHARACTER = '!';

/**
 * Escape ký tự đặc biệt của mẫu LIKE. Giá trị trả về vẫn phải truyền bằng
 * query parameter; khi dùng trong MySQL cần ghi `ESCAPE '!'` ở mệnh đề LIKE.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[!%_]/g, '!$&');
}
