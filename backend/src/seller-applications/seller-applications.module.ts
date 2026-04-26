import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SellerApplication } from './seller-application.entity';
import { SellerApplicationsService } from './seller-applications.service';
import { SellerApplicationsController } from './seller-applications.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [TypeOrmModule.forFeature([SellerApplication]), UsersModule],
  providers: [SellerApplicationsService],
  controllers: [SellerApplicationsController],
})
export class SellerApplicationsModule {}
