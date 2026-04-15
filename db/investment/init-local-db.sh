#!/bin/zsh
set -euo pipefail

# 在本机创建并初始化 investment SQLite 数据库。
# 这个脚本只依赖系统自带 sqlite3，适合当前本地环境快速落库。

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
INVESTMENT_ENV="${INVESTMENT_ENV:-prod}"
if [[ "$INVESTMENT_ENV" != "prod" && "$INVESTMENT_ENV" != "test" ]]; then
  echo "Invalid INVESTMENT_ENV: $INVESTMENT_ENV. Expected prod or test." >&2
  exit 1
fi

if [[ "$INVESTMENT_ENV" == "test" ]]; then
  DATA_DIR="$REPO_ROOT/investment/runtime/test/data"
  KNOWLEDGE_PREFIX="investment/runtime/test/knowledge/"
else
  DATA_DIR="$REPO_ROOT/investment/data"
  KNOWLEDGE_PREFIX="investment/knowledge/"
fi

DB_PATH="$DATA_DIR/investment.sqlite3"
SCHEMA_PATH="$SCRIPT_DIR/schema.sql"
SEED_PATH="$SCRIPT_DIR/seed.local.sql"

mkdir -p "$DATA_DIR"

sqlite3 "$DB_PATH" < "$SCHEMA_PATH"
if [[ "$INVESTMENT_ENV" == "test" ]]; then
  sed "s#investment/knowledge/#$KNOWLEDGE_PREFIX#g" "$SEED_PATH" | sqlite3 "$DB_PATH"
else
  sqlite3 "$DB_PATH" < "$SEED_PATH"
fi

echo "initialized local investment db: $DB_PATH"
