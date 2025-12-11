import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SchemaValidationController } from './schema-validation.controller';
import { SchemaValidationService } from './schema-validation.service';
import { CollectionSchema, CollectionSchemaSchema } from './schemas/collection-schema.schema';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CollectionSchema.name, schema: CollectionSchemaSchema },
    ]),
    AuditModule,
  ],
  controllers: [SchemaValidationController],
  providers: [SchemaValidationService],
  exports: [SchemaValidationService],
})
export class SchemaValidationModule {}



