import { useEffect } from 'react';

// Tiêu đề tab và `meta name="description"` của trang công khai bài viết (PLAN article T15, ABG-09, R9: web là SPA, không SSR nên chỉ đặt ở phía trình duyệt).
// CHỈ danh sách và chi tiết gắn hook này (test quét mã khoá điều đó); nhiều test cấm trang riêng tư đổi tiêu đề. Khôi phục đúng giá trị cũ khi rời trang:
// thẻ meta có sẵn thì trả lại nội dung cũ, thẻ do hook tạo thì gỡ. Giá trị gán bằng `document.title` và thuộc tính (không HTML, 5.5 b).
// `null` ⇒ không đặt gì (trang đang tải, lỗi, 404, đang chuyển hướng).
export interface ArticleMeta {
  title: string;
  description: string;
}

const DESCRIPTION_SELECTOR = 'meta[name="description"]';

export function useArticleMeta(meta: ArticleMeta | null): void {
  const title = meta?.title;
  const description = meta?.description;
  useEffect(() => {
    if (title === undefined || description === undefined) return;
    const previousTitle = document.title;
    document.title = title;

    const existing =
      document.head.querySelector<HTMLMetaElement>(DESCRIPTION_SELECTOR);
    const previousContent = existing?.getAttribute('content') ?? null;
    const element = existing ?? document.createElement('meta');
    if (existing === null) {
      element.setAttribute('name', 'description');
      document.head.appendChild(element);
    }
    element.setAttribute('content', description);

    return () => {
      document.title = previousTitle;
      if (existing === null) {
        element.remove();
      } else if (previousContent === null) {
        existing.removeAttribute('content');
      } else {
        existing.setAttribute('content', previousContent);
      }
    };
  }, [title, description]);
}
