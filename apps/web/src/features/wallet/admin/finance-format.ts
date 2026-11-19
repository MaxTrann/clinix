import { formatVietnamDate, formatVietnamTime } from '../patient/wallet-labels';

/** "10:30 16/10/2026" theo giờ Việt Nam (Figma `549:2` cột Thời gian gửi, Xử lý lúc). */
export function formatDateTime(iso: string): string {
  return `${formatVietnamTime(iso)} ${formatVietnamDate(iso)}`;
}
