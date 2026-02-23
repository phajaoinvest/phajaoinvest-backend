import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { UserSettings } from './entities/user-settings.entity';
import { SystemSettings } from './entities/system-settings.entity';
import { BackupHistory } from './entities/backup-history.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserSettings, SystemSettings, BackupHistory])],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule { }
