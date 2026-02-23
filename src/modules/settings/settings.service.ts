import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSettings } from './entities/user-settings.entity';
import { SystemSettings } from './entities/system-settings.entity';
import {
  UpdateNotificationSettingsDto,
  CreateSystemSettingDto,
  UpdateSystemSettingDto,
} from './dto/settings.dto';
import { Cron } from '@nestjs/schedule';
import { BackupHistory } from './entities/backup-history.entity';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';

const execAsync = promisify(exec);

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(UserSettings)
    private readonly userSettingsRepository: Repository<UserSettings>,
    @InjectRepository(SystemSettings)
    private readonly systemSettingsRepository: Repository<SystemSettings>,
    @InjectRepository(BackupHistory)
    private readonly backupHistoryRepository: Repository<BackupHistory>,
  ) { }

  // ============================================================================
  // User Notification Settings
  // ============================================================================

  async getUserSettings(userId: string): Promise<UserSettings> {
    let settings = await this.userSettingsRepository.findOne({
      where: { user_id: userId },
    });

    // Create default settings if not exists
    if (!settings) {
      settings = this.userSettingsRepository.create({
        user_id: userId,
        notify_new_customers: true,
        notify_payments: true,
        notify_investments: true,
        notify_stock_activity: true,
        notify_system_alerts: true,
        notify_email: false,
      });
      await this.userSettingsRepository.save(settings);
    }

    return settings;
  }

  async updateUserSettings(
    userId: string,
    updateDto: UpdateNotificationSettingsDto,
  ): Promise<UserSettings> {
    let settings = await this.userSettingsRepository.findOne({
      where: { user_id: userId },
    });

    if (!settings) {
      // Create with provided values
      settings = this.userSettingsRepository.create({
        user_id: userId,
        ...updateDto,
      });
    } else {
      // Update existing
      Object.assign(settings, updateDto);
    }

    return this.userSettingsRepository.save(settings);
  }

  // ============================================================================
  // System Settings
  // ============================================================================

  async getAllSystemSettings(): Promise<SystemSettings[]> {
    return this.systemSettingsRepository.find({
      order: { category: 'ASC', key: 'ASC' },
    });
  }

  async getSystemSettingsByCategory(
    category: string,
  ): Promise<SystemSettings[]> {
    return this.systemSettingsRepository.find({
      where: { category },
      order: { key: 'ASC' },
    });
  }

  async getSystemSetting(key: string): Promise<SystemSettings | null> {
    return this.systemSettingsRepository.findOne({
      where: { key },
    });
  }

  async getSystemSettingValue(
    key: string,
    defaultValue?: string,
  ): Promise<string | null> {
    const setting = await this.getSystemSetting(key);
    return setting?.value ?? defaultValue ?? null;
  }

  async setSystemSetting(
    key: string,
    value: string,
    options?: {
      type?: 'string' | 'number' | 'boolean' | 'json';
      category?: string;
      description?: string;
      is_public?: boolean;
    },
  ): Promise<SystemSettings> {
    let setting = await this.getSystemSetting(key);

    if (!setting) {
      setting = this.systemSettingsRepository.create({
        key,
        value,
        type: options?.type || 'string',
        category: options?.category,
        description: options?.description,
        is_public: options?.is_public ?? false,
      });
    } else {
      setting.value = value;
      if (options?.type) setting.type = options.type;
      if (options?.category !== undefined) setting.category = options.category;
      if (options?.description !== undefined)
        setting.description = options.description;
      if (options?.is_public !== undefined)
        setting.is_public = options.is_public;
    }

    return this.systemSettingsRepository.save(setting);
  }

  async createSystemSetting(
    dto: CreateSystemSettingDto,
  ): Promise<SystemSettings> {
    const existing = await this.getSystemSetting(dto.key);
    if (existing) {
      throw new Error(`Setting with key "${dto.key}" already exists`);
    }

    const setting = this.systemSettingsRepository.create({
      key: dto.key,
      value: dto.value,
      type: dto.type || 'string',
      category: dto.category,
      description: dto.description,
      is_public: dto.is_public ?? false,
    });

    return this.systemSettingsRepository.save(setting);
  }

  async updateSystemSetting(
    key: string,
    dto: UpdateSystemSettingDto,
  ): Promise<SystemSettings> {
    const setting = await this.getSystemSetting(key);
    if (!setting) {
      throw new NotFoundException(`Setting with key "${key}" not found`);
    }

    setting.value = dto.value;
    return this.systemSettingsRepository.save(setting);
  }

  async deleteSystemSetting(key: string): Promise<void> {
    const setting = await this.getSystemSetting(key);
    if (!setting) {
      throw new NotFoundException(`Setting with key "${key}" not found`);
    }

    await this.systemSettingsRepository.remove(setting);
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  async getBackupHistory(): Promise<BackupHistory[]> {
    return this.backupHistoryRepository.find({
      order: { createdAt: 'DESC' },
      take: 100, // Return last 100 backups
    });
  }

  async isMaintenanceMode(): Promise<boolean> {
    const value = await this.getSystemSettingValue('maintenance_mode', 'false');
    return value === 'true';
  }

  async setMaintenanceMode(enabled: boolean): Promise<SystemSettings> {
    return this.setSystemSetting('maintenance_mode', String(enabled), {
      type: 'boolean',
      category: 'system',
      description: 'Enable/disable maintenance mode',
    });
  }

  // Initialize default system settings
  async initializeDefaults(): Promise<void> {
    const defaults: CreateSystemSettingDto[] = [
      {
        key: 'maintenance_mode',
        value: 'false',
        type: 'boolean',
        category: 'system',
        description: 'Enable/disable maintenance mode',
        is_public: true,
      },
      {
        key: 'backup_frequency',
        value: 'daily',
        type: 'string',
        category: 'system',
        description: 'Auto backup frequency: daily, weekly, monthly',
      },
      {
        key: 'api_rate_limit',
        value: '100',
        type: 'number',
        category: 'api',
        description: 'API rate limit per minute',
      },
    ];

    for (const setting of defaults) {
      const existing = await this.getSystemSetting(setting.key);
      if (!existing) {
        await this.createSystemSetting(setting);
      }
    }
  }

  // Upload to BunnyCDN Storage
  private async uploadToBunnyCDN(filePath: string, fileName: string): Promise<string | null> {
    const storageZone = process.env.BUNNYCDN_STORAGE_ZONE_BACKUP;
    const accessKey = process.env.BUNNYCDN_ACCESS_KEY_BACKUP;
    const region = process.env.BUNNYCDN_REGION_BACKUP || '';
    let hostname = process.env.BUNNYCDN_HOSTNAME || 'https://storage.bunnycdn.com';

    if (!storageZone || !accessKey) {
      console.log('BunnyCDN credentials not fully configured. Skipping upload.');
      return null;
    }

    const trimmedAccessKey = accessKey.trim();

    // Just use the hostname as provided or default to the main endpoint
    // Testing showed that regional endpoints (like sg.) can return 401 while the main works fine
    const cleanHostname = hostname.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const uploadPath = `/backups/${fileName}`;
    const fullPath = `/${storageZone.trim()}${uploadPath}`;

    console.log(`Uploading to BunnyCDN: https://${cleanHostname}${fullPath}`);

    return new Promise((resolve, reject) => {
      const fileStream = fs.createReadStream(filePath);
      const options = {
        hostname: cleanHostname,
        path: fullPath,
        method: 'PUT',
        headers: {
          AccessKey: trimmedAccessKey,
          'Content-Type': 'application/octet-stream',
        },
      };

      const req = https.request(options, (res) => {
        if (res.statusCode === 201 || res.statusCode === 200) {
          resolve(fullPath);
        } else {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            reject(new Error(`BunnyCDN upload failed with status ${res.statusCode}: ${data}`));
          });
        }
      });

      req.on('error', (error) => {
        reject(error);
      });

      fileStream.pipe(req);
    });
  }

  // Delete from BunnyCDN Storage
  private async deleteFromBunnyCDN(fullPath: string): Promise<void> {
    const accessKey = process.env.BUNNYCDN_ACCESS_KEY_BACKUP;
    const region = process.env.BUNNYCDN_REGION_BACKUP || '';
    let hostname = process.env.BUNNYCDN_HOSTNAME || 'https://storage.bunnycdn.com';

    if (!accessKey) return;

    const cleanHostname = hostname.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const trimmedAccessKey = accessKey.trim();

    return new Promise((resolve, reject) => {
      const options = {
        hostname: cleanHostname,
        path: fullPath,
        method: 'DELETE',
        headers: {
          AccessKey: trimmedAccessKey,
        },
      };

      const req = https.request(options, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          reject(new Error(`BunnyCDN delete failed with status ${res.statusCode}`));
        }
      });

      req.on('error', (error) => reject(error));
      req.end();
    });
  }

  // List files in BunnyCDN backups directory
  private async listBunnyCDNBackups(): Promise<any[]> {
    const storageZone = process.env.BUNNYCDN_STORAGE_ZONE_BACKUP;
    const accessKey = process.env.BUNNYCDN_ACCESS_KEY_BACKUP;
    const region = process.env.BUNNYCDN_REGION_BACKUP || '';
    let hostname = process.env.BUNNYCDN_HOSTNAME || 'https://storage.bunnycdn.com';

    if (!storageZone || !accessKey) return [];

    const cleanHostname = hostname.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const fullPath = `/${storageZone.trim()}/backups/`;

    return new Promise((resolve, reject) => {
      const options = {
        hostname: cleanHostname,
        path: fullPath,
        method: 'GET',
        headers: {
          AccessKey: accessKey.trim(),
          Accept: 'application/json',
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              resolve([]);
            }
          } else {
            resolve([]);
          }
        });
      });

      req.on('error', () => resolve([]));
      req.end();
    });
  }

  // Cleanup old BunnyCDNs backups (Keep last 3)
  private async cleanupOldBunnyBackups(): Promise<void> {
    try {
      const storageZone = process.env.BUNNYCDN_STORAGE_ZONE_BACKUP;
      const files = await this.listBunnyCDNBackups();

      // Filter only files (not directories) and sort by DateCreated (oldest first)
      const backups = files
        .filter((f: any) => !f.IsDirectory && f.ObjectName.startsWith('phajaoinvest-backup-'))
        .sort((a: any, b: any) => new Date(a.DateCreated).getTime() - new Date(b.DateCreated).getTime());

      // If we have more than 3, delete the oldest ones
      if (backups.length > 3) {
        const toDelete = backups.slice(0, backups.length - 3);
        console.log(`Retention Policy: Deleting ${toDelete.length} old backups from BunnyCDN...`);

        for (const file of toDelete) {
          const deletePath = `/${storageZone}/backups/${file.ObjectName}`;
          try {
            await this.deleteFromBunnyCDN(deletePath);
            console.log(`✅ Deleted old backup: ${file.ObjectName}`);

            // Update database record to mark as deleted from storage
            const historyRecord = await this.backupHistoryRepository.findOne({
              where: { fileName: file.ObjectName },
            });

            if (historyRecord) {
              historyRecord.isDeletedFromStorage = true;
              await this.backupHistoryRepository.save(historyRecord);
            }
          } catch (e: any) {
            console.warn(`❌ Failed to delete old backup ${file.ObjectName}: ${e.message}`);
          }
        }
      }
    } catch (error) {
      console.error('Retention Policy Error:', error);
    }
  }

  // Generate a database backup using pg_dump, save history, and optionally upload
  async createManualBackup(type: string = 'manual'): Promise<{ downloadUrl: string; fileName: string }> {
    const host = process.env.DATABASE_HOST || 'localhost';
    const port = process.env.DATABASE_PORT || '5432';
    const user = process.env.DATABASE_USERNAME || 'postgres';
    const password = process.env.DATABASE_PASSWORD || 'password';
    const dbName = process.env.DATABASE_NAME || 'trading_db';

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `phajaoinvest-backup-${timestamp}.sql`;
    const backupDir = path.join(process.cwd(), 'backups');

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const filePath = path.join(backupDir, fileName);

    // Using pg_dump
    // Make sure postgresql-client is installed in the system/docker container
    const cmd = `PGPASSWORD="${password}" pg_dump -h ${host} -p ${port} -U ${user} -F p -f "${filePath}" ${dbName}`;

    // Create tracking log initialized to failed
    const history = this.backupHistoryRepository.create({
      fileName,
      status: 'failed',
      type,
    });
    const savedReq = await this.backupHistoryRepository.save(history);

    try {
      // Execute local pg_dump backup
      await execAsync(cmd);

      // Update sizes and metrics
      const stats = fs.statSync(filePath);
      savedReq.fileSizeBytes = stats.size;
      savedReq.downloadUrl = `/api/v1/settings/database/backup/download/${fileName}`;

      // Attempt BunnyCDN Upload
      try {
        const bunnyPath = await this.uploadToBunnyCDN(filePath, fileName);
        if (bunnyPath) {
          savedReq.bunnyCDNFilePath = bunnyPath;

          // 1. Success upload -> Delete local file to save space
          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
              console.log(`✅ Local backup file cleaned up: ${fileName}`);
            }
          } catch (cleanupErr) {
            console.warn(`Failed to delete local backup file: ${cleanupErr}`);
          }

          // 2. retention policy -> Keep only last 3 backups on Bunny
          await this.cleanupOldBunnyBackups();
        }
      } catch (bunnyError: any) {
        console.warn(`BunnyCDN Upload Warning: ${bunnyError.message}`);
        savedReq.errorMessage = (savedReq.errorMessage ? savedReq.errorMessage + ' | ' : '') + `Bunny failed: ${bunnyError.message}`;
      }

      savedReq.status = 'success';
      await this.backupHistoryRepository.save(savedReq);

      return {
        downloadUrl: savedReq.downloadUrl,
        fileName,
      };
    } catch (error: any) {
      console.error('Backup failed:', error);
      savedReq.errorMessage = error.message || 'Unknown error';
      await this.backupHistoryRepository.save(savedReq);
      throw new Error(`Database backup failed: ${error.message || 'Unknown error'}`);
    }
  }

  // Cron schedule to run at 1:00 AM every night
  @Cron('0 1 * * *')
  async handleCronBackup() {
    console.log('Running automated database backup at 1:00 AM...');

    // Check user preference for frequency
    const frequency = await this.getSystemSettingValue('backup_frequency', 'daily');

    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 is Sunday
    const dateOfMonth = today.getDate();

    // Determine if we should run the backup today based on settings configuration
    let shouldRun = false;

    if (frequency === 'daily') {
      shouldRun = true;
    } else if (frequency === 'weekly' && dayOfWeek === 0) { // Run on Sunday for weekly
      shouldRun = true;
    } else if (frequency === 'monthly' && dateOfMonth === 1) { // Run on 1st of month for monthly
      shouldRun = true;
    }

    if (shouldRun) {
      try {
        const result = await this.createManualBackup(frequency ?? 'daily');
        console.log(`✅ Automated backup successful: ${result.fileName}`);
      } catch (error) {
        console.error('❌ Automated backup failed:', error);
      }
    } else {
      console.log(`Skipping automated backup today. Configured frequency is: ${frequency}`);
    }
  }
}
