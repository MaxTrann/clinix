import { Eye, EyeOff } from 'lucide-react';
import type { AdminReviewItem } from '../api/admin-review-types';
import { HIDE_TEXT, hideLabel, REVIEWS_TEXT, viewLabel } from './reviews-text';

// Cột "Thao tác" của một hàng (doctor-exam F7 `Xem`, F8 `Ẩn`; Figma `514:2`, `514:439`): `Xem` luôn có; `Ẩn` CHỈ ở hàng `Hiển thị` (hàng `Đã ẩn` chỉ có `Xem`: ẩn là MỘT CHIỀU, Q8). Máy chủ vẫn kiểm lại (409 `DANH_GIA_DA_AN`).
// `Ẩn`: viền `border-danger-line`, chữ `text-danger-strong` 11,25 và biểu tượng mắt gạch 13,125 (Figma `#ffc9c9` và `#e7000b`; chữ đỏ `danger-strong` để đạt 4,5:1, ADR 0004). Tên truy cập có tên người đặt và bác sĩ để phân biệt các hàng.
export function ReviewRowActions({
  item,
  onOpen,
  onHide,
}: {
  item: AdminReviewItem;
  onOpen: (danhGiaId: string, opener: HTMLElement) => void;
  onHide: (item: AdminReviewItem, opener: HTMLElement) => void;
}) {
  return (
    <span className="flex items-center gap-[7.5px]">
      <button
        type="button"
        aria-label={viewLabel(item.nguoiDanhGia.hoTen, item.bacSi.hoTen)}
        onClick={(event) => onOpen(item.danhGiaId, event.currentTarget)}
        className="inline-flex items-center gap-[3.75px] rounded-[9.375px] border border-gray-200 bg-white px-[11.25px] py-[5.625px] text-[11.25px] leading-[15px] font-medium text-gray-600 hover:bg-gray-50"
      >
        <Eye aria-hidden="true" className="size-[13.125px]" />
        {REVIEWS_TEXT.view}
      </button>
      {!item.biAn && (
        <button
          type="button"
          aria-label={hideLabel(item.nguoiDanhGia.hoTen, item.bacSi.hoTen)}
          onClick={(event) => onHide(item, event.currentTarget)}
          className="inline-flex items-center gap-[3.75px] rounded-[9.375px] border border-danger-line bg-white px-[11.25px] py-[5.625px] text-[11.25px] leading-[15px] font-medium text-danger-strong hover:bg-danger-soft"
        >
          <EyeOff aria-hidden="true" className="size-[13.125px]" />
          {HIDE_TEXT.hide}
        </button>
      )}
    </span>
  );
}
