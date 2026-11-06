import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { isForeignKeyError } from '../../database/mysql-errors.js';
import type {
  RelativeResponse,
  RelativesListResponse,
} from './relatives.dto.js';
import {
  RelativesRepository,
  type NewRelative,
} from './relatives.repository.js';

/**
 * Hồ sơ người thân của Bệnh nhân đang đăng nhập (task B3; PLAN patient 5.3; TRACKING B3-C…B3-E). Tài khoản luôn là tham số hàm (từ access token
 * ở controller), không bao giờ từ thân hay đường dẫn. Không log gì: họ tên, SĐT, ngày sinh của người thân là dữ liệu cá nhân.
 */
@Injectable()
export class RelativesService {
  constructor(
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(RelativesRepository)
    private readonly relatives: RelativesRepository,
  ) {}

  /** GET: chỉ ĐỌC, một câu SELECT thường (không giao dịch, không khoá). Không phân trang (Q14). */
  async list(accountId: string): Promise<RelativesListResponse> {
    return {
      items: await this.relatives.findRelatives(
        this.dataSource.manager,
        accountId,
      ),
    };
  }

  /**
   * POST: INSERT rồi ĐỌC LẠI trong CÙNG MỘT giao dịch (TRACKING B3-D):
   *  - cần MỘT kết nối để `LAST_INSERT_ID()` đúng (hai lệnh trên `dataSource.manager` có thể rơi vào hai kết nối khác nhau);
   *  - đọc lại lỗi ⇒ hoàn tác, không để lại "đã ghi nhưng báo 500"; phản hồi là bản đọc lại từ DB, không phản chiếu thân gửi lên.
   * Không giới hạn số lượng, không chặn trùng họ tên + ngày sinh (Q14), nên không khoá hàng nào và không đếm.
   */
  async create(
    accountId: string,
    input: NewRelative,
  ): Promise<RelativeResponse> {
    return this.dataSource.transaction(async (em) => {
      const id = await this.insert(em, accountId, input);
      const created = await this.relatives.findRelativeById(em, accountId, id);
      if (created === null) {
        // Phòng thủ: vừa chèn trong cùng giao dịch mà không đọc lại được. Lỗi nội bộ (500), thông điệp không có dữ liệu cá nhân.
        throw new Error(
          `Không đọc lại được hồ sơ người thân vừa tạo của tài khoản ${accountId}`,
        );
      }
      return created;
    });
  }

  // Lỗi khoá ngoại (H13): tài khoản không có dòng `benh_nhan` (không xảy ra với Bệnh nhân đăng nhập được, giữ phòng thủ) ⇒ 403,
  // không 500. Chỉ bắt quanh đúng câu INSERT; mọi lỗi DB khác đi nguyên thành 500 LOI_HE_THONG.
  private async insert(
    em: EntityManager,
    accountId: string,
    input: NewRelative,
  ): Promise<string> {
    try {
      return await this.relatives.insertRelative(em, accountId, input);
    } catch (error) {
      if (isForeignKeyError(error)) {
        throw new AppException(403, COMMON_ERROR_CODES.FORBIDDEN);
      }
      throw error;
    }
  }
}
