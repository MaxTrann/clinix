import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator.js';
import { todayVN } from '../../common/time/time.js';
import { chatFailureException } from '../chat.constants.js';
import { ConversationOpenRepository } from '../core/conversation-open.repository.js';
import {
  toBranchStart,
  toDoctorStart,
  type StartHeader,
} from '../rest/chat-view.mapper.js';
import { ChatActorResolver } from './chat-actor.resolver.js';
import {
  StartConversationRepository,
  type DefaultBranchSource,
} from './start-conversation.repository.js';

// Bệnh nhân bắt đầu trò chuyện (chat B3; PLAN chat 5.6, Q4, Q24, MH1, MH2): đầu khung TRƯỚC tin đầu và chi nhánh gợi ý. CHỈ ĐỌC: hội thoại chỉ được tạo khi gửi tin đầu
// (NBS-03). Hội thoại đã có tìm bằng ĐÚNG câu của lõi mở (`findExisting`, đọc thường, không khoá), không viết câu thứ hai.
// Route chỉ cho Bệnh nhân (`@Roles('BenhNhan')`, QCH-06): người gọi luôn là Bệnh nhân nên tài khoản của họ là chủ hội thoại.

export interface DefaultBranchResponse {
  /** `null` khi không suy được từ lịch hẹn: web dùng chi nhánh đang chọn ở trình duyệt (MH1). */
  chiNhanhId: string | null;
  nguon: DefaultBranchSource | null;
}

const notFound = () => chatFailureException({ kind: 'NotFound' });

@Injectable()
export class StartConversationService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(StartConversationRepository)
    private readonly repo: StartConversationRepository,
    @Inject(ConversationOpenRepository)
    private readonly conversations: ConversationOpenRepository,
    @Inject(ChatActorResolver) private readonly actors: ChatActorResolver,
  ) {}

  /** Bác sĩ không có, không phải bác sĩ, thiếu hồ sơ ⇒ 404 cùng thân (NBS-08). Bác sĩ ngưng hoạt động vẫn xem được, `coTheGui` sai (Q3). */
  async doctor(user: AuthenticatedUser, bacSiId: string): Promise<StartHeader> {
    const patient = await this.actors.resolve(user);
    const em = this.db.manager;
    const doctor = await this.repo.doctor(em, bacSiId);
    if (doctor === null) throw notFound();
    const [hoiThoaiId, daTungKham] = await Promise.all([
      this.conversations.findExisting(em, patient.taiKhoanId, { bacSiId }),
      this.repo.hasVisited(em, patient.taiKhoanId, bacSiId),
    ]);
    return toDoctorStart(doctor, hoiThoaiId, daTungKham);
  }

  /** Chi nhánh không có ⇒ 404 (NLE-08). Mọi chi nhánh tồn tại đều nhắn được (5.3). */
  async branch(
    user: AuthenticatedUser,
    chiNhanhId: string,
  ): Promise<StartHeader> {
    const patient = await this.actors.resolve(user);
    const em = this.db.manager;
    const ten = await this.repo.branchName(em, chiNhanhId);
    if (ten === null) throw notFound();
    const hoiThoaiId = await this.conversations.findExisting(
      em,
      patient.taiKhoanId,
      { chiNhanhId },
    );
    return toBranchStart(ten, hoiThoaiId);
  }

  /** Q4, MH2: lịch còn hiệu lực sắp tới, rồi lịch Hoàn thành gần nhất, rồi không gợi ý. "Hôm nay" theo giờ Việt Nam. */
  async defaultBranch(user: AuthenticatedUser): Promise<DefaultBranchResponse> {
    const patient = await this.actors.resolve(user);
    const found = await this.repo.defaultBranch(
      this.db.manager,
      patient.taiKhoanId,
      `${todayVN()} 00:00:00`,
    );
    return found ?? { chiNhanhId: null, nguon: null };
  }
}
