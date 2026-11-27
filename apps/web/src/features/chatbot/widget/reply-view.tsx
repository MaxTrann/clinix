import { Link } from 'react-router';
import { useRemote } from '../../../shared/hooks/use-remote';
import { PATIENT_APPOINTMENTS_PATH } from '../../../shared/routes/booking-paths';
import { PATIENT_WALLET_PATH } from '../../../shared/routes/wallet-paths';
import type { ChatbotApi } from '../api/chatbot-api';
import type { ChatbotReply, Doan, LienKetMa } from '../api/chatbot-types';
import { normalizeDoan } from '../state/doan-text';
import { CHATBOT_TEXT } from './chatbot-text';
import { DOCTOR_LOOKUP_PATH, entityPath, telHref } from './entity-paths';

// Cặp màu đã đo ở ADR 0004: `brand-strong` trên trắng 5,28:1, trên nền xám nhạt 4,8:1, trên `danger-soft` 4,83:1.
const PILL_CLASS =
  'inline-flex min-h-9 items-center rounded-xl border border-gray-200 bg-white px-3 py-1 text-sm font-medium text-brand-strong hover:bg-gray-50';
const EMERGENCY_CALL_CLASS =
  'inline-flex min-h-11 items-center rounded-xl bg-danger-strong px-5 text-sm font-semibold text-white hover:bg-red-800';

// Chữ trả lời là văn bản thường: React tự thoát ký tự, KHÔNG HTML, KHÔNG markdown. Chỉ TÊN thực thể là liên kết (đường dẫn do web dựng
// từ `doiTuong` và `id`); giá, địa chỉ, giờ… là `chu` thường.
function DoanPart({ part }: { part: Doan }) {
  if (part.kieu === 'chu') return <>{part.chu}</>;
  const path = entityPath(part.doiTuong, part.id);
  if (path === null) return <span className="font-medium">{part.chu}</span>;
  return (
    <Link to={path} className="font-medium text-brand-strong underline">
      {part.chu}
    </Link>
  );
}

// Đường dây nóng chỉ được hỏi khi thật sự cần (chưa có trang Tin nhắn), không lưu lại giữa các lần
function ClinicHotline({ api }: { api: ChatbotApi }) {
  const { state } = useRemote((signal) => api.clinicHotline(signal), []);
  if (state.status !== 'ready' || state.data === null) return null;
  const label = `${CHATBOT_TEXT.clinicCall}: ${state.data}`;
  const href = telHref(state.data);
  if (href === null)
    return <span className="text-sm font-medium">{label}</span>;
  return (
    <a href={href} className={PILL_CLASS}>
      {label}
    </a>
  );
}

function LinkAction({
  code,
  api,
  messagesPath,
}: {
  code: Exclude<LienKetMa, 'GoiCapCuu'>;
  api: ChatbotApi;
  messagesPath: string | null;
}) {
  switch (code) {
    case 'LichHenCuaToi':
      return (
        <Link to={PATIENT_APPOINTMENTS_PATH} className={PILL_CLASS}>
          {CHATBOT_TEXT.linkAppointments}
        </Link>
      );
    case 'ViCuaToi':
      return (
        <Link to={PATIENT_WALLET_PATH} className={PILL_CLASS}>
          {CHATBOT_TEXT.linkWallet}
        </Link>
      );
    case 'TraCuuBacSi':
      return (
        <Link to={DOCTOR_LOOKUP_PATH} className={PILL_CLASS}>
          {CHATBOT_TEXT.linkDoctors}
        </Link>
      );
    case 'NhanTinLeTan':
      // `[CHỜ chat]`: chưa có trang Tin nhắn thì hiện đường dây nóng của phòng khám thay cho liên kết
      return messagesPath === null ? (
        <ClinicHotline api={api} />
      ) : (
        <Link to={messagesPath} className={PILL_CLASS}>
          {CHATBOT_TEXT.linkMessages}
        </Link>
      );
  }
}

function ReplyLinks({
  reply,
  api,
  messagesPath,
}: {
  reply: ChatbotReply;
  api: ChatbotApi;
  messagesPath: string | null;
}) {
  // `KhanCap` luôn có nút gọi 115, kể cả khi máy chủ quên gửi mã `GoiCapCuu`
  const showCall =
    reply.ketQua === 'KhanCap' || reply.lienKet.includes('GoiCapCuu');
  // Mã trùng chỉ hiện một lần (parseReply đã loại, đây là lớp phòng thủ cho lớp API khác)
  const others = [...new Set(reply.lienKet)].filter(
    (code): code is Exclude<LienKetMa, 'GoiCapCuu'> => code !== 'GoiCapCuu',
  );
  if (!showCall && others.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {showCall && (
        <a href="tel:115" className={EMERGENCY_CALL_CLASS}>
          {CHATBOT_TEXT.call115}
        </a>
      )}
      {others.map((code) => (
        <LinkAction
          key={code}
          code={code}
          api={api}
          messagesPath={messagesPath}
        />
      ))}
    </div>
  );
}

export function ReplyView({
  reply,
  api,
  messagesPath,
}: {
  reply: ChatbotReply;
  api: ChatbotApi;
  messagesPath: string | null;
}) {
  const emergency = reply.ketQua === 'KhanCap';
  return (
    <div
      data-ket-qua={reply.ketQua}
      className={
        emergency
          ? 'rounded-2xl border border-danger-line bg-danger-soft px-3 py-2 text-danger-strong'
          : 'rounded-2xl bg-gray-100 px-3 py-2 text-gray-900'
      }
    >
      <span className="sr-only">{CHATBOT_TEXT.srAssistant}</span>
      {/* `pre-line` giữ xuống dòng của `chu` (K1); `break-words` để tên dài không làm tràn ngang ở 375 px */}
      <p className="text-sm break-words whitespace-pre-line">
        {normalizeDoan(reply.doan).map((part, index) => (
          <DoanPart key={index} part={part} />
        ))}
      </p>
      <ReplyLinks reply={reply} api={api} messagesPath={messagesPath} />
    </div>
  );
}
