import { Calendar, MapPin, Stethoscope, User } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import type { ExamDetail } from '../api/patient-exam-types';
import { CompletedChip } from './record-badges';
import { doctorName, relationLabel } from './patient-exam-labels';
import { formatVisitDate, formatVisitTime } from './patient-exam-format';
import { PATIENT_TEXT } from './patient-exam-text';

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

// Một ô thông tin của lưới 2 × 2 (Figma `443:533`): biểu tượng trong vòng tròn `brand-soft`, nhãn xám, giá trị đậm, dòng phụ tuỳ chọn. Giá trị là CHỮ do React vẽ; `wrap-anywhere` cho chuỗi dài không dấu cách (đo Chromium 375 px).
function Fact({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: IconType;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex min-w-0 gap-2.5">
      <div className="pt-0.5">
        <div className="flex size-7 items-center justify-center rounded-full bg-brand-soft">
          <Icon aria-hidden="true" className="size-3.5 text-brand-strong" />
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <p className="pt-0.5 text-sm font-semibold wrap-anywhere text-gray-900">
          {value}
        </p>
        {sub !== undefined && (
          <p className="text-xs wrap-anywhere text-gray-500">{sub}</p>
        )}
      </div>
    </div>
  );
}

// Thẻ đầu của ngăn chi tiết (Figma `443:518`, `415:384`; WXH-04): mã lịch (chữ đơn cách), chip "Hoàn thành", chuyên khoa, rồi Bác sĩ (chức danh, họ tên, chuyên khoa), Ngày khám ("Thứ 4, 10/06/2026" và giờ, GIỜ VIỆT NAM),
// Chi nhánh (theo snapshot của lịch, B5) và Người khám (họ tên và quan hệ hay "Bản thân"). Mọi giá trị lấy từ chi tiết do MÁY CHỦ trả, không từ dòng danh sách.
export function VisitSummaryCard({ detail }: { detail: ExamDetail }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-gray-100 px-2.5 py-1 font-mono text-xs tracking-[0.28px] wrap-anywhere text-gray-600">
          {detail.maLichHen}
        </span>
        <CompletedChip />
      </div>
      <h2 className="pt-4 text-lg leading-[26.25px] font-bold wrap-anywhere text-gray-900">
        {detail.chuyenKhoa}
      </h2>
      <div className="mt-4 grid grid-cols-1 gap-3 border-t border-gray-100 pt-3 sm:grid-cols-2">
        <Fact
          icon={Stethoscope}
          label={PATIENT_TEXT.visit.doctor}
          value={doctorName(detail.bacSi.chucDanh, detail.bacSi.hoTen)}
          sub={detail.chuyenKhoa}
        />
        <Fact
          icon={Calendar}
          label={PATIENT_TEXT.visit.date}
          value={formatVisitDate(detail.thoiGian) ?? ''}
          sub={formatVisitTime(detail.thoiGian) ?? undefined}
        />
        <Fact
          icon={MapPin}
          label={PATIENT_TEXT.visit.branch}
          value={detail.chiNhanh}
        />
        <Fact
          icon={User}
          label={PATIENT_TEXT.visit.examinee}
          value={detail.nguoiKham.hoTen}
          sub={relationLabel(detail.nguoiKham.quanHe)}
        />
      </div>
    </div>
  );
}
