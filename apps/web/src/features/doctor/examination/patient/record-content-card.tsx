import { ClipboardList, FileText } from 'lucide-react';
import type { ExamDetailNote, ExamDoctor } from '../api/patient-exam-types';
import { PATIENT_TEXT } from './patient-exam-text';
import { RecordFields } from './record-fields';

// Hộp "chưa có hồ sơ" (Figma `415:473`; Q6, WXH-05): nền `gray-50`, biểu tượng, tiêu đề và câu giải thích. KHÔNG bốn khối và KHÔNG nội dung giả. Chữ giải thích `gray-500` thay `#99a1af` (ADR 0004).
function RecordMissing() {
  return (
    <div className="rounded-[13.375px] border border-gray-100 bg-gray-50 px-5 py-6 text-center">
      <ClipboardList
        aria-hidden="true"
        className="mx-auto size-8 text-gray-300"
      />
      <p className="pt-2 text-sm font-medium text-gray-600">
        {PATIENT_TEXT.missing.title}
      </p>
      <p className="mx-auto max-w-[360px] pt-2 text-xs leading-relaxed text-gray-500">
        {PATIENT_TEXT.missing.hint}
      </p>
    </div>
  );
}

// Thẻ "Nội dung hồ sơ khám" (Figma `443:594`, `415:460`; WXH-04, WXH-05): đầu thẻ có biểu tượng và tiêu đề, thân là bốn khối khi có hồ sơ, hoặc hộp "Chưa có hồ sơ khám" khi `hoSoKham` là `null`.
export function RecordContentCard({
  note,
  doctor,
}: {
  note: ExamDetailNote | null;
  doctor: ExamDoctor;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <div className="flex items-center gap-2.5 border-b border-gray-100 px-5 py-3.5">
        <FileText aria-hidden="true" className="size-4 text-gray-500" />
        <h2 className="text-sm font-semibold text-gray-900">
          {PATIENT_TEXT.content.title}
        </h2>
      </div>
      <div className="px-5 py-4">
        {note === null ? (
          <RecordMissing />
        ) : (
          <RecordFields note={note} doctor={doctor} />
        )}
      </div>
    </section>
  );
}
