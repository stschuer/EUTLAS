import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { Template, TemplateSchema } from './schemas/template.schema';
import { TemplatesService } from './templates.service';
import { TemplatesController, TenantTemplatesController } from './templates.controller';
import { SeedTemplatesService } from './seed-templates.service';
import { AdminModule } from '../admin/admin.module';
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    AdminModule,
    MongooseModule.forFeature([
      { name: Template.name, schema: TemplateSchema },
      { name: User.name, schema: UserSchema },
    ]),
    MulterModule.register({
      storage: diskStorage({
        destination: './uploads/templates',
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${file.fieldname}-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max file size
      },
    }),
  ],
  controllers: [TemplatesController, TenantTemplatesController],
  providers: [TemplatesService, SeedTemplatesService],
  exports: [TemplatesService, SeedTemplatesService],
})
export class TemplatesModule {}
