import { Injectable, type PipeTransform } from '@nestjs/common';
import { parsePublicId } from '../../search/common/id-param.js';

/**
 * Id hồ sơ người thân trên đường dẫn (`:id`, PLAN patient Q27; task B4, TRACKING B4-B). Dùng lại luật của `parsePublicId` (module search):
 * số nguyên dương vừa BIGINT, viết bằng chữ số ASCII; sai dạng ⇒ 404 `KHONG_TIM_THAY` CÙNG thân với "không có" và "của người khác" (H3),
 * không bao giờ 400 hay 500. Trả về CHUỖI: id BIGINT lớn hơn 2^53 mà ép `Number` sẽ trỏ nhầm sang hồ sơ khác.
 *
 * Phải là `Pipe` (không kiểm trong thân hàm): `ValidationPipe` của thân chạy trước handler, nên kiểm trong hàm thì id sai dạng kèm thân sai ra 400.
 * Guard (đăng nhập, vai trò) vẫn chạy trước mọi `Pipe`, nên người không có quyền không biết id có đúng dạng hay không.
 *
 * Hai trường hợp nằm ngoài tầm của ứng dụng (đã thử, TRACKING B4-B mục 3): chuỗi `%` hỏng (ví dụ `%`, `%E0%A4%A`) bị Express từ chối
 * bằng 400 `YEU_CAU_KHONG_HOP_LE` trước cả guard; URL dài hơn 16 KB bị Node từ chối (431) trước khi tới ứng dụng.
 * B5 (ngừng sử dụng) và B7 (tra cứu) dùng lại đúng pipe này.
 */
@Injectable()
export class ParseRelativeIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    return parsePublicId(value);
  }
}
