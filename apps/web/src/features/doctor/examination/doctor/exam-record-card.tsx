import { ClipboardList, FileText } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  formatReturnDate,
  formatUpdatedAt,
  RECORD_TEXT,
  recordView,
} from '../exam-record-text';

// Hồ sơ khám của một lịch hẹn, đúng hình dạng `ghiChuKham` của `GET /doctor/appointments/:maLichHen` (B3; nguồn `ExamRecordView` của B2). Kiểu định nghĩa Ở ĐÂY, không import kiểu của booking (Q20 phương án C):
// booking truyền đối tượng cùng hình dạng. `ngayTaiKhamDuKien` là `YYYY-MM-DD` hoặc `null`; `capNhatLanCuoi` là ISO 8601 UTC.
export interface ExamRecordNote {
  trieuChung: string;
  chanDoanSoBo: string;
  huongXuLy: string;
  ngayTaiKhamDuKien: string | null;
  capNhatLanCuoi: string;
}

export interface ExamRecordCardProps {
  // Trạng thái lịch hẹn hiện tại (kiểu `string`: không import kiểu của booking). Chỉ `DaTiepDon` và `HoanThanh` hiện nội dung (Q16)
  trangThai: string;
  ghiChuKham: ExamRecordNote | null;
}

// Một khối nhãn và giá trị (Figma `462:2`: nhãn 11,25 px đậm vừa, giá trị 13,125 px cao dòng 21,33, cách nhau 3,75). Giá trị là CHỮ do React vẽ (không `dangerouslySetInnerHTML`); `whitespace-pre-wrap`
// giữ xuống dòng người dùng gõ, `wrap-anywhere` (`overflow-wrap: anywhere`) cho chuỗi dài không dấu cách bẻ dòng VÀ không làm cột lưới của booking giãn theo (đo Chromium 375 px: `break-words` làm trang rộng 14.363 px).
function Block({ label, children }: { label: string; children: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-600">{label}</dt>
      <dd className="pt-1 text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap text-gray-900">
        {children}
      </dd>
    </div>
  );
}

function Content({ note }: { note: ExamRecordNote }) {
  const returnDate =
    note.ngayTaiKhamDuKien === null
      ? null
      : formatReturnDate(note.ngayTaiKhamDuKien);
  const updatedAt = formatUpdatedAt(note.capNhatLanCuoi);
  return (
    <div className="flex flex-col gap-4 px-5 py-4">
      <dl className="flex flex-col gap-4">
        <Block label={RECORD_TEXT.labels.symptoms}>{note.trieuChung}</Block>
        <Block label={RECORD_TEXT.labels.diagnosis}>{note.chanDoanSoBo}</Block>
        <Block label={RECORD_TEXT.labels.advice}>{note.huongXuLy}</Block>
        {returnDate !== null && (
          <Block label={RECORD_TEXT.labels.returnDate}>{returnDate}</Block>
        )}
      </dl>
      {updatedAt !== null && (
        <p className="border-t border-gray-100 pt-1 text-xs text-gray-600">
          {`${RECORD_TEXT.updatedPrefix} ${updatedAt}`}
        </p>
      )}
    </div>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <h2 className="flex items-center gap-2 border-b border-gray-100 px-5 py-3.5 text-sm font-semibold text-gray-900">
        <FileText aria-hidden="true" className="size-4 text-gray-600" />
        {RECORD_TEXT.title}
      </h2>
      {children}
    </section>
  );
}

// Thẻ "Hồ sơ khám bệnh" ở trang chi tiết ca khám của Bác sĩ (doctor-exam F2; Q6, Q16, Q20 phương án C: booking import CHỈ qua `features/doctor/index.ts`). CHỈ ĐỌC: nút `Ghi hồ sơ khám`, `Chỉnh sửa ghi chú` và dòng phụ
// của trạng thái rỗng ("Có thể ghi hồ sơ trước hoặc sau khi hoàn thành ca.", "Bổ sung hồ sơ để lưu triệu chứng, chẩn đoán và lời khuyên.") là F3. Khung thẻ cùng lớp với `DetailCard` của booking (khung chung F12).
// Figma thiếu frame "Đã tiếp đón ĐÃ có hồ sơ" (L7): dùng bố cục của `462:2`.
export function ExamRecordCard({ trangThai, ghiChuKham }: ExamRecordCardProps) {
  const view = recordView(trangThai, ghiChuKham !== null);
  return (
    <Frame>
      {view.kind === 'content' && ghiChuKham !== null && (
        <Content note={ghiChuKham} />
      )}
      {view.kind === 'empty' && (
        <div className="flex flex-col items-center gap-3 px-5 pt-12 pb-8 text-center">
          <ClipboardList
            aria-hidden="true"
            className="size-10 text-amber-300"
          />
          <p className="text-sm font-medium text-gray-800">{view.text}</p>
        </div>
      )}
      {view.kind === 'note' && (
        <p
          className={`m-5 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700${view.italic ? ' italic' : ''}`}
        >
          {view.text}
        </p>
      )}
    </Frame>
  );
}
