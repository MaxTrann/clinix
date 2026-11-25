import { Calendar, CalendarDays, ClipboardList, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  formatVietnamDate,
  formatVietnamTime,
  formatVietnamWeekdayDate,
} from '../appointment-format';
import { DetailCard, DetailFact, DetailFacts } from '../detail-card';
import { StatusChip } from '../status-chip';
import { RequestStatusChip } from './request-status-chip';
import { notApprovableMessage, slotStateMessage } from './request-states';
import { REQUEST_TEXT, selfChangesLabel } from './request-text';
import type { RequestDetail } from './request-types';

// Các thẻ của trang chi tiết một yêu cầu đổi lịch (reschedule F4; PLAN reschedule 5.7, 5.12; khung `DetailColumns` của `common/`). Mọi giá trị lấy từ MỘT nguồn là chi tiết (B8, 19 khoá), ngày giờ theo GIỜ
// VIỆT NAM. Lý do của Bệnh nhân và ghi chú xử lý là chữ tự do: hiển thị dạng CHỮ THUẦN (React tự thoát; KHÔNG `dangerouslySetInnerHTML`), `whitespace-pre-line` để giữ xuống dòng.
// Web KHÔNG tự suy `coTheDuyet` (lịch `DaXacNhan` vẫn có thể không duyệt được vì quá giờ, R6): chỉ dùng cờ và mã của máy chủ.

const dateTime = (iso: string) =>
  `${formatVietnamWeekdayDate(iso)}, ${formatVietnamTime(iso)}`;

// Thẻ đầu: mã lịch, trạng thái yêu cầu và người khám
export function RequestSummary({ detail }: { detail: RequestDetail }) {
  return (
    <section
      aria-label={REQUEST_TEXT.summary}
      className="rounded-2xl border border-gray-200 bg-white p-6"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-gray-100 px-2.5 py-1 font-mono text-xs tracking-wide text-gray-700">
          {detail.maLichHen}
        </span>
        <RequestStatusChip status={detail.trangThai} />
      </div>
      <h2 className="pt-3 text-2xl font-bold break-words text-gray-900">
        {detail.nguoiKham.hoTen}
      </h2>
      <p className="text-sm text-gray-600">
        {detail.nguoiKham.laNguoiThan
          ? REQUEST_TEXT.relativePerson
          : REQUEST_TEXT.ownPerson}
      </p>
    </section>
  );
}

export function OriginalAppointmentCard({ detail }: { detail: RequestDetail }) {
  const { rows } = REQUEST_TEXT;
  return (
    <DetailCard icon={Calendar} title={REQUEST_TEXT.sections.appointment}>
      <DetailFacts>
        <DetailFact label={rows.person}>{detail.nguoiKham.hoTen}</DetailFact>
        <DetailFact label={rows.doctor}>{detail.bacSi.hoTen}</DetailFact>
        <DetailFact label={rows.branch}>{detail.chiNhanh.ten}</DetailFact>
        <DetailFact label={rows.time}>{dateTime(detail.thoiGianCu)}</DetailFact>
        <DetailFact label={rows.appointmentStatus}>
          <StatusChip status={detail.trangThaiLichGoc} />
        </DetailFact>
      </DetailFacts>
    </DetailCard>
  );
}

export function PatientRequestCard({ detail }: { detail: RequestDetail }) {
  const { rows } = REQUEST_TEXT;
  return (
    <DetailCard icon={ClipboardList} title={REQUEST_TEXT.sections.request}>
      <DetailFacts>
        <DetailFact label={rows.sent}>
          {`${formatVietnamDate(detail.thoiDiemTao)} ${formatVietnamTime(detail.thoiDiemTao)}`}
        </DetailFact>
        <DetailFact label={rows.selfChanges}>
          {selfChangesLabel(detail.soLanDaTuDoi, detail.soLanToiDa)}
        </DetailFact>
        <DetailFact label={rows.reason} wide>
          <span className="whitespace-pre-line">{detail.lyDoYeuCau}</span>
        </DetailFact>
      </DetailFacts>
    </DetailCard>
  );
}

export function DesiredSlotCard({ detail }: { detail: RequestDetail }) {
  return (
    <DetailCard icon={CalendarDays} title={REQUEST_TEXT.sections.desired}>
      <div className="px-5 py-4">
        <p className="text-sm font-semibold text-gray-900">
          {dateTime(detail.thoiGianMongMuon)}
        </p>
        <p className="pt-1 text-sm text-gray-600">
          {slotStateMessage(detail.khungGioMongMuon.trangThai)}
        </p>
      </div>
    </DetailCard>
  );
}

// Thẻ "Xử lý": còn chờ ⇒ câu theo `lyDoKhongDuyet` (khi không duyệt được) cộng chỗ cắm nút (`actions`, Pha B); đã xử lý ⇒ kết quả, KHÔNG nút nào
export function DecisionCard(props: {
  detail: RequestDetail;
  actions?: ReactNode;
}) {
  const { detail } = props;
  const { rows } = REQUEST_TEXT;
  if (detail.trangThai !== 'ChoDuyet') {
    return (
      <DetailCard icon={Users} title={REQUEST_TEXT.sections.result}>
        <DetailFacts>
          <DetailFact label={REQUEST_TEXT.columns.status}>
            <RequestStatusChip status={detail.trangThai} />
          </DetailFact>
          <DetailFact label={rows.handler}>
            {detail.nguoiXuLy?.hoTen ?? '—'}
          </DetailFact>
          <DetailFact label={rows.handledAt}>
            {detail.thoiDiemXuLy === null
              ? '—'
              : `${formatVietnamDate(detail.thoiDiemXuLy)} ${formatVietnamTime(detail.thoiDiemXuLy)}`}
          </DetailFact>
          <DetailFact label={rows.note} wide>
            <span className="whitespace-pre-line">
              {detail.ghiChuXuLy ?? '—'}
            </span>
          </DetailFact>
        </DetailFacts>
      </DetailCard>
    );
  }
  return (
    <DetailCard icon={Users} title={REQUEST_TEXT.sections.decision}>
      <div className="flex flex-col gap-3 px-5 py-4">
        <p className="text-sm text-gray-700">{REQUEST_TEXT.waitingDecision}</p>
        {detail.lyDoKhongDuyet !== null && (
          <p
            role="note"
            className="rounded-xl border border-warning-line bg-warning-soft px-3 py-2 text-sm text-warning"
          >
            {notApprovableMessage(detail.lyDoKhongDuyet)}
          </p>
        )}
        {props.actions}
      </div>
    </DetailCard>
  );
}
