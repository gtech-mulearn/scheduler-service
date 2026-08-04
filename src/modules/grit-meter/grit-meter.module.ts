import { Module } from '@nestjs/common';
import { GritMeterService } from './grit-meter.service';
import { GritMeterController } from './grit-meter.controller';

@Module({
  controllers: [GritMeterController],
  providers: [GritMeterService],
  exports: [GritMeterService],
})
export class GritMeterModule {}
