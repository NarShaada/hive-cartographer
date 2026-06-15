#!/usr/bin/env bash
# Build the distributable module zip (runtime files only).
set -euo pipefail
cd "$(dirname "$0")/.."
rm -f hive-cartographer.zip
zip -r hive-cartographer.zip \
  module.json scripts styles templates lang \
  -x '*/.DS_Store'
echo "Built hive-cartographer.zip"
