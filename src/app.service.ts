import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class AppService {
  constructor(private readonly dataSource: DataSource) {}

  getHello(): string {
    return 'Hello World!';
  }

  async getHealth() {
    const isDbConnected = this.dataSource.isInitialized;
    let dbPing = false;

    if (isDbConnected) {
      try {
        await this.dataSource.query('SELECT 1');
        dbPing = true;
      } catch {
        dbPing = false;
      }
    }

    const isHealthy = isDbConnected && dbPing;

    return {
      status: isHealthy ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      database: {
        status: isHealthy ? 'up' : 'down',
      },
    };
  }
}
