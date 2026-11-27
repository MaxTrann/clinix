import { Controller, Get, Header, Inject, Query } from '@nestjs/common';
import { Public } from '../../auth/decorators/public.decorator.js';
import {
  SuggestionQueryDto,
  type SuggestionResponse,
} from './suggestion.dto.js';
import { SuggestionService } from './suggestion.service.js';

// `GET /chatbot/suggestions` (chatbot B4; PLAN chatbot 5.3, 5.12). Route công khai: không đọc token, không `@Roles`, chỉ GET, nên API không biết người gọi là ai.
// `no-store`: khung giờ đổi liên tục. Nest áp header SAU guard và TRƯỚC pipe nên 400 do pipe và lỗi nghiệp vụ do service ném đều có header này.
@Controller('chatbot')
@Public()
export class SuggestionController {
  constructor(
    @Inject(SuggestionService)
    private readonly suggestions: SuggestionService,
  ) {}

  @Get('suggestions')
  @Header('Cache-Control', 'no-store')
  suggest(@Query() query: SuggestionQueryDto): Promise<SuggestionResponse> {
    return this.suggestions.suggest(query);
  }
}
