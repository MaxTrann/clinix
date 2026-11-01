// Hạ tầng test cho đổi mật khẩu (task A13). Dùng được với `measureRounds` của multi-account-helpers (fixture + `changeServiceFor`) và với openRefreshHarness của A9
// (HTTP thật: `openChangePasswordHarness`). Chỉ dùng trong test (thư mục testing/ không vào bản build).
import { UnauthorizedException } from '@nestjs/common';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import type { MailService } from '../../mail/mail.service.js';
import { ChangePasswordService } from '../change-password/change-password.service.js';
import { TaiKhoan } from '../entities/tai-khoan.entity.js';
import type { IssuedSession } from '../session/session.service.js';
import { LOGIN_PASSWORD, type LoginFixture } from './login-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './refresh-http-helpers.js';
import { NEW_PASSWORD, together } from './reset-password-int-helpers.js';
import { deferred, sleep } from './verification-int-helpers.js';

export const CHANGE_PATH = '/auth/change-password';

export const changeServiceFor = (
  db: DataSource,
  fx: Pick<
    LoginFixture<MailService>,
    'accounts' | 'hasher' | 'otp' | 'sessionService'
  >,
): ChangePasswordService =>
  new ChangePasswordService(
    db,
    fx.accounts,
    fx.hasher,
    fx.otp,
    fx.sessionService,
  );

/** Đầu vào dịch vụ cho một phiên đang sống: mặc định đúng mật khẩu cũ, mật khẩu mới NEW_PASSWORD. */
export const changeInput = (
  accountId: string,
  session: Pick<IssuedSession, 'sessionId'>,
  matKhauCu: string = LOGIN_PASSWORD,
  matKhauMoi: string = NEW_PASSWORD,
) => ({ accountId, sessionId: session.sessionId, matKhauCu, matKhauMoi });

/** Thân HTTP đúng, sửa từng trường bằng `overrides`. */
export const changeBody = (overrides: Record<string, unknown> = {}) => ({
  matKhauCu: LOGIN_PASSWORD,
  matKhauMoi: NEW_PASSWORD,
  xacNhan: NEW_PASSWORD,
  ...overrides,
});

export const hashOf = async (
  db: DataSource,
  taiKhoanId: string,
): Promise<string> =>
  (await db.getRepository(TaiKhoan).findOneByOrFail({ taiKhoanId }))
    .matKhauBam ?? '';

/** Lỗi 401 của dịch vụ thành AppException để `together` đọc ra mã, không coi là lỗi lạ. */
export const with401Code =
  (work: () => Promise<unknown>) => async (): Promise<unknown> => {
    try {
      return await work();
    } catch (error) {
      if (error instanceof UnauthorizedException)
        throw new AppException(401, error.message);
      throw error;
    }
  };

/**
 * Ép đúng thứ tự "first rồi second" bằng chờ khoá THẬT: một giao dịch khác giữ khoá hàng `tai_khoan`, `first` xếp hàng chờ khoá, thả khoá, rồi mới chạy `second`.
 * Trả kết quả của cả hai ('ok', mã lỗi nghiệp vụ hoặc `LOI_LA: …`).
 */
export async function queuedOnAccount(
  db: DataSource,
  taiKhoanId: string,
  first: () => Promise<unknown>,
  second: () => Promise<unknown>,
): Promise<[string, string]> {
  const locked = deferred();
  const free = deferred();
  const lockHolder = db.transaction('READ COMMITTED', async (em) => {
    await em.query(
      'SELECT tai_khoan_id FROM tai_khoan WHERE tai_khoan_id = ? FOR UPDATE',
      [taiKhoanId],
    );
    locked.resolve();
    await free.promise;
  });
  await locked.promise;
  const firstResult = together([first]);
  await sleep(200); // băm xong và đã tới chỗ chờ khoá
  free.resolve();
  await lockHolder;
  await sleep(50); // `first` đã nhận khoá (giữ tới khi commit) trước khi `second` xếp hàng
  const [secondCode] = await together([second]);
  const [firstCode] = await firstResult;
  return [firstCode ?? 'thiếu', secondCode ?? 'thiếu'];
}

// ---------- HTTP ----------

type PostRequest = ReturnType<ReturnType<typeof request>['post']>;

export interface ChangePasswordCall {
  /** Access token; không truyền = không gửi Authorization. */
  accessToken?: string;
  body?: object;
  cookie?: string;
}

export interface ChangePasswordHarness extends RefreshHarness {
  change: (call: ChangePasswordCall) => PostRequest;
}

export async function openChangePasswordHarness(): Promise<ChangePasswordHarness> {
  const base = await openRefreshHarness();
  return {
    ...base,
    change: ({ accessToken, body, cookie }) => {
      const headers = Object.fromEntries(
        [
          ['Authorization', accessToken && `Bearer ${accessToken}`],
          ['Cookie', cookie && `refresh_token=${cookie}`],
        ].filter(([, value]) => value),
      ) as Record<string, string>;
      return request(base.app.getHttpServer())
        .post(CHANGE_PATH)
        .set(headers)
        .send(body ?? changeBody());
    },
  };
}
