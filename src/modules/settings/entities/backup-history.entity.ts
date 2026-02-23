import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';

@Entity('backup_history')
export class BackupHistory {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'file_name', type: 'varchar', length: 255 })
    fileName: string;

    @Column({ type: 'varchar', length: 50 })
    status: string; // 'success' | 'failed'

    @Column({ type: 'varchar', length: 50 })
    type: string; // 'manual' | 'daily' | 'weekly' | 'monthly'

    @Column({ name: 'error_message', type: 'text', nullable: true })
    errorMessage: string | null;

    @Column({ name: 'file_size_bytes', type: 'bigint', nullable: true })
    fileSizeBytes: number | null;

    @Column({ name: 'download_url', type: 'varchar', nullable: true })
    downloadUrl: string | null;

    @Column({ name: 'bunnycdn_file_path', type: 'varchar', nullable: true })
    bunnyCDNFilePath: string | null;

    @Column({ name: 'is_deleted_from_storage', type: 'boolean', default: false })
    isDeletedFromStorage: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
