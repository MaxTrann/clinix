import type { ExamDetailNote, ExamDoctor } from '../api/patient-exam-types';
import { doctorName } from './patient-exam-labels';
import { formatReturnDate, formatUpdatedLine } from './patient-exam-format';
import { PATIENT_TEXT } from './patient-exam-text';

// Một khối của hồ sơ (Figma `443:609`): nhãn chữ HOA nhỏ (CSS `uppercase`, văn bản gốc "Triệu chứng") và giá trị. Giá trị là CHỮ do React vẽ (không `dangerouslySetInnerHTML`): `whitespace-pre-wrap` giữ xuống dòng người dùng gõ,
// `wrap-anywhere` cho chuỗi dài không dấu cách bẻ dòng. Trống (rỗng hay chỉ khoảng trắng, cột `text` của DB là NULL: XHS-14) ⇒ "Chưa ghi". Nhãn `gray-500` (4,84:1) thay `#99a1af` của Figma (2,6:1, ADR 0004).
function Field({ label, value }: { label: string; value: string }) {
  const blank = value.trim() === '';
  return (
    <div className="border-b border-gray-100 px-4 py-3 last:border-b-0">
      <dt className="text-[11px] leading-[16.5px] font-semibold tracking-[0.275px] text-gray-500 uppercase">
        {label}
      </dt>
      <dd
        className={`pt-1 text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap ${blank ? 'text-gray-500' : 'text-gray-900'}`}
      >
        {blank ? PATIENT_TEXT.content.blank : value}
      </dd>
    </div>
  );
}

// "Cập nhật lần cuối: 17:30 10/6/26 · bởi ThS.BS Nguyễn Minh Anh" (Figma `443:636`). `capNhatBoi` là họ tên bác sĩ của lịch (SUY RA, không lưu: `TECH_DEBT` 159): chỉ gắn chức danh khi đúng là họ tên của bác sĩ đang hiện, còn lại in nguyên.
// Giờ không đọc được ⇒ bỏ cả dòng; thiếu `capNhatBoi` ⇒ bỏ phần "· bởi …".
function updatedLine(note: ExamDetailNote, doctor: ExamDoctor): string | null {
  const when = formatUpdatedLine(note.capNhatLanCuoi);
  if (when === null) return null;
  const head = `${PATIENT_TEXT.content.updatedPrefix}: ${when}`;
  if (note.capNhatBoi === '') return head;
  const who =
    note.capNhatBoi === doctor.hoTen
      ? doctorName(doctor.chucDanh, note.capNhatBoi)
      : note.capNhatBoi;
  return `${head} · ${PATIENT_TEXT.content.updatedBy} ${who}`;
}

// Bốn khối của hồ sơ trong khung bo và dòng cập nhật phía dưới. Ngày tái khám `null` (hay không phải ngày có thật) ⇒ không có khối đó.
export function RecordFields({
  note,
  doctor,
}: {
  note: ExamDetailNote;
  doctor: ExamDoctor;
}) {
  const returnDate =
    note.ngayTaiKhamDuKien === null
      ? null
      : formatReturnDate(note.ngayTaiKhamDuKien);
  const updated = updatedLine(note, doctor);
  return (
    <>
      <dl className="overflow-hidden rounded-[13.375px] border border-gray-200">
        <Field label={PATIENT_TEXT.content.symptoms} value={note.trieuChung} />
        <Field
          label={PATIENT_TEXT.content.diagnosis}
          value={note.chanDoanSoBo}
        />
        <Field label={PATIENT_TEXT.content.advice} value={note.huongXuLy} />
        {returnDate !== null && (
          <Field label={PATIENT_TEXT.content.returnDate} value={returnDate} />
        )}
      </dl>
      {updated !== null && (
        <p className="pt-2.5 text-xs wrap-anywhere text-gray-500">{updated}</p>
      )}
    </>
  );
}
