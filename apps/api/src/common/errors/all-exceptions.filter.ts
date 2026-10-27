import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
  type LoggerService,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { inspect } from 'node:util';
import type { Request, Response } from 'express';
import { AppException, type ErrorBody } from './app.exception.js';
import {
  COMMON_ERROR_CODES,
  defaultsForStatus,
  isErrorCode,
} from './error-codes.js';

export interface ErrorResponse {
  status: number;
  body: ErrorBody;
}

// Mã nằm trong `message` (cách A3/A4 ném lỗi: UnauthorizedException('CHUA_DANG_NHAP')). Thông điệp tự do thì bỏ.
function codeFromHttpException(exception: HttpException): string | undefined {
  const response = exception.getResponse();
  const message =
    typeof response === 'string'
      ? response
      : (response as { message?: unknown }).message;
  return isErrorCode(message) ? message : undefined;
}

// Lỗi của thư viện Express/body-parser không phải HttpException nhưng mang `status`/`statusCode` (vd. PayloadTooLargeError 413)
function clientErrorStatus(exception: unknown): number | undefined {
  if (typeof exception !== 'object' || exception === null) return undefined;
  const candidate: unknown =
    Reflect.get(exception, 'status') ?? Reflect.get(exception, 'statusCode');
  return typeof candidate === 'number' &&
    Number.isInteger(candidate) &&
    candidate >= 400 &&
    candidate <= 499
    ? candidate
    : undefined;
}

function internalError(status = 500): ErrorResponse {
  const defaults = defaultsForStatus(status);
  return {
    status,
    body: { maLoi: COMMON_ERROR_CODES.INTERNAL, thongBao: defaults.thongBao },
  };
}

// Hàm thuần: ánh xạ MỌI thứ bị ném thành (trạng thái, thân JSON). Quy tắc:
//  - AppException: dùng nguyên;
//  - HttpException 4xx: mã nếu thông điệp là mã, ngược lại mã mặc định theo trạng thái; thông điệp tự do KHÔNG được chuyển ra
//    (Nest ghi "Cannot GET /x?token=…" cho route lạ, V8 có thể trích đoạn JSON hỏng);
//  - lỗi 4xx của Express/body-parser: mã mặc định theo trạng thái;
//  - HttpException 5xx: giữ trạng thái, mã LOI_HE_THONG; mọi thứ còn lại (Error, giá trị lạ): 500 LOI_HE_THONG.
//    Cả hai không kèm gì từ lỗi gốc.
export function toErrorResponse(exception: unknown): ErrorResponse {
  if (exception instanceof AppException) {
    const body = exception.getResponse() as ErrorBody;
    return { status: exception.getStatus(), body: { ...body } };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    if (status >= 500) return internalError(status); // 5xx có chủ ý (vd. 503) giữ trạng thái, vẫn ẩn chi tiết
    const defaults = defaultsForStatus(status);
    return {
      status,
      body: {
        maLoi: codeFromHttpException(exception) ?? defaults.maLoi,
        thongBao: defaults.thongBao,
      },
    };
  }
  const status = clientErrorStatus(exception);
  if (status !== undefined) {
    const defaults = defaultsForStatus(status);
    return {
      status,
      body: { maLoi: defaults.maLoi, thongBao: defaults.thongBao },
    };
  }
  return internalError();
}

// Mô tả lỗi cho LOG (không bao giờ cho phản hồi): stack kèm code/errno/sqlState của MySQL. Logger sẽ che bí mật trong chuỗi này.
function describeForLog(exception: unknown): string {
  if (exception instanceof Error) {
    const extras = (['code', 'errno', 'sqlState'] as const)
      .map((key) => [key, Reflect.get(exception, key)] as const)
      .filter(
        ([, value]) => typeof value === 'string' || typeof value === 'number',
      )
      .map(([key, value]) => `${key}=${String(value)}`);
    const head = exception.stack ?? `${exception.name}: ${exception.message}`;
    return extras.length > 0 ? `${head}\n[${extras.join(' ')}]` : head;
  }
  return typeof exception === 'string'
    ? exception
    : inspect(exception, { depth: 2 });
}

// Bộ lọc lỗi toàn cục (đăng ký ở configureApp): mọi lỗi ra ngoài đều có dạng ErrorBody; lỗi 5xx được ghi log ERROR kèm requestId
// (cùng id trả cho client) để đối chiếu mà không lộ chi tiết nội bộ ra ngoài.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly logger: LoggerService = new Logger('ExceptionFilter'),
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<
      Request & { user?: { accountId?: string } }
    >();
    const response = http.getResponse<Response>();
    const { status, body } = toErrorResponse(exception);

    if (status >= 500) {
      body.requestId = randomUUID();
      const path = (request.path ?? request.url ?? '').split('?')[0];
      const who =
        request.user?.accountId === undefined
          ? ''
          : ` account=${request.user.accountId}`;
      try {
        this.logger.error(
          `[${body.requestId}] ${request.method} ${path} → ${status}${who}`,
          describeForLog(exception),
        );
      } catch {
        // Việc ghi log hỏng không được làm mất phản hồi cho client
      }
    }

    if (response.headersSent) return; // đã gửi một phần thì không ghi đè được nữa
    response.status(status).json(body);
  }
}
