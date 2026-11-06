import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../../auth/decorators/public.decorator.js';
import type { Paged } from '../../common/paging/paged.js';
import { PUBLIC_ROUTE_PREFIX } from '../search.constants.js';
import {
  PublicDoctorQueryDto,
  type PublicDoctorItem,
} from './public-doctor.dto.js';
import { PublicDoctorService } from './public-doctor.service.js';

// Route công khai: không đọc token, không @Roles, chỉ GET (PLAN 5.2). Controller chỉ nhận/trả.
@Controller(`${PUBLIC_ROUTE_PREFIX}/doctors`)
@Public()
export class PublicDoctorController {
  constructor(private readonly doctors: PublicDoctorService) {}

  @Get()
  list(@Query() query: PublicDoctorQueryDto): Promise<Paged<PublicDoctorItem>> {
    return this.doctors.list(query);
  }
}
