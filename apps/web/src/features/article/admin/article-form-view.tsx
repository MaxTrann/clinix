import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { AdminConfirmationDialog } from '../../admin';
import type { ArticleDetail } from '../api/article-types';
import { ARTICLE_ADMIN_PATH } from '../common/article-paths';
import {
  charCount,
  CONTENT_MAX_BYTES,
  CONTENT_MAX_CHARS,
  contentBytes,
  contentLength,
  SUMMARY_MAX,
} from './article-form-rules';
import { StatusField, TextField } from './article-form-fields';
import { ArticlePreview } from './article-preview';
import { BUTTON_PRIMARY_CLASS, BUTTON_SECONDARY_CLASS } from './article-styles';
import {
  ARCHIVE_DIALOG,
  FORM_TEXT,
  formatCounter,
  LEAVE_DIALOG,
} from './article-text';
import { HashtagInput } from './hashtag-input';
import { useArticleForm } from './use-article-form';

// Biểu mẫu tạo (`article` là null) và sửa bài viết (PLAN article 5.11, 2.4.55 b2 đến b5). Chữ và bố cục theo bản Đại duyệt 28/11/2026.
// Thanh Lưu dính đáy khung nhìn: thông báo thành công và lỗi hiện NGAY cạnh nút vừa bấm (bài học admin F5), xếp dọc dưới `sm` để chữ không bị ép ở 375 px.
export function ArticleFormView({
  article,
}: {
  article: ArticleDetail | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const form = useArticleForm(article, formRef);
  const { draft, errors, blocker } = form;
  const [showPreview, setShowPreview] = useState(false);
  const summaryCount = charCount(draft.moTaNgan.trim());
  const contentCount = contentLength(draft.noiDung);

  return (
    <section className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-4">
      <div>
        <Link to={ARTICLE_ADMIN_PATH} className={BUTTON_SECONDARY_CLASS}>
          {FORM_TEXT.back}
        </Link>
      </div>
      <h1 className="text-xl font-semibold text-gray-900">
        {article === null ? FORM_TEXT.createTitle : FORM_TEXT.editTitle}
      </h1>

      <form
        ref={formRef}
        noValidate
        className="flex min-w-0 flex-col gap-4"
        onSubmit={(event) => void form.submit(event)}
      >
        <TextField
          label={FORM_TEXT.titleLabel}
          value={draft.tieuDe}
          error={errors.tieuDe}
          disabled={form.saving}
          required
          onChange={(value) => form.setField('tieuDe', value)}
        />
        <TextField
          label={FORM_TEXT.summaryLabel}
          value={draft.moTaNgan}
          error={errors.moTaNgan}
          disabled={form.saving}
          rows={3}
          counter={formatCounter(summaryCount, SUMMARY_MAX)}
          counterOver={summaryCount > SUMMARY_MAX}
          onChange={(value) => form.setField('moTaNgan', value)}
        />
        <TextField
          label={FORM_TEXT.contentLabel}
          value={draft.noiDung}
          error={errors.noiDung}
          disabled={form.saving}
          rows={14}
          hint={FORM_TEXT.contentHint}
          counter={formatCounter(contentCount, CONTENT_MAX_CHARS)}
          counterOver={
            contentCount > CONTENT_MAX_CHARS ||
            contentBytes(draft.noiDung) > CONTENT_MAX_BYTES
          }
          onChange={(value) => form.setField('noiDung', value)}
        />
        <HashtagInput
          value={draft.hashtag}
          error={errors.hashtag}
          disabled={form.saving}
          onChange={(tags) => form.setField('hashtag', tags)}
        />
        <StatusField
          value={draft.trangThai}
          allowArchived={article !== null}
          error={errors.trangThai}
          disabled={form.saving}
          onChange={(status) => form.setField('trangThai', status)}
        />

        {showPreview && <ArticlePreview draft={draft} />}

        <div className="sticky bottom-0 z-10 flex flex-col gap-2 border-t border-gray-200 bg-white/95 py-3 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="min-w-0 text-sm sm:flex-1">
            <div role="status">
              {form.notice !== null ? (
                <p
                  className={
                    form.notice.kind === 'saved'
                      ? 'font-medium text-success'
                      : 'text-gray-700'
                  }
                >
                  {form.notice.text}
                </p>
              ) : (
                <p className="text-gray-600">
                  {form.dirty ? FORM_TEXT.dirty : FORM_TEXT.idle}
                </p>
              )}
            </div>
            {form.banner !== null && (
              <p role="alert" className="font-medium text-danger-strong">
                {form.banner}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-3 sm:justify-end">
            <button
              type="button"
              aria-expanded={showPreview}
              className={BUTTON_SECONDARY_CLASS}
              onClick={() => setShowPreview((open) => !open)}
            >
              {showPreview ? FORM_TEXT.hidePreview : FORM_TEXT.preview}
            </button>
            <button
              type="submit"
              disabled={form.saving}
              className={BUTTON_PRIMARY_CLASS}
            >
              {form.saving ? FORM_TEXT.saving : FORM_TEXT.save}
            </button>
          </div>
        </div>
      </form>

      <AdminConfirmationDialog
        open={form.archiveOpen}
        title={ARCHIVE_DIALOG.title}
        message={ARCHIVE_DIALOG.message}
        confirmLabel={ARCHIVE_DIALOG.confirm}
        cancelLabel={ARCHIVE_DIALOG.cancel}
        tone="warning"
        pending={form.saving}
        onConfirm={() => void form.confirmArchive()}
        onCancel={form.cancelArchive}
      />
      <AdminConfirmationDialog
        open={blocker.state === 'blocked'}
        title={LEAVE_DIALOG.title}
        message={LEAVE_DIALOG.message}
        confirmLabel={LEAVE_DIALOG.confirm}
        cancelLabel={LEAVE_DIALOG.cancel}
        tone="warning"
        onConfirm={() => {
          if (blocker.state === 'blocked') blocker.proceed();
        }}
        onCancel={() => {
          if (blocker.state === 'blocked') blocker.reset();
        }}
      />
    </section>
  );
}
