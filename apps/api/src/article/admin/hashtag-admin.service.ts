import { Inject, Injectable } from '@nestjs/common';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import { normalizeHashtagPrefix } from '../common/hashtag-name.js';
import type { HashtagSuggestQueryDto } from './article-admin.dto.js';
import { HashtagRepository } from './hashtag.repository.js';

// Gợi ý thẻ khi gõ ở biểu mẫu bài viết (article B1; 2.4.55 b2, PLAN article 5.6). Không có màn quản lý thẻ riêng: thẻ chỉ được TẠO khi lưu bài.

@Injectable()
export class HashtagAdminService {
  constructor(
    @Inject(HashtagRepository) private readonly hashtags: HashtagRepository,
    @Inject(BranchAccessPolicy) private readonly policy: BranchAccessPolicy,
  ) {}

  /** Tối đa 10 thẻ đang hoạt động khớp TIỀN TỐ (không phân biệt hoa thường và dấu theo collation). Tiền tố sai ký tự thì không có gợi ý (200, rỗng), không phải lỗi. */
  async suggest(
    scope: AdminScope,
    input: HashtagSuggestQueryDto,
  ): Promise<{ items: { ten: string }[] }> {
    this.policy.assertToanHeThong(scope);
    const prefix = normalizeHashtagPrefix(input.q ?? '');
    if (prefix === null) return { items: [] };
    const names = await this.hashtags.suggest(prefix, input.limit);
    return { items: names.map((ten) => ({ ten })) };
  }
}
