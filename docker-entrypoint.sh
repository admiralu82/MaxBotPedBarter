#!/bin/sh
set -e

# Каталог данных может быть примонтирован снаружи (пустым) —
# создаём структуру и разворачиваем в него актуальную сборку SPA из образа.
mkdir -p "$BASE_DIR/app" "$BASE_DIR/files" "$BASE_DIR/logs"

if [ -d /opt/maxapp-dist ]; then
    cp -a /opt/maxapp-dist/. "$BASE_DIR/app/"
fi

exec "$@"
