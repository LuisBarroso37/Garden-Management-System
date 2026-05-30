#!/bin/sh
set -e

echo "Running database migrations..."
node dist/db/migrate.js

echo "Starting application..."
exec node dist/server.js
