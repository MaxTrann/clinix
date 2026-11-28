import { useRef, useState } from 'react';
import { RequestAbortedError } from '../../../shared/api/errors';
import { useRemote } from '../../../shared/hooks/use-remote';
import { useArticleApi } from '../api/article-api-context';
import type {
  ArticleRatingResult,
  RatingChoice,
  RatingTotals,
} from '../api/article-types';

// Trạng thái đánh giá của MỘT Bệnh nhân với MỘT bài (article F3; PLAN 5.13, MH16, use case 2.4.22). Chỉ dùng khi ĐÃ biết người dùng là Bệnh nhân
// (khách và vai khác không gọi API nào: `ArticleRating` chọn chế độ trước khi gắn hook này).
//  - Phiếu của mình tải bằng `GET …/rating` (khoá nút tới khi tải xong: chưa biết phiếu thì không biết bấm là PUT hay DELETE).
//  - Bấm nút đang chọn ⇒ DELETE (thu hồi); bấm nút chưa chọn ⇒ PUT loại đó (kể cả đang chọn nút kia). Số đếm và phiếu sau khi ghi LẤY NGUYÊN từ thân trả về
//    (do máy chủ tính), web không cộng trừ.
//  - ABU-04 và ABU-06 dung hoà bằng MỘT chốt single-flight: trong lúc một lời gọi ghi còn bay, mọi lần bấm khác bị BỎ (không xếp hàng). Nhờ vậy không bao giờ có hai
//    lời gọi ghi cùng bay, nên kết quả cũ không thể đè kết quả mới, và máy chủ nhận các lệnh theo đúng thứ tự bấm. Chốt là `useRef` (đặt đồng bộ ngay trong hàm xử lý) chứ không
//    phải state `busy`: hai lần bấm trong cùng một nhịp thì state chưa kịp vẽ lại, chỉ ref mới chặn được lần thứ hai.
//  - Lỗi (mạng, hết giờ, 5xx, 404…): giữ NGUYÊN phiếu và số đếm cũ, báo ở `writeError`. `PUT`, `DELETE` idempotent nên bấm lại hội tụ về đúng trạng thái dù máy chủ có thể đã xử lý lần trước.
//  - Không tự huỷ lời gọi ghi khi gỡ khối (huỷ giữa chừng không chứng minh được máy chủ chưa ghi); kết quả muộn rơi vào thành phần đã gỡ thì React bỏ qua.
export interface ArticleRatingState {
  // Phiếu hiện có của mình (`null` = chưa đánh giá hoặc chưa biết); chỉ nên tin khi `ready`
  choice: RatingChoice | null;
  totals: RatingTotals;
  // Đã biết phiếu của mình (GET xong): nút mới bấm được
  ready: boolean;
  // GET đang chạy
  loading: boolean;
  // Một lời gọi ghi đang bay
  busy: boolean;
  loadError: unknown;
  writeError: unknown;
  pick(loai: RatingChoice): void;
  retryLoad(): void;
}

export function useArticleRating(
  articleId: string,
  initialTotals: RatingTotals,
): ArticleRatingState {
  const api = useArticleApi();
  const { state, retry } = useRemote(
    (signal) => api.getMyRating(articleId, signal),
    [articleId],
  );
  // Kết quả của lần ghi THÀNH CÔNG gần nhất (null cho tới lúc đó): thắng phiếu và số đếm đọc lúc đầu
  const [written, setWritten] = useState<ArticleRatingResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [writeError, setWriteError] = useState<unknown>(null);
  const inFlight = useRef(false);

  // KHÔNG viết `written?.loai ?? state.data`: sau DELETE `loai` là null, `??` sẽ rơi về phiếu cũ và nút vẫn sáng
  const choice =
    written !== null
      ? written.loai
      : state.status === 'ready'
        ? state.data
        : null;
  const totals: RatingTotals =
    written !== null
      ? { luotThich: written.luotThich, luotKhongThich: written.luotKhongThich }
      : initialTotals;

  async function pick(loai: RatingChoice) {
    // Chốt: chưa biết phiếu của mình, hoặc đã có một lời gọi ghi đang bay ⇒ bỏ lần bấm này
    if (inFlight.current || state.status !== 'ready') return;
    inFlight.current = true;
    setBusy(true);
    setWriteError(null);
    try {
      setWritten(
        choice === loai
          ? await api.clearRating(articleId)
          : await api.setRating(articleId, loai),
      );
    } catch (error) {
      // Nơi gọi tự huỷ (đăng xuất) không phải lỗi để báo cho người dùng
      if (!(error instanceof RequestAbortedError)) setWriteError(error);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return {
    choice,
    totals,
    ready: state.status === 'ready',
    loading: state.status === 'loading',
    busy,
    loadError: state.status === 'error' ? state.error : null,
    writeError,
    pick: (loai) => void pick(loai),
    retryLoad: retry,
  };
}
