import { Injectable, type PipeTransform } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../common/errors/error-codes.js';
import { parseAppointmentCode } from './appointment-code.js';

/**
 * `:maLichHen` trên đường dẫn (task B2; PLAN booking 5.9, Q11, H17; TRACKING 3.15 B2-C). Chuẩn hoá (cắt khoảng trắng, chữ hoa) rồi kiểm mẫu `CLX-yyyyMMdd-XXXXX`;
 * sai dạng ⇒ 404 `KHONG_TIM_THAY` CÙNG thân với "không có" và "của người khác" (không bao giờ 400, để không phân biệt được ba trường hợp). Trả mã ĐÃ chuẩn hoá.
 * Không thêm mã lỗi: `KHONG_TIM_THAY` là mã dùng chung của `common/errors` (`BCS-01` ghim đúng 25 mã của booking).
 *
 * Phải là `Pipe` (không kiểm trong thân hàm): guard (đăng nhập, vai trò) chạy TRƯỚC mọi pipe nên người không có quyền không biết mã có đúng dạng hay không.
 * Hai trường hợp nằm ngoài tầm của ứng dụng (nếp patient B4): chuỗi `%` hỏng bị Express từ chối 400 trước cả guard; URL dài hơn 16 KB bị Node từ chối (431).
 */
@Injectable()
export class ParseAppointmentCodePipe implements PipeTransform<string, string> {
  transform(value: string): string {
    const code = parseAppointmentCode(value);
    if (code === null)
      throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
    return code;
  }
}
