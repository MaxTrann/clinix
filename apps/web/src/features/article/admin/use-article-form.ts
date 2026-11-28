import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from 'react';
import { useBlocker, useLocation, useNavigate } from 'react-router';
import { useFocusFirstInvalid } from '../../admin';
import { useArticleApi } from '../api/article-api-context';
import type { ArticleDetail } from '../api/article-types';
import { articleAdminEditPath } from '../common/article-paths';
import {
  buildCreateBody,
  buildPatch,
  changedKeys,
  draftFromArticle,
  EMPTY_DRAFT,
  validateDraft,
  type ArticleDraft,
  type FieldErrors,
} from './article-form-rules';
import { describeSaveFailure } from './article-save-failure';
import { FORM_TEXT } from './article-text';

export interface FormNotice {
  kind: 'saved' | 'info';
  text: string;
}

// Sau khi TẠO bài, trang chuyển sang `/admin/bai-viet/:id` kèm `state` này để hiện thông báo thành công ở trang mới
const justCreated = (state: unknown) =>
  typeof state === 'object' &&
  state !== null &&
  (state as { created?: unknown }).created === true;

// Trạng thái của biểu mẫu tạo và sửa bài (PLAN article 5.11, A1, A2; sơ đồ ở plan_article_f1.md mục 4.2): bản nháp, lỗi theo ô, thay đổi chưa lưu, lưu, thông báo cạnh nút Lưu.
// `article` là bài đang sửa; null là tạo mới. Bản nháp GIỮ NGUYÊN khi lưu lỗi (4b).
// `formRef` do trang tạo và gắn vào thẻ <form> (không trả `ref` ra từ hook: luật `react-hooks/refs` cấm đọc thuộc tính của đối tượng có chứa ref khi vẽ)
export function useArticleForm(
  article: ArticleDetail | null,
  formRef: RefObject<HTMLFormElement | null>,
) {
  const api = useArticleApi();
  const navigate = useNavigate();
  const location = useLocation();
  const [baseline, setBaseline] = useState<ArticleDraft>(() =>
    article === null ? EMPTY_DRAFT : draftFromArticle(article),
  );
  const [draft, setDraft] = useState<ArticleDraft>(baseline);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [notice, setNotice] = useState<FormNotice | null>(() =>
    justCreated(location.state)
      ? { kind: 'saved', text: FORM_TEXT.saved }
      : null,
  );
  const [saving, setSaving] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  // Tăng khi có ô lỗi: đưa focus vào ô lỗi đầu tiên, không cướp focus lúc đang gõ
  const [focusTick, setFocusTick] = useState(0);
  // Chặn bấm "Lưu" hai lần TRƯỚC khi React kịp vẽ lại nút tắt (hai sự kiện trong cùng một khung hình)
  const inFlight = useRef(false);
  useFocusFirstInvalid(formRef, focusTick);

  const dirty = changedKeys(baseline, draft).length > 0;

  // Rời trang khi còn thay đổi chưa lưu thì hỏi: đổi đường dẫn trong app (useBlocker) và đóng hay tải lại tab (beforeunload)
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Tạo xong thì chuyển sang trang sửa. Làm trong effect SAU khi `baseline` đã bằng bản nháp (hết "thay đổi chưa lưu") nên không bị hộp "Rời khỏi trang?" chặn
  useEffect(() => {
    if (createdId === null) return;
    navigate(articleAdminEditPath(createdId), {
      replace: true,
      state: { created: true },
    });
  }, [createdId, navigate]);

  function setField<K extends keyof ArticleDraft>(
    key: K,
    value: ArticleDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (current[key] === undefined) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setNotice(null);
    setBanner(null);
  }

  async function save() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    try {
      const saved =
        article === null
          ? await api.create(buildCreateBody(draft))
          : await api.update(article.baiVietId, buildPatch(baseline, draft));
      // Bản nháp và mốc so sánh lấy lại từ bản máy chủ đã chuẩn hoá
      const next = draftFromArticle(saved);
      setBaseline(next);
      setDraft(next);
      setErrors({});
      setBanner(null);
      if (article === null) setCreatedId(saved.baiVietId);
      else setNotice({ kind: 'saved', text: FORM_TEXT.saved });
    } catch (error) {
      const failure = describeSaveFailure(error, {
        creating: article === null,
      });
      setErrors(failure.fields);
      setBanner(failure.banner);
      if (Object.keys(failure.fields).length > 0) {
        setFocusTick((count) => count + 1);
      }
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    setNotice(null);
    setBanner(null);
    const found = validateDraft(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setFocusTick((count) => count + 1);
      return;
    }
    if (article !== null && !dirty) {
      setNotice({ kind: 'info', text: FORM_TEXT.noChange });
      return;
    }
    // A2: chuyển bài ĐANG xuất bản sang Lưu trữ phải được xác nhận trước khi gọi API
    if (
      article !== null &&
      baseline.trangThai === 'DaXuatBan' &&
      draft.trangThai === 'LuuTruAn'
    ) {
      setArchiveOpen(true);
      return;
    }
    await save();
  }

  async function confirmArchive() {
    await save();
    setArchiveOpen(false);
  }

  function cancelArchive() {
    if (!saving) setArchiveOpen(false);
  }

  return {
    draft,
    errors,
    banner,
    notice,
    saving,
    dirty,
    blocker,
    archiveOpen,
    setField,
    submit,
    confirmArchive,
    cancelArchive,
  };
}
