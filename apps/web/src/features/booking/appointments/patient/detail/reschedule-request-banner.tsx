import {
  formatVietnamDate,
  formatVietnamTime,
  formatVietnamWeekdayDate,
} from '../../common/appointment-format';
import type { PatientAppointmentDetail } from '../api/patient-appointment-types';
import { RESCHEDULE_TEXT } from '../../common/reschedule-text';
import { isStillAlive } from './reschedule-alive';

const TONE = {
  ChoDuyet: 'border-cyan-200 bg-brand-soft text-cyan-900',
  TuChoi: 'border-danger-line bg-danger-soft text-danger-strong',
  DaDuyet: 'border-cyan-200 bg-brand-soft text-cyan-900',
} as const;

/**
 * Banner trạng thái yêu cầu đổi lịch ngoài chính sách MỚI NHẤT của lịch (reschedule F2; WDH-09, WDH-40; PLAN 5.8, 5.12). Chữ và số lấy NGUYÊN từ máy chủ qua `yeuCauDoiLich`:
 *  - `ChoDuyet` ⇒ "Đang chờ duyệt" kèm khung giờ mong muốn và giờ gửi (giờ Việt Nam), lịch giữ nguyên tới khi có kết quả;
 *  - `TuChoi` ⇒ "Bị từ chối: {ghi chú của người duyệt}". Ghi chú là VĂN BẢN THUẦN của nhân sự (React tự thoát, KHÔNG `dangerouslySetInnerHTML`), giữ xuống dòng và bẻ chữ dài để không vỡ bố cục;
 *  - `DaDuyet` ⇒ vẽ được nhưng gần như không gặp (sau khi duyệt lịch cũ là `DaDoiLich`, mở bằng mã cũ là 404).
 * Ẩn khi lịch đã kết thúc (cùng quy tắc "còn sống" của nút "Đổi lịch"): yêu cầu tồn không tự đóng khi lịch bị huỷ (PLAN Q7 (g)), nên "Đang chờ duyệt" trên lịch đã huỷ là sai.
 */
export function RescheduleRequestBanner({
  detail,
}: {
  detail: PatientAppointmentDetail;
}) {
  const request = detail.yeuCauDoiLich;
  if (request === null || !isStillAlive(detail.trangThai)) return null;

  const wanted = request.thoiGianMongMuon;
  const sent = request.thoiDiemTao;
  return (
    <section
      aria-label={RESCHEDULE_TEXT.bannerTitle}
      className={`rounded-2xl border px-5 py-4 text-sm ${TONE[request.trangThai]}`}
    >
      {request.trangThai === 'ChoDuyet' && (
        <p className="font-semibold">{RESCHEDULE_TEXT.bannerPending}</p>
      )}
      {request.trangThai === 'TuChoi' && (
        <p className="font-semibold break-words whitespace-pre-line">
          {RESCHEDULE_TEXT.bannerRejected}
          {request.ghiChuXuLy === null ? '' : `: ${request.ghiChuXuLy}`}
        </p>
      )}
      {request.trangThai === 'DaDuyet' && (
        <p className="font-semibold">{RESCHEDULE_TEXT.bannerApproved}</p>
      )}
      <p className="mt-1">
        {RESCHEDULE_TEXT.bannerWanted}:{' '}
        <time dateTime={wanted}>
          {formatVietnamTime(wanted)}, {formatVietnamWeekdayDate(wanted)}
        </time>
        . {RESCHEDULE_TEXT.bannerSent}{' '}
        <time dateTime={sent}>
          {formatVietnamTime(sent)} {formatVietnamDate(sent)}
        </time>
        .
      </p>
      {request.trangThai === 'ChoDuyet' && (
        <p className="mt-1">{RESCHEDULE_TEXT.bannerPendingNote}</p>
      )}
      {request.trangThai === 'TuChoi' && (
        <p className="mt-1">{RESCHEDULE_TEXT.bannerRejectedNote}</p>
      )}
    </section>
  );
}
