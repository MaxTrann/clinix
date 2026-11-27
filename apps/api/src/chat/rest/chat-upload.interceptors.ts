import {
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
  PayloadTooLargeException,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { Observable, catchError, finalize, throwError, timeout } from 'rxjs';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import {
  CHAT_FILE_MAX_BYTES,
  CHAT_UPLOAD_CONCURRENT,
  CHAT_UPLOAD_DEADLINE_MS,
  chatFileTooLarge,
  chatUploadBusy,
} from '../chat.constants.js';

// Nhận `multipart` ở ba route gửi tin (chat B4; PLAN chat 5.8). Thứ tự trên route: giới hạn đồng thời → đổi lỗi multer → `FileInterceptor` → hạn giờ.
// Guard (xác thực, vai trò) chạy TRƯỚC mọi interceptor, nên yêu cầu sai vai trò bị từ chối trước khi đọc thân. Yêu cầu JSON (gửi chữ của B3) đi qua không bị đếm,
// không bị hạn giờ: multer bỏ qua yêu cầu không phải `multipart`.

const isMultipart = (context: ExecutionContext): boolean =>
  Boolean(
    context.switchToHttp().getRequest<Request>().is('multipart/form-data'),
  );

/**
 * Tối đa 4 lượt tải lên đồng thời trên MỘT tiến trình API (giữ bộ nhớ đỉnh trong ngưỡng X1 M8). Đăng ký làm provider của ChatModule nên ba route dùng CHUNG
 * một bộ đếm. Quá thì 503 `CHAT_TAI_TEP_DANG_BAN` ngay, chưa đọc thân (TEP-12).
 */
@Injectable()
export class ChatUploadCapacityInterceptor implements NestInterceptor {
  private active = 0;

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!isMultipart(context)) return next.handle();
    if (this.active >= CHAT_UPLOAD_CONCURRENT) throw chatUploadBusy();
    this.active++;
    return next.handle().pipe(
      finalize(() => {
        this.active--;
      }),
    );
  }
}

/**
 * Đổi lỗi multer (Nest đã đổi sang lỗi HTTP chung) sang mã ổn định của chat: quá 10 MB ⇒ 413 `CHAT_TEP_QUA_LON`; hai tệp, trường tệp lạ, quá số trường, multipart
 * hỏng ⇒ 400 `YEU_CAU_KHONG_HOP_LE` (TEP-04, TEP-05). Lỗi đã có mã (`AppException` của service, của ValidationPipe) giữ nguyên.
 */
@Injectable()
export class ChatUploadErrorInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      catchError((error: unknown) =>
        throwError(() => {
          if (error instanceof AppException) return error;
          if (error instanceof PayloadTooLargeException)
            return chatFileTooLarge();
          if (error instanceof BadRequestException)
            return new AppException(400, COMMON_ERROR_CODES.BAD_REQUEST, {
              thongBao: 'Mỗi tin gửi được một tệp, ở trường "file".',
            });
          return error;
        }),
      ),
    );
  }
}

/** Hạn giờ 45 giây tính từ lúc nhận xong `multipart` (đặt SAU `FileInterceptor`). Quá hạn ⇒ 504; web gửi lại cùng mã gửi nên không trùng tin. */
@Injectable()
export class ChatUploadDeadlineInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!isMultipart(context)) return next.handle();
    return next.handle().pipe(
      timeout({ first: CHAT_UPLOAD_DEADLINE_MS }),
      catchError((error: unknown) =>
        throwError(() =>
          error instanceof Error && error.name === 'TimeoutError'
            ? new GatewayTimeoutException()
            : error,
        ),
      ),
    );
  }
}

/**
 * Multer giữ tệp trong bộ nhớ: trường tệp `file`, đúng MỘT tệp ≤ 10 MB; trường chữ chỉ `noiDung`, `maGui` (tên trường lạ bị ValidationPipe chặn, số trường thừa bị
 * multer chặn). `defParamCharset: 'utf8'`: tên tệp tiếng Việt giữ đúng dấu (mặc định của busboy là latin1, TEP-06). `fieldSize` 16 KB đủ cho 2000 điểm mã.
 */
export const ChatFileInterceptor = FileInterceptor('file', {
  defParamCharset: 'utf8',
  limits: {
    fileSize: CHAT_FILE_MAX_BYTES,
    files: 1,
    fields: 2,
    parts: 3,
    fieldSize: 16 * 1024,
    headerPairs: 32,
  },
});

/** Tệp multer đưa vào handler (chỉ các trường chat dùng). */
export interface UploadedChatFile {
  buffer: Buffer;
  originalname: string;
}
