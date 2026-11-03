import type { CodeMarks } from '../otp/use-code-timers';
import { textFrom } from '../route-state';

// Trạng thái giữa ba bước của Quên mật khẩu (TRACKING F4-…).
// - `Flow` sống trong state của trang. CHỈ bước `password` có `resetToken`: rời bước đó (thành công, lỗi token, quay lại, rời trang) là mất token.
// - `location.state` (sống qua tải lại, đọc được từ lịch sử) chỉ giữ thứ KHÔNG bí mật: email, hai mốc của mã, hai cờ của khung Hoàn tất.

export interface DoneFlags {
  taiKhoanNgung: boolean;
  canDangKyLai: boolean;
}

export type Flow =
  | { step: 'email'; email: string; notice: string | null }
  | {
      step: 'code';
      email: string;
      marks: CodeMarks;
      // true: mốc vừa nhận từ API (đếm theo hiệu hai mốc); false: đọc lại (đếm theo đồng hồ máy)
      fresh: boolean;
      // Vào bước 2 sau 503: thư không đi, mã cũ (nếu có) vẫn nhập được
      mailFailed: boolean;
    }
  | { step: 'password'; email: string; marks: CodeMarks; resetToken: string }
  | ({ step: 'done'; email: string } & DoneFlags);

export type ForgotRouteState =
  | { email: string }
  | ({ stage: 'code'; email: string } & CodeMarks)
  | ({ stage: 'done'; email: string } & DoneFlags);

// Bước 3 ghi giống bước 2: tải lại ở bước 3 thì token mất, quay về nhập mã
export function routeStateFor(flow: Flow): ForgotRouteState {
  switch (flow.step) {
    case 'email':
      return { email: flow.email };
    case 'code':
    case 'password':
      return { stage: 'code', email: flow.email, ...flow.marks };
    case 'done':
      return {
        stage: 'done',
        email: flow.email,
        taiKhoanNgung: flow.taiKhoanNgung,
        canDangKyLai: flow.canDangKyLai,
      };
  }
}

// `location.state` có thể do trang khác đặt (đăng nhập mang `{ email }`) hoặc cũ từ lịch sử: kiểm dạng, lạ thì về bước 1
export function flowFromState(state: unknown): Flow {
  const email = textFrom(state, 'email') ?? '';
  const stage = textFrom(state, 'stage');
  const value = state as Record<string, unknown> | null;
  if (email !== '' && stage === 'code') {
    return {
      step: 'code',
      email,
      marks: {
        hetHanLuc: textFrom(state, 'hetHanLuc'),
        coTheGuiLaiLuc: textFrom(state, 'coTheGuiLaiLuc'),
      },
      fresh: false,
      mailFailed: false,
    };
  }
  if (
    email !== '' &&
    stage === 'done' &&
    typeof value?.taiKhoanNgung === 'boolean' &&
    typeof value.canDangKyLai === 'boolean'
  ) {
    return {
      step: 'done',
      email,
      taiKhoanNgung: value.taiKhoanNgung,
      canDangKyLai: value.canDangKyLai,
    };
  }
  return { step: 'email', email, notice: null };
}
