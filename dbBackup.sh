#!/bin/bash

# MySQL配置
DB_USER="root"
DB_PASS="Feline-MySQL-Password"
DB_NAME="feline_blog"
BACKUP_DIR="./dbBackup"


# 生成备份文件名
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_${DATE}.sql"

# 执行备份
mysqldump -u$DB_USER -p$DB_PASS $DB_NAME > $BACKUP_FILE

# 压缩备份文件
gzip $BACKUP_FILE

# 删除30天前的备份
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete

echo "备份完成: ${BACKUP_FILE}.gz"