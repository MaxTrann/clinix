import { Injectable, type PipeTransform } from '@nestjs/common';
import { parsePublicId } from '../../search/common/id-param.js';

/**
 * Id trong đường dẫn (`:id`): số nguyên dương vừa BIGINT; sai dạng ⇒ 404 `KHONG_TIM_THAY` CÙNG thân với "không có dòng này"
 * (không phân biệt được id sai dạng với id không tồn tại). Trả CHUỖI để không mất độ chính xác của bigint.
 * Là `Pipe` nên guard (đăng nhập, vai trò) chạy trước: người không có quyền không biết id có đúng dạng hay không.
 */
@Injectable()
export class ParseRecordIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    return parsePublicId(value);
  }
}
