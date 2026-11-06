import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../../auth/decorators/public.decorator.js';
import { PUBLIC_ROUTE_PREFIX } from '../search.constants.js';
import {
  PublicSuggestionQueryDto,
  type PublicSuggestions,
} from './public-suggestion.dto.js';
import { PublicSuggestionService } from './public-suggestion.service.js';

// Route công khai: không đọc token, không @Roles, chỉ GET (PLAN 5.2). Controller chỉ nhận/trả.
@Controller(`${PUBLIC_ROUTE_PREFIX}/suggestions`)
@Public()
export class PublicSuggestionController {
  constructor(private readonly suggestions: PublicSuggestionService) {}

  @Get()
  find(@Query() query: PublicSuggestionQueryDto): Promise<PublicSuggestions> {
    return this.suggestions.find(query);
  }
}
