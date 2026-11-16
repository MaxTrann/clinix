import { useCallback, useEffect, useRef, useState } from 'react';
import { RequestAbortedError } from '../../../shared/api/errors';
import { saveExamRecord } from './api/exam-api';
import { describeSaveFailure, type SaveFailure } from './exam-messages';
import {
  toBody,
  validateRecord,
  type RecordField,
  type RecordValues,
} from './exam-record-form';

// Máy trạng thái của MỘT lần lưu hồ sơ khám (doctor-exam F3; PLAN 5.5, 5.13). `save` kiểm ở máy (`validateRecord`; có lỗi thì KHÔNG gọi PUT) rồi gửi đúng MỘT PUT. KHÔNG BAO GIỜ tự gửi lại:
// lỗi mạng, quá giờ, 200 sai hình dạng nghĩa là "chưa rõ đã lưu"; người dùng bấm Lưu lại thì gửi CÙNG token (an toàn: lần trước đã lưu thì máy chủ trả 409 và hộp đi tiếp luồng tải lại và so sánh).
export function useSaveRecord({
  maLichHen,
  ngayKham,
  onSaved,
  onChanged,
}: {
  maLichHen: string;
  // Ngày khám `YYYY-MM-DD` theo giờ Việt Nam, để kiểm khoảng ngày tái khám; `null` thì máy chủ quyết định
  ngayKham: string | null;
  // 200: hộp đóng, thẻ báo "Đã lưu hồ sơ khám."
  onSaved: () => void;
  // Máy chủ đã đổi hay dữ liệu đang hiện chắc chắn lệch: nơi gọi tải lại chi tiết
  onChanged: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<SaveFailure | null>(null);
  // Cờ chống gửi đúp bằng ref: state chưa kịp vẽ lại giữa hai lần bấm trong cùng một lượt xử lý (nút `disabled` chưa kịp có hiệu lực)
  const sending = useRef(false);
  const controller = useRef<AbortController | null>(null);
  // Hàm gọi lại luôn là bản mới nhất mà `save` không phải đổi danh tính theo từng lần vẽ
  const onSavedRef = useRef(onSaved);
  const onChangedRef = useRef(onChanged);
  useEffect(() => {
    onSavedRef.current = onSaved;
    onChangedRef.current = onChanged;
  });
  // Gỡ hộp khi đang gửi (rời trang, đăng xuất): huỷ yêu cầu để không cập nhật state hay tải lại sau khi gỡ
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );

  const save = useCallback(
    async (values: RecordValues, token: string | null) => {
      if (sending.current) return;
      const errors = validateRecord(values, ngayKham);
      if (Object.keys(errors).length > 0) {
        setFailure({
          message: null,
          kind: 'field',
          fields: errors,
          refresh: false,
        });
        return;
      }
      sending.current = true;
      const abort = new AbortController();
      controller.current = abort;
      setFailure(null);
      setSaving(true);
      // Lấy kết quả trước, cập nhật state và gọi hàm của nơi gọi SAU (lỗi trong `onSaved` không bị coi là lỗi của lời gọi mạng)
      let result: SaveFailure | null = null;
      try {
        await saveExamRecord(maLichHen, toBody(values, token), abort.signal);
      } catch (error: unknown) {
        // Bị huỷ (rời trang, đăng xuất): không báo gì cho người dùng
        if (error instanceof RequestAbortedError) {
          sending.current = false;
          return;
        }
        result = describeSaveFailure(error);
      }
      sending.current = false;
      if (abort.signal.aborted) return;
      setSaving(false);

      if (result === null) {
        onSavedRef.current();
        onChangedRef.current();
        return;
      }
      setFailure(result);
      if (result.refresh) onChangedRef.current();
    },
    [maLichHen, ngayKham],
  );

  // Gõ vào một ô thì bỏ lỗi của đúng ô đó; dải chung (409, mạng…) ở lại cho tới khi người dùng xử lý
  const clearField = useCallback((field: RecordField) => {
    setFailure((current) => {
      if (current === null || current.fields[field] === undefined)
        return current;
      const fields = { ...current.fields };
      delete fields[field];
      return { ...current, fields };
    });
  }, []);

  // Người dùng đã chọn bản (giữ bản của tôi, dùng bản mới nhất): bỏ lỗi cũ
  const resolve = useCallback(() => setFailure(null), []);

  return { saving, failure, save, clearField, resolve };
}
