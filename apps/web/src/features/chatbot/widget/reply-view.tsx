import { Link } from 'react-router';
import { PATIENT_APPOINTMENTS_PATH } from '../../../shared/routes/booking-paths';
import { PATIENT_CHAT_PATH } from '../../../shared/routes/chat-paths';
import { PATIENT_WALLET_PATH } from '../../../shared/routes/wallet-paths';
import type { ChatbotReply, Doan, LienKetMa } from '../api/chatbot-types';
import { normalizeDoan } from '../state/doan-text';
import { SuggestionCard } from '../suggest/suggestion-card';
import { CHATBOT_TEXT } from './chatbot-text';
import { DOCTOR_LOOKUP_PATH, entityPath } from './entity-paths';

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

function LinkAction({ code }: { code: Exclude<LienKetMa, 'GoiCapCuu'> }) {
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
      // Trang Tin nhắn của Bệnh nhân (chat F1). Chỉ liên kết tới đường dẫn gốc, không mang tham số bắt đầu trò chuyện. Khách bấm thì
      // `RequireAuth` đưa tới đăng nhập (như "Lịch hẹn của tôi"); sau đăng nhập chỉ đường dẫn `/dat-lich/**` được quay lại.
      return (
        <Link to={PATIENT_CHAT_PATH} className={PILL_CLASS}>
          {CHATBOT_TEXT.linkMessages}
        </Link>
      );
  }
}

function ReplyLinks({ reply }: { reply: ChatbotReply }) {
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
        <LinkAction key={code} code={code} />
      ))}
    </div>
  );
}

// Thẻ gợi ý hiện ở `GoiY`, và ở `KhongKhopDuLieu` khi máy chủ giữ lại chuyên khoa đã lọc (chatbot B3, PLAN 5.4 bước 13: câu trả lời bị đối
// chiếu loại nhưng chuyên khoa mô hình gợi ý vẫn hợp lệ). Mọi loại khác không có thẻ, dù máy chủ có gửi `chuyenKhoaGoiY` (ví dụ `KhanCap`).
function hasSuggestionCard(reply: ChatbotReply): boolean {
  if (reply.ketQua === 'GoiY') return true;
  return reply.ketQua === 'KhongKhopDuLieu' && reply.chuyenKhoaGoiY.length > 0;
}

export function ReplyView({ reply }: { reply: ChatbotReply }) {
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
      {/* Gợi ý đặt lịch (chatbot F2): thẻ chọn chuyên khoa, ngày, ca và ô giờ. A4 (`KhongCoChuyenKhoa`) chỉ có chữ và liên kết tra cứu */}
      {hasSuggestionCard(reply) && (
        <SuggestionCard suggestions={reply.chuyenKhoaGoiY} />
      )}
      <ReplyLinks reply={reply} />
    </div>
  );
}
