// Định dạng thời điểm của hộp thu tiền (payment F4): mốc khung giờ tiếp đón (`NGOAI_KHUNG_GIO_TIEP_DON`) và thời điểm trên phiếu thu.
// Ngày giờ theo giờ Việt Nam, không theo múi giờ của máy: "08:15 10/11/2026"
const VIETNAM_DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function formatVietnamDateTime(iso: string): string {
  const parts = Object.fromEntries(
    VIETNAM_DATE_TIME.formatToParts(new Date(iso)).map((p) => [
      p.type,
      p.value,
    ]),
  );
  return `${parts.hour}:${parts.minute} ${parts.day}/${parts.month}/${parts.year}`;
}
