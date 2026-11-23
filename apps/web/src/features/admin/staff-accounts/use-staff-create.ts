import { useCallback, useRef, useState } from 'react';
import { trimAsciiWhitespace } from '../../auth';
import type { AdminMe } from '../admin-me';
import { describeCreateFailure } from './staff-create-errors';
import {
  buildBody,
  fieldsOf,
  initialValues,
  validate,
  type CreateValues,
  type FieldErrors,
} from './staff-create-model';
import { createStaff } from './staff-create-service';

// Trạng thái của hộp "Tạo tài khoản nhân sự" (admin F8 PR2): giá trị các ô, lỗi từng ô, lỗi chung, và đang ở biểu mẫu hay đã có kết quả.
// - Chỉ MỘT lần gửi tại một thời điểm: `useRef` chặn lần gọi thứ hai TRƯỚC khi React kịp vẽ lại nút đã tắt (hai sự kiện trong cùng một khung hình).
// - Không tự thử lại. Mất mạng hay hết hạn chờ: ở lại biểu mẫu, giữ dữ liệu, bật cờ `unknown` (chưa rõ máy chủ đã tạo hay chưa); người dùng tự kiểm tra danh sách.
// - Không `console.*`: họ tên, email của người dùng không được đi ra log.

export type CreatePhase =
  | { kind: 'form' }
  | {
      kind: 'created';
      outcome: 'sent' | 'mailFailed';
      taiKhoanId: string;
      email: string;
    }
  /** Máy chủ trả 2xx nhưng sai hình dạng: không biết id nên không có "Xem chi tiết". */
  | { kind: 'unclear' };

interface UseStaffCreateOptions {
  me: AdminMe;
  /** Gọi khi CÓ THỂ đã có tài khoản mới (201, kể cả thư lỗi): nơi gọi tải lại danh sách. */
  onCreated: () => void;
}

export function useStaffCreate({ me, onCreated }: UseStaffCreateOptions) {
  // Giá trị và lỗi cùng một state để cập nhật là hàm thuần (không đặt state này trong hàm cập nhật của state kia)
  const [form, setForm] = useState<{
    values: CreateValues;
    errors: FieldErrors;
  }>(() => ({ values: initialValues(me), errors: {} }));
  const { values, errors } = form;
  const [message, setMessage] = useState<string | null>(null);
  const [unknown, setUnknown] = useState(false);
  const [phase, setPhase] = useState<CreatePhase>({ kind: 'form' });
  const [pending, setPending] = useState(false);
  // Tăng mỗi lần có lỗi ở ô (khi bấm gửi) để `useFocusFirstInvalid` đưa focus vào ô lỗi đầu tiên; sửa ô không tăng nên không giành focus
  const [focusTick, setFocusTick] = useState(0);
  const inFlight = useRef(false);

  /** Áp giá trị mới. Lỗi của ô vừa đổi biến mất; lỗi của ô không còn thuộc vai trò (đổi vai trò, đổi phạm vi) cũng bỏ. */
  const update = useCallback((next: CreateValues) => {
    setForm((current) => {
      const live = new Set<string>(fieldsOf(next));
      const kept: FieldErrors = {};
      for (const [field, text] of Object.entries(current.errors) as [
        keyof FieldErrors,
        string,
      ][]) {
        if (live.has(field) && current.values[field] === next[field])
          kept[field] = text;
      }
      return { values: next, errors: kept };
    });
  }, []);

  const submit = useCallback(async () => {
    if (inFlight.current) return;
    setMessage(null);
    setUnknown(false);
    const found = validate(values);
    if (Object.keys(found).length > 0) {
      setForm((current) => ({ ...current, errors: found }));
      setFocusTick((count) => count + 1);
      return;
    }
    inFlight.current = true;
    setForm((current) => ({ ...current, errors: {} }));
    setPending(true);
    const email = trimAsciiWhitespace(values.email);
    try {
      const outcome = await createStaff(buildBody(values));
      if (outcome.kind === 'unknown') {
        setPhase({ kind: 'unclear' });
      } else {
        setPhase({
          kind: 'created',
          outcome: outcome.kind,
          taiKhoanId: outcome.taiKhoanId,
          email,
        });
      }
      onCreated();
    } catch (error) {
      const failure = describeCreateFailure(error);
      if (failure.kind === 'unknown') setUnknown(true);
      else if (failure.kind === 'message') setMessage(failure.message);
      else if (failure.kind === 'fields') {
        setForm((current) => ({ ...current, errors: failure.fields }));
        if (failure.message !== undefined) setMessage(failure.message);
        setFocusTick((count) => count + 1);
      }
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, [onCreated, values]);

  /** "Tạo tài khoản khác": biểu mẫu trống, giữ vai trò đang chọn (và chi nhánh cố định của Admin Chi nhánh). */
  const createAnother = useCallback(() => {
    setForm((current) => ({
      values: { ...initialValues(me), vaiTro: current.values.vaiTro },
      errors: {},
    }));
    setMessage(null);
    setUnknown(false);
    setPhase({ kind: 'form' });
  }, [me]);

  return {
    values,
    errors,
    message,
    unknown,
    phase,
    pending,
    focusTick,
    update,
    submit,
    createAnother,
  };
}
