import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import {
  HEADERS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants.js';
import { SystemConfigModule } from '../../admin/system-config/system-config.module.js';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator.js';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator.js';
import { SchedulingModule } from '../../scheduling/scheduling.module.js';
import { SearchModule } from '../../search/search.module.js';
import { AI_CONFIG } from '../chatbot.constants.js';
import { ChatbotModule } from '../chatbot.module.js';
import { FallbackChain } from '../providers/fallback-chain.js';
import { DoctorDegreeRepository } from './doctor-degree.repository.js';
import { SuggestionController } from './suggestion.controller.js';
import { SuggestionRepository } from './suggestion.repository.js';
import { SuggestionService } from './suggestion.service.js';

// chatbot B4 — nối module và đặc tính route (không cần DB): GOI-09 phần header, 5.3 (route công khai, không đọc token, không @Roles).
// `auditPublicControllers` của search đòi đường dẫn bắt đầu bằng `public/` nên không dùng được cho route `chatbot/suggestions`; kiểm trực tiếp metadata.
const moduleMeta = <T>(key: string): T[] =>
  (Reflect.getMetadata(key, ChatbotModule) as T[] | undefined) ?? [];

describe('B4-W1 ChatbotModule nối đúng (chỉ THÊM, phần có sẵn của P1 giữ nguyên)', () => {
  it('nhập SearchModule, SchedulingModule, SystemConfigModule và có SuggestionController', () => {
    expect(moduleMeta('imports')).toEqual(
      expect.arrayContaining([
        SearchModule,
        SchedulingModule,
        SystemConfigModule,
      ]),
    );
    // chatbot B3 thêm AskController vào cùng module: ở đây chỉ khẳng định SuggestionController CÓ MẶT (đủ hai controller do ask.wiring.spec.ts kiểm)
    expect(moduleMeta('controllers')).toEqual(
      expect.arrayContaining([SuggestionController]),
    );
  });

  it('thêm ba provider của B4 mà không bớt provider nào của P1; vẫn chỉ xuất FallbackChain và AI_CONFIG', () => {
    expect(moduleMeta('providers')).toEqual(
      expect.arrayContaining([
        SuggestionService,
        SuggestionRepository,
        DoctorDegreeRepository,
      ]),
    );
    expect(moduleMeta('exports')).toEqual([FallbackChain, AI_CONFIG]);
  });
});

describe('B4-W2 route GET /chatbot/suggestions', () => {
  // `Reflect.get` thay cho truy cập thẳng `prototype.suggest` để không dính quy tắc `unbound-method` (chỉ đọc metadata, không gọi hàm)
  const handlerOf = (name: string): object =>
    Reflect.get(SuggestionController.prototype, name) as object;
  const handler = handlerOf('suggest');

  it('đường dẫn `chatbot` + `suggestions`, phương thức GET, và chỉ một route trong controller', () => {
    expect(Reflect.getMetadata(PATH_METADATA, SuggestionController)).toBe(
      'chatbot',
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('suggestions');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.GET,
    );
    const routes = Object.getOwnPropertyNames(
      SuggestionController.prototype,
    ).filter(
      (name) =>
        name !== 'constructor' &&
        Reflect.getMetadata(METHOD_METADATA, handlerOf(name)) !== undefined,
    );
    expect(routes).toEqual(['suggest']);
  });

  it('@Public() (không đọc token) và KHÔNG có @Roles', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, SuggestionController)).toBe(true);
    expect(
      Reflect.getMetadata(ROLES_KEY, SuggestionController),
    ).toBeUndefined();
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toBeUndefined();
  });

  it('Cache-Control: no-store đặt bằng @Header trên handler (Nest áp trước pipe nên cả nhánh 400 có header)', () => {
    const headers = Reflect.getMetadata(HEADERS_METADATA, handler) as
      { name: string; value: string }[] | undefined;
    expect(headers).toEqual([{ name: 'Cache-Control', value: 'no-store' }]);
  });
});
