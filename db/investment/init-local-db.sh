#!/bin/zsh
set -euo pipefail

# 在本机创建并初始化 investment SQLite 数据库。
# 这个脚本只依赖系统自带 sqlite3，适合当前本地环境快速落库。

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DATA_DIR="$REPO_ROOT/investment/data"

DB_PATH="$DATA_DIR/investment.sqlite3"
SCHEMA_PATH="$SCRIPT_DIR/schema.sql"
SEED_PATH="$SCRIPT_DIR/seed.local.sql"

mkdir -p "$DATA_DIR"

sqlite3 "$DB_PATH" < "$SCHEMA_PATH"
sqlite3 "$DB_PATH" < "$SEED_PATH"

echo "initialized local investment db: $DB_PATH"
