#!/bin/sh
set -e

# Каталог данных может быть примонтирован снаружи (пустым) —
# создаём структуру и разворачиваем в него актуальную сборку SPA из образа.
mkdir -p "/app"

if [ -d /opt/maxapp-dist ]; then
    cp -a /opt/maxapp-dist/. "/app/"
fi

exec "$@"
