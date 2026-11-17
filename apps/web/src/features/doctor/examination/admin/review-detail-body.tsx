import type { ReactNode } from 'react';
import type { AdminReviewDetail } from '../api/admin-review-types';
import { RATING_MAX_STARS } from '../api/patient-exam-types';
import { ReviewStars } from './review-stars';
import { ReviewStatusPill } from './review-status-pill';
import { formatSentDate, formatVisitStamp } from './reviews-format';
import { COLUMN_TEXT, DETAIL_TEXT, orNone, REVIEWS_TEXT } from './reviews-text';

// Khoảng cách theo Figma `570:845`…`570:906`: các ô lưới cách nhau 11,25 px; ba khối rộng ("Số sao", "Nội dung", "Lý do ẩn") cách khối trên 15 px (nên thêm 3,75 px phía trên), nhãn cao 15 px; chữ giá trị cách nhãn 1,875 px (riêng "Số sao" 5,625 px; khung chữ tự có `mt` 5,625 px)
function Field({
  label,
  children,
  wide = false,
  valueClass = 'pt-[1.875px]',
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
  valueClass?: string;
}) {
  return (
    <div className={wide ? 'pt-[3.75px] sm:col-span-2' : undefined}>
      <dt
        className={`text-[10px] font-semibold tracking-[1px] text-gray-500 uppercase ${
          wide ? 'leading-[15px]' : 'leading-[14.286px]'
        }`}
      >
        {label}
      </dt>
      <dd
        className={`${valueClass} text-[13.125px] leading-[18.75px] wrap-anywhere text-gray-800`}
      >
        {children}
      </dd>
    </div>
  );
}

// Khung chữ của "Nội dung" và "Lý do ẩn" (Figma `570:909`): nền xám nhạt, viền, bo; chữ thuần do React vẽ (không HTML thô), `whitespace-pre-wrap` giữ xuống dòng, `wrap-anywhere` bẻ chuỗi dài không dấu cách.
function TextBox({ children }: { children: ReactNode }) {
  return (
    <p className="mt-[5.625px] rounded-[13.375px] border border-gray-100 bg-gray-50 px-[15px] py-[11.25px] text-[13.125px] leading-[21.328px] wrap-anywhere whitespace-pre-wrap text-gray-700">
      {children}
    </p>
  );
}

// Thân hộp "Chi tiết đánh giá" (Figma `570:845`…`570:906`): MỌI trường lấy từ MỘT phản hồi chi tiết (nguồn sự thật của máy chủ). Dòng "Chi nhánh" chỉ khi Toàn hệ thống (Admin Chi nhánh đã thấy chi nhánh ở tiêu đề trang).
// "Lịch hẹn" là mã lịch THẬT kèm giờ khám theo giờ Việt Nam. "Lý do ẩn" CHỈ khi đánh giá đã ẩn và có lý do (khoá `lyDoAn` vắng khi chưa ẩn); Figma chưa có frame cho dòng này.
export function ReviewDetailBody({
  detail,
  showBranch,
}: {
  detail: AdminReviewDetail;
  showBranch: boolean;
}) {
  return (
    <dl className="grid grid-cols-1 gap-x-[11.25px] gap-y-[11.25px] sm:grid-cols-2">
      <Field label={COLUMN_TEXT.doctor}>
        <span className="font-medium">{detail.bacSi.hoTen}</span>
      </Field>
      {showBranch && (
        <Field label={REVIEWS_TEXT.branchLabel}>{detail.chiNhanh.ten}</Field>
      )}
      <Field label={COLUMN_TEXT.patient}>
        {orNone(detail.nguoiDanhGia.hoTen)}
      </Field>
      <Field label={DETAIL_TEXT.appointment}>
        <span className="font-mono text-[11.25px] leading-[15px]">
          {`${detail.maLichHen} · ${formatVisitStamp(detail.thoiGianKham)}`}
        </span>
      </Field>
      <Field label={DETAIL_TEXT.sentDate}>
        {formatSentDate(detail.thoiDiemTao)}
      </Field>
      <Field label={REVIEWS_TEXT.statusLabel}>
        <ReviewStatusPill hidden={detail.biAn} />
      </Field>
      <Field label={DETAIL_TEXT.stars} wide valueClass="pt-[5.625px]">
        <span className="flex items-center gap-[7.5px]">
          <ReviewStars value={detail.soSao} large />
          <span className="text-gray-600">{`(${detail.soSao}/${RATING_MAX_STARS})`}</span>
        </span>
      </Field>
      <Field label={DETAIL_TEXT.comment} wide valueClass="pt-0">
        <TextBox>{orNone(detail.nhanXet)}</TextBox>
      </Field>
      {detail.biAn && detail.lyDoAn !== null && (
        <Field label={DETAIL_TEXT.hiddenReason} wide valueClass="pt-0">
          <TextBox>{detail.lyDoAn}</TextBox>
        </Field>
      )}
    </dl>
  );
}
