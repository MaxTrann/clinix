import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { isForeignKeyError } from '../../database/mysql-errors.js';
import {
  PATIENT_ERROR_CODES,
  PATIENT_ERROR_MESSAGES,
} from '../patient.constants.js';
import type {
  RelativeResponse,
  RelativesListResponse,
} from './relatives.dto.js';
import {
  RelativesRepository,
  type NewRelative,
} from './relatives.repository.js';

/**
 * Hồ sơ người thân của Bệnh nhân đang đăng nhập (task B3 `list`, `create`; task B4 `update`; PLAN patient 5.3; TRACKING B3-C…B3-E, B4-D). Tài khoản luôn là
 * tham số hàm (từ access token ở controller), không bao giờ từ thân hay đường dẫn. Không log gì: họ tên, SĐT, ngày sinh của người thân là dữ liệu cá nhân.
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

  /**
   * PUT: sửa năm cột rồi ĐỌC LẠI trong CÙNG MỘT giao dịch (task B4; PLAN 5.3; TRACKING B4-D):
   *  - `UPDATE … WHERE id AND benh_nhan_id AND trang_thai_hieu_luc = TRUE`: một câu vừa kiểm chủ sở hữu vừa kiểm hiệu lực. ≥ 1 hàng khớp ⇒ trả bản đọc lại
   *    từ DB (không phản chiếu thân gửi lên); đọc lại ném lỗi ⇒ hoàn tác, không để lại "đã ghi nhưng báo 500".
   *  - 0 hàng khớp ⇒ đọc lại (luôn kèm chủ sở hữu) để phân biệt: không có hoặc của người khác ⇒ 404 cùng thân với `Pipe` id sai dạng (H3, Q27); của MÌNH
   *    nhưng đã ngừng ⇒ 409 (Q9). Hồ sơ đã ngừng của người khác đọc ra `null` nên luôn 404, không lộ sự tồn tại.
   *  - Ném `AppException` ngay trong giao dịch (hoàn tác): mọi nhánh lỗi đều chưa ghi gì.
   * `READ COMMITTED` (không khoá khoảng): ở `REPEATABLE READ` một `UPDATE` không khớp hàng nào vẫn giữ khoá khoảng/khoá hàng tới cuối giao dịch, làm chặn `POST`
   * hay `PUT` của chủ thật (đã đo, TRACKING B4-D). Mức này chỉ của B4: B5 (ngừng sử dụng) vẫn `REPEATABLE READ` theo quyết định 03/11/2026.
   * Không log gì: họ tên, SĐT, ngày sinh của người thân là dữ liệu cá nhân. Không đọc, không ghi `lich_hen` (Q9: được sửa khi có lịch hẹn).
   */
  async update(
    accountId: string,
    id: string,
    input: NewRelative,
  ): Promise<RelativeResponse> {
    return this.dataSource.transaction('READ COMMITTED', async (em) => {
      const matched = await this.relatives.updateRelative(
        em,
        accountId,
        id,
        input,
      );
      const current = await this.relatives.findRelativeById(em, accountId, id);
      if (matched > 0) {
        if (current === null) {
          // Phòng thủ: vừa sửa trong cùng giao dịch mà không đọc lại được. Lỗi nội bộ (500), thông điệp không có dữ liệu cá nhân
          throw new Error(
            `Không đọc lại được hồ sơ người thân ${id} vừa sửa của tài khoản ${accountId}`,
          );
        }
        return current;
      }
      if (current === null) {
        throw new AppException(404, COMMON_ERROR_CODES.NOT_FOUND);
      }
      if (!current.trangThaiHieuLuc) {
        throw new AppException(409, PATIENT_ERROR_CODES.RELATIVE_DEACTIVATED, {
          thongBao:
            PATIENT_ERROR_MESSAGES[PATIENT_ERROR_CODES.RELATIVE_DEACTIVATED],
        });
      }
      // Không thể xảy ra: hồ sơ của chính mình, đang hiệu lực mà UPDATE vẫn khớp 0 hàng. Chỉ có thể là hồ sơ vừa được TẠO giữa câu UPDATE và câu đọc lại
      // (người gọi đoán đúng id kế tiếp của AUTO_INCREMENT trong vài mili giây); không ghi gì, báo 500 chứ không che thành 404 (TRACKING B4-D, bẫy 5)
      throw new Error(
        `Sửa hồ sơ người thân ${id} của tài khoản ${accountId} khớp 0 hàng dù hồ sơ đang hiệu lực`,
      );
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
