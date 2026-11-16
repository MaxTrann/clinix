import {
  formatReturnDate,
  formatUpdatedAt,
  RECORD_TEXT,
} from '../exam-record-text';
import type { ExamRecordNote } from '../exam-record-form';

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

// Bốn khối của hồ sơ và dòng "Cập nhật lúc …" (Figma `462:2`), dùng cho thẻ `Hồ sơ khám bệnh` (F2) và khối "Bản mới nhất" của hộp ghi (F3). Ngày tái khám `null` ⇒ không có khối; chuỗi không phải ngày ⇒ bỏ dòng.
export function RecordBody({ note }: { note: ExamRecordNote }) {
  const returnDate =
    note.ngayTaiKhamDuKien === null
      ? null
      : formatReturnDate(note.ngayTaiKhamDuKien);
  const updatedAt = formatUpdatedAt(note.capNhatLanCuoi);
  return (
    <>
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
    </>
  );
}
