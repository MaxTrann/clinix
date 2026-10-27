// Hỗ trợ test guard/decorator mà không cần dựng cả ứng dụng. Chỉ dùng trong test (thư mục testing/ không vào bản build).
import { HttpException, type ExecutionContext } from '@nestjs/common';

type Handler = (...args: never[]) => unknown;

// Lấy hàm xử lý của một method theo TÊN (không viết `Lop.prototype.ten`, vì tham chiếu method rời dễ mất `this`)
export function handlerOf<T extends object>(
  controller: new () => T,
  method: keyof T & string,
): Handler {
  return Reflect.get(controller.prototype, method) as Handler;
}

// ExecutionContext giả đủ cho guard HTTP: request cho trước, controller và tên method để Reflector đọc metadata
export function fakeHttpContext<T extends object>(
  request: object,
  controller: new () => T,
  method: keyof T & string,
): ExecutionContext {
  const handler = handlerOf(controller, method);
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => controller,
  } as unknown as ExecutionContext;
}

// Chạy hàm (đồng bộ hoặc bất đồng bộ) và trả về thứ nó ném ra; undefined nếu không ném
export async function thrownBy(run: () => unknown): Promise<unknown> {
  try {
    await run();
    return undefined;
  } catch (error) {
    return error;
  }
}

// Lỗi HTTP có đúng mã trạng thái và đúng mã lỗi ổn định (nằm trong message)
export function expectHttpError(
  error: unknown,
  status: number,
  code: string,
): void {
  expect(error).toBeInstanceOf(HttpException);
  const httpError = error as HttpException;
  expect(httpError.getStatus()).toBe(status);
  expect(httpError.message).toBe(code);
}
