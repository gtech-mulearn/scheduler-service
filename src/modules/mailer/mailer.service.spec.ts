import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailerService } from './mailer.service';

describe('MailerService', () => {
  let service: MailerService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailerService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                SMTP_HOST: 'smtp.test.com',
                SMTP_PORT: '587',
                SMTP_USER: 'test-user',
                SMTP_PASSWORD: 'test-password',
                SMTP_FROM: 'noreply@mulearn.app',
                SMTP_SECURE: 'false',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<MailerService>(MailerService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should initialize transporter on module init', () => {
    service.onModuleInit();
    expect(configService.get).toHaveBeenCalledWith('SMTP_HOST');
  });

  it('should gracefully handle sending without transporter', async () => {
    const uninitService = new MailerService({ get: () => undefined } as any);
    const result = await uninitService.sendMail({
      to: 'user@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Transporter not configured');
  });
});
