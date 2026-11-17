import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import type { UpdatePaymentPolicyDto } from './policy.dto.js';
import {
  PaymentPolicyRepository,
  type PolicyServiceGroup,
} from './policy.repository.js';
import {
  sortTiersDescending,
  validatePolicy,
  type RefundTier,
} from './policy.rules.js';

// Cấu hình chính sách đặt cọc và hoàn tiền của MỘT dịch vụ (payment B10; PLAN payment 5.9; CSD). Chỉ `ToanHeThong` (Q10): kiểm ở guard của controller VÀ ở đây (phạm vi kiểm ở backend, không dựa vào guard một chỗ).
// `PUT` thay TOÀN BỘ cọc và mốc trong MỘT giao dịch: khoá X hàng `dich_vu_kham` → kiểm luật (một chỗ: `policy.rules.ts`) → UPDATE cọc → DELETE mốc → INSERT mốc mới → commit.
// Khoá X là cùng khoá của `ServiceService.update` (admin) nên hai đường sửa cùng dịch vụ nối đuôi nhau: `gia_mac_dinh` đọc ở đây là bản mới nhất, và luôn có cọc ≤ giá sau cả hai (CSD-19).
// KHÔNG hồi tố: lịch đã tạo giữ snapshot do booking chụp; service này không đọc hay ghi `lich_hen`.

/** Chi tiết chính sách của một dịch vụ (kết quả của GET và PUT). `mucDatCoc` là chuỗi decimal của DB (`"100000.00"`). */
export interface PaymentPolicy {
  dichVuKhamId: string;
  mucDatCoc: string;
  moc: RefundTier[];
}

const notFound = () => new AppException(404, 'KHONG_TIM_THAY');

@Injectable()
export class PaymentPolicyService {
  constructor(
    @Inject(PaymentPolicyRepository)
    private readonly repository: PaymentPolicyRepository,
    @Inject(BranchAccessPolicy) private readonly access: BranchAccessPolicy,
  ) {}

  async list(scope: AdminScope): Promise<{ nhom: PolicyServiceGroup[] }> {
    this.access.assertToanHeThong(scope);
    return {
      nhom: await this.repository.snapshot((manager) =>
        this.repository.listGrouped(manager),
      ),
    };
  }

  async get(scope: AdminScope, id: string): Promise<PaymentPolicy> {
    this.access.assertToanHeThong(scope);
    return this.repository.snapshot(async (manager) => {
      const service = await this.repository.findService(manager, id);
      if (!service) throw notFound();
      return this.read(manager, service.dichVuKhamId, service.mucDatCoc);
    });
  }

  async replace(
    scope: AdminScope,
    id: string,
    input: UpdatePaymentPolicyDto,
  ): Promise<PaymentPolicy> {
    this.access.assertToanHeThong(scope);
    return this.repository.transaction(async (manager) => {
      const service = await this.repository.lockService(manager, id);
      if (!service) throw notFound();

      // Chưa ghi gì trước dòng này: lỗi hợp lệ ném ra là DB giữ nguyên cọc và mốc cũ (CSD-09)
      const errors = validatePolicy(input, service.giaMacDinh);
      if (errors.length > 0)
        throw new AppException(400, 'CHINH_SACH_COC_KHONG_HOP_LE', {
          thongBao: 'Chính sách đặt cọc và hoàn tiền không hợp lệ.',
          loi: errors,
        });

      await this.repository.updateDeposit(manager, id, input.mucDatCoc);
      await this.repository.replaceTiers(
        manager,
        id,
        sortTiersDescending(input.moc, (tier) => tier),
      );
      // Đọc lại TRONG giao dịch: thứ trả về đúng là thứ đã ghi
      const saved = await this.repository.findService(manager, id);
      return this.read(manager, id, saved!.mucDatCoc);
    });
  }

  private async read(
    manager: EntityManager,
    id: string,
    mucDatCoc: string,
  ): Promise<PaymentPolicy> {
    return {
      dichVuKhamId: id,
      mucDatCoc,
      moc: await this.repository.listTiers(manager, id),
    };
  }
}
