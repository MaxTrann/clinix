import type { PublicArticleTag } from '../api/article-types';
import { CHIP_OFF, CHIP_ON } from './article-public-styles';
import { PUBLIC_TEXT, tagLabel } from './article-public-text';

// Chip thẻ phổ biến của trang danh sách (PLAN article 5.12): chọn MỘT thẻ, bấm lại thẻ đang chọn để bỏ (`aria-pressed`). `active` là tên thẻ đang lọc ở URL, '' khi không lọc.
// Thẻ đang lọc mà không nằm trong 20 thẻ phổ biến (bấm từ trang chi tiết) hay thẻ phổ biến chưa tải được vẫn hiện thêm MỘT chip đang chọn, để bỏ lọc được.
// Không có thẻ nào để hiện (chưa tải, lỗi, rỗng) ⇒ không vẽ gì: thẻ chỉ là phần phụ, không chặn danh sách.
export function TagChips({
  tags,
  active,
  onSelect,
}: {
  tags: PublicArticleTag[];
  active: string;
  // '' ⇒ bỏ lọc thẻ
  onSelect: (tag: string) => void;
}) {
  const names = tags.map((tag) => tag.ten);
  const shown =
    active !== '' && !names.includes(active) ? [active, ...names] : names;
  if (shown.length === 0) return null;
  return (
    <div
      role="group"
      aria-label={PUBLIC_TEXT.tagGroupLabel}
      className="flex flex-wrap gap-2"
    >
      {shown.map((name) => (
        <button
          key={name}
          type="button"
          aria-pressed={name === active}
          className={name === active ? CHIP_ON : CHIP_OFF}
          onClick={() => onSelect(name === active ? '' : name)}
        >
          {tagLabel(name)}
        </button>
      ))}
    </div>
  );
}
