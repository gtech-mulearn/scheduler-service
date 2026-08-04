import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobEntity } from './entities/job.entity';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { JobRunnerService } from './job-runner.service';

@Module({
  imports: [TypeOrmModule.forFeature([JobEntity])],
  controllers: [JobsController],
  providers: [JobsService, JobRunnerService],
  exports: [JobsService, JobRunnerService, TypeOrmModule],
})
export class JobsModule {}
