// Định dạng thời điểm của yêu cầu thay đổi chi nhánh (admin B9, B10, B11). HÀM THUẦN. Giờ Việt Nam cố định +07:00 (không có giờ mùa hè).

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** `Date` ⇒ 'YYYY-MM-DD HH:mm:ss' giờ Việt Nam. */
export const formatVN = (date: Date): string =>
  new Date(date.getTime() + VN_OFFSET_MS)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');

/** 'YYYY-MM-DD HH:mm:ss' ⇒ 'HH:mm dd/MM/yyyy' cho câu thông báo. */
export const humanTime = (value: string): string => {
  const [date = '', time = ''] = value.split(' ');
  const [y, m, d] = date.split('-');
  return `${time.slice(0, 5)} ${d}/${m}/${y}`;
};
