import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SearchIndexesController } from './search-indexes.controller';
import { SearchIndexesService } from './search-indexes.service';
import { SearchIndex, SearchIndexSchema } from './schemas/search-index.schema';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SearchIndex.name, schema: SearchIndexSchema },
    ]),
    EventsModule,
  ],
  controllers: [SearchIndexesController],
  providers: [SearchIndexesService],
  exports: [SearchIndexesService],
})
export class SearchIndexesModule {}


