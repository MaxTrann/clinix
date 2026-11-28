import { ArticleContent } from '../common/article-content';
import type { ArticleDraft } from './article-form-rules';
import { FORM_TEXT } from './article-text';

// "Xem trước" (PLAN article 5.11, ABW-08): dựng bản nháp hiện tại bằng ĐÚNG component dựng nội dung của trang công khai, nên nội dung độc hại hiện thành chữ.
// Tiêu đề bài ở đây là chữ đậm chứ không phải `h1`: trang quản trị đã có `h1` của nó. Không gọi máy chủ.
export function ArticlePreview({ draft }: { draft: ArticleDraft }) {
  const title = draft.tieuDe.trim();
  const summary = draft.moTaNgan.trim();
  const hasContent = draft.noiDung.trim() !== '';

  return (
    <section
      aria-label={FORM_TEXT.previewLabel}
      className="min-w-0 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
    >
      {title !== '' && (
        <p className="text-xl font-bold break-words text-gray-900 [overflow-wrap:anywhere]">
          {title}
        </p>
      )}
      {summary !== '' && (
        <p className="mt-1 break-words text-gray-600 [overflow-wrap:anywhere]">
          {summary}
        </p>
      )}
      {draft.hashtag.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-2 text-sm text-brand-strong">
          {draft.hashtag.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </p>
      )}
      <div className="mt-3">
        {hasContent ? (
          <ArticleContent text={draft.noiDung} />
        ) : (
          <p className="text-sm text-gray-500">{FORM_TEXT.previewEmpty}</p>
        )}
      </div>
    </section>
  );
}
