import { Body, Controller, Get, Post, Delete, Param, HttpCode } from '@nestjs/common';
import { CreateJobDto } from './dto/create-job.dto';
import { JobsService } from './jobs.service';

@Controller('jobs')
export class JobsController {
  constructor(private readonly svc: JobsService) {}

  @Post()
  async create(@Body() payload: CreateJobDto) {
    const job = await this.svc.create(payload);
    return { id: job.id, status: job.status };
  }

  @Get()
  async list() {
    return this.svc.findAll();
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
    return;
  }

  @Delete()
  @HttpCode(204)
  async removeAll() {
    await this.svc.removeAll();
    return;
  }
}
