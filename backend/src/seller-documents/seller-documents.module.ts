import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SellerDocument } from './seller-document.entity';
import { SellerDocumentsService } from './seller-documents.service';
import { SellerDocumentsController } from './seller-documents.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SellerDocument]),
    UsersModule,
  ],
  providers: [SellerDocumentsService],
  controllers: [SellerDocumentsController],
  exports: [SellerDocumentsService],
})
export class SellerDocumentsModule {}
