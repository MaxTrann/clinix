import type { AdminReviewItem } from '../api/admin-review-types';
import { ReviewStars } from './review-stars';
import { formatSentDate } from './reviews-format';
import { HIDE_TEXT, orNone } from './reviews-text';

// Khung tóm tắt đánh giá ở đầu hộp "Ẩn đánh giá" (doctor-exam F8; Figma `571:850`): nền xám nhạt, tên bác sĩ, hàng sao 12 px kèm "· <người đặt> · <ngày gửi>" và nhận xét MỘT dòng cắt (`truncate`). Tên người đặt rỗng ⇒ bỏ cụm tên (không in dấu gạch ngang);
// nhận xét rỗng ⇒ "—" như ở bảng. Chữ thuần do React vẽ (không HTML thô, không liên kết hoá: WKD-27). `wrap-anywhere` cho tên dài không dấu cách bẻ dòng.
export function HideSummary({ item }: { item: AdminReviewItem }) {
  const author = item.nguoiDanhGia.hoTen.trim();
  const sent = formatSentDate(item.thoiDiemTao);
  return (
    <div className="rounded-[13.375px] border border-gray-100 bg-gray-50 px-[15px] py-[11.25px]">
      <p className="text-[13.125px] leading-[18.75px] font-medium wrap-anywhere text-gray-800">
        {item.bacSi.hoTen}
      </p>
      <div className="flex items-center gap-[7.5px] pt-[3.75px]">
        <ReviewStars value={item.soSao} small />
        <span className="min-w-0 text-[11.25px] leading-[15px] wrap-anywhere text-gray-500">
          {author === '' ? `· ${sent}` : `· ${author} · ${sent}`}
        </span>
      </div>
      <p className="truncate pt-[3.75px] text-[11.25px] leading-[15px] text-gray-600">
        {orNone(item.nhanXet)}
      </p>
    </div>
  );
}

// Khung cảnh báo (Figma `571:871`): nền amber nhạt; ẩn là MỘT CHIỀU nên câu này phải đọc được trước khi bấm `Xác nhận ẩn`
export function HideWarning() {
  return (
    <p className="rounded-[13.375px] border border-amber-100 bg-amber-50 px-[15px] py-[11.25px] text-[13.125px] leading-[18.75px] text-gray-600">
      {HIDE_TEXT.warning}
    </p>
  );
}
