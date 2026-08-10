import { Controller, Post } from '@nestjs/common';
import { GritMeterService } from './grit-meter.service';

@Controller('grit-meter')
export class GritMeterController {
  constructor(private readonly gritMeterSvc: GritMeterService) {}

  @Post('process')
  async processGritMeter() {
    const result = await this.gritMeterSvc.processDailyGritMeter();
    return { success: true, ...result };
  }
}
