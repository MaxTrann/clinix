import { useEffect, useState } from 'react';
import { useRemote } from '../../../shared/hooks/use-remote';
import { useArticleApi } from '../api/article-api-context';
import { normalizeHashtag } from '../common/hashtag-name';

export const SUGGESTION_DEBOUNCE_MS = 250;

// Bỏ dấu thanh, mũ, móc để so tiền tố gần đúng như collation của MySQL (`đ` và `d` là hai chữ khác nhau, B1 đã đo); chỉ dùng để giữ gợi ý cũ ổn định trong lúc chờ gợi ý mới
const foldAccents = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '');

// Gợi ý thẻ đã có khi gõ (PLAN article 5.6, 2.4.55 b2). Tiền tố là chữ đang gõ đã chuẩn hoá; chỉ gọi máy chủ sau khi ngừng gõ 250 ms; yêu cầu cũ bị huỷ.
// Lỗi hay chưa có gợi ý thì trả danh sách rỗng: gợi ý hỏng KHÔNG được chặn việc nhập thẻ. Trong lúc tải gợi ý mới vẫn giữ gợi ý trước (lọc theo tiền tố hiện tại) để danh sách không nhấp nháy.
export function useHashtagSuggestions(text: string, exclude: string[]) {
  const api = useArticleApi();
  const normalized = normalizeHashtag(text);
  const prefix = normalized.ok ? normalized.name : '';

  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebounced(prefix),
      SUGGESTION_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [prefix]);

  const { state } = useRemote(
    (signal) =>
      debounced === ''
        ? Promise.resolve<string[]>([])
        : api.suggestTags(debounced, signal),
    [debounced],
  );
  // Gợi ý đã tải gần nhất, kèm tiền tố mà nó trả lời (`debounced` lúc `state` sẵn sàng chính là tiền tố của `state.data`)
  const [last, setLast] = useState<{ prefix: string; names: string[] }>({
    prefix: '',
    names: [],
  });
  if (state.status === 'ready' && state.data !== last.names) {
    setLast({ prefix: debounced, names: state.data });
  }

  if (prefix === '' || state.status === 'error') return { names: [] };
  // Gợi ý của ĐÚNG tiền tố đang gõ thì tin máy chủ: nó khớp theo collation không phân biệt dấu (gõ "tre" ra "trẻ-em"), không lọc lại bằng `startsWith` thường.
  // Mới gõ thêm chữ mà gợi ý mới chưa về thì giữ gợi ý trước, lọc gần đúng bằng chữ bỏ dấu.
  const names =
    last.prefix === prefix
      ? last.names
      : last.names.filter((name) =>
          foldAccents(name).startsWith(foldAccents(prefix)),
        );
  return { names: names.filter((name) => !exclude.includes(name)) };
}
