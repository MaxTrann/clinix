import { useCallback, useEffect, useRef, useState } from 'react';
import {
  GeolocationFailure,
  branchCoordinates,
  getSelectedBranch,
  isGeolocationSupported,
  nearestBranch,
  requestPosition,
  useSelectedBranch,
  type GeolocationFailureReason,
} from '../../../shared/branch-selection';
import { getBranches } from '../api/search-service';
import type { BranchSummary } from '../api/search-types';

export const LOCATION_FAILED_NOTICE =
  'Không xác định được vị trí của bạn. Đang hiển thị toàn quốc.';
export const LOCATION_DENIED_NOTICE =
  'Bạn đã chặn quyền vị trí. Hãy chọn chi nhánh trong danh sách.';
export const LOCATION_UNSUPPORTED_NOTICE =
  'Chưa thể định vị vì trình duyệt không hỗ trợ hoặc chưa có chi nhánh nào có toạ độ.';

export interface PublicBranches {
  branches: BranchSummary[];
  // Đã tải xong danh sách (kể cả khi lỗi) — để biết tên chi nhánh đã lưu có tra được chưa
  loaded: boolean;
  locating: boolean;
  notice: string | null;
  // Có thể thử định vị: trình duyệt hỗ trợ và có ít nhất một chi nhánh có toạ độ
  canLocate: boolean;
  select: (chiNhanhId: string | null) => void;
  locate: () => void;
}

function noticeFor(reason: GeolocationFailureReason): string {
  if (reason === 'DENIED') return LOCATION_DENIED_NOTICE;
  if (reason === 'UNSUPPORTED') return LOCATION_UNSUPPORTED_NOTICE;
  return LOCATION_FAILED_NOTICE;
}

/**
 * Tải danh sách chi nhánh và khởi tạo "chi nhánh đang chọn" MỘT lần khi khung công khai gắn (PLAN search 5.7, Q7):
 * - đã có lựa chọn ⇒ dùng lại, KHÔNG xin quyền; lựa chọn trỏ tới chi nhánh không còn ⇒ về "Toàn quốc" (CNC-06, CNC-07);
 * - chưa có ⇒ có chi nhánh đủ toạ độ và trình duyệt hỗ trợ thì xin vị trí; từ chối/lỗi/không có ⇒ lưu "Toàn quốc" (CNC-01…04, CNC-11).
 * Toạ độ người dùng chỉ dùng để tính khoảng cách tại chỗ, không gửi đi đâu (CNC-12).
 */
export function usePublicBranches(): PublicBranches {
  const { select: store } = useSelectedBranch();
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const branchesRef = useRef<BranchSummary[]>([]);

  const canLocate =
    isGeolocationSupported() &&
    branches.some((branch) => branchCoordinates(branch) !== null);

  // `automatic` = lần đầu vào trang: lỗi thì LƯU "Toàn quốc" để không hỏi lại; bấm tay thì giữ nguyên lựa chọn hiện có.
  const detect = useCallback(
    async (list: BranchSummary[], automatic: boolean) => {
      const hasCoordinates = list.some(
        (branch) => branchCoordinates(branch) !== null,
      );
      if (!hasCoordinates || !isGeolocationSupported()) {
        if (automatic) store(null, 'DinhVi');
        else setNotice(LOCATION_UNSUPPORTED_NOTICE);
        return;
      }
      setLocating(true);
      setNotice(null);
      try {
        const position = await requestPosition();
        // Trong lúc chờ người dùng đã tự chọn tay thì không ghi đè (chỉ áp dụng cho lần tự động)
        if (automatic && getSelectedBranch() !== null) return;
        store(nearestBranch(list, position), 'DinhVi');
      } catch (error) {
        const reason =
          error instanceof GeolocationFailure ? error.reason : 'UNAVAILABLE';
        if (automatic) {
          if (getSelectedBranch() === null) store(null, 'DinhVi');
          // Từ chối là lựa chọn của người dùng nên không báo thêm; lỗi kỹ thuật thì có thông báo nhỏ
          if (reason !== 'DENIED') setNotice(noticeFor(reason));
        } else {
          setNotice(noticeFor(reason));
        }
      } finally {
        setLocating(false);
      }
    },
    [store],
  );

  useEffect(() => {
    const controller = new AbortController();
    getBranches(controller.signal)
      .then(async (page) => {
        const list = Array.isArray(page?.items) ? page.items : [];
        branchesRef.current = list;
        setBranches(list);
        setLoaded(true);
        const stored = getSelectedBranch();
        if (stored) {
          // Chi nhánh đã lưu không còn trong danh sách ⇒ về "Toàn quốc"
          if (
            stored.chiNhanhId !== null &&
            !list.some((branch) => branch.chiNhanhId === stored.chiNhanhId)
          ) {
            store(null, 'NguoiDung');
          }
          return;
        }
        await detect(list, true);
      })
      // Lỗi mạng/máy chủ: giữ nguyên lựa chọn, thử lại ở lần vào trang sau (không lưu gì)
      .catch(() => setLoaded(true));
    return () => controller.abort();
  }, [detect, store]);

  const select = useCallback(
    (chiNhanhId: string | null) => {
      setNotice(null);
      store(chiNhanhId, 'NguoiDung');
    },
    [store],
  );

  const locate = useCallback(() => {
    void detect(branchesRef.current, false);
  }, [detect]);

  return { branches, loaded, locating, notice, canLocate, select, locate };
}
