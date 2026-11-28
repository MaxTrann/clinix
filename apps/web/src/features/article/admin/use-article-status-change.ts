import { useRef, useState } from 'react';
import { useArticleApi } from '../api/article-api-context';
import type { ArticleListItem, ArticleStatus } from '../api/article-types';
import { describeStatusFailure } from './article-save-failure';
import { LIST_TEXT } from './article-text';

export interface ListNotice {
  kind: 'success' | 'error';
  text: string;
}

const SUCCESS_TEXT: Record<ArticleStatus, string> = {
  DaXuatBan: LIST_TEXT.published,
  LuuTruAn: LIST_TEXT.archived,
  BanNhap: LIST_TEXT.restored,
};

// Đổi trạng thái ngay ở một dòng của danh sách (PLAN article 5.11, A2): "Xuất bản" và "Khôi phục về Bản nháp" gọi ngay; "Lưu trữ (ẩn bài)" một bài
// ĐANG xuất bản thì mở hộp cảnh báo trước và CHƯA gọi API cho tới khi xác nhận. Một lần chỉ một lời gọi (chốt `useRef` chặn bấm đúp trước khi React vẽ lại nút).
export function useArticleStatusChange(onChanged: () => void) {
  const api = useArticleApi();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ArticleListItem | null>(
    null,
  );
  const [notice, setNotice] = useState<ListNotice | null>(null);
  const inFlight = useRef(false);

  async function change(article: ArticleListItem, next: ArticleStatus) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPendingId(article.baiVietId);
    setNotice(null);
    try {
      await api.update(article.baiVietId, { trangThai: next });
      setNotice({ kind: 'success', text: SUCCESS_TEXT[next] });
      onChanged();
    } catch (error) {
      const failure = describeStatusFailure(error);
      setNotice({ kind: 'error', text: failure.text });
      if (failure.reload) onChanged();
    } finally {
      inFlight.current = false;
      setPendingId(null);
    }
  }

  function request(article: ArticleListItem, next: ArticleStatus) {
    if (article.trangThai === 'DaXuatBan' && next === 'LuuTruAn') {
      setNotice(null);
      setArchiveTarget(article);
      return;
    }
    void change(article, next);
  }

  async function confirmArchive() {
    if (archiveTarget === null) return;
    await change(archiveTarget, 'LuuTruAn');
    setArchiveTarget(null);
  }

  function cancelArchive() {
    if (!inFlight.current) setArchiveTarget(null);
  }

  return {
    pendingId,
    archiveTarget,
    notice,
    request,
    confirmArchive,
    cancelArchive,
  };
}
