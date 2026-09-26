#!/usr/bin/env bash
# Pulls the current app back out of the environment into source form:
# export solution -> pac solution unpack -> pac canvas unpack. Run after editing the
# app in Power Apps Studio so the change shows up as a reviewable diff.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="kyc_kycreviewqueue_7c2e1"
BUILD_DIR="$HERE/build"
ZIP="$BUILD_DIR/KYCReviewQueue.export.zip"

mkdir -p "$BUILD_DIR"
rm -f "$ZIP"
pac solution export --name KYCReviewQueue --path "$ZIP" --managed false
pac solution unpack --zipfile "$ZIP" --folder "$HERE/solution" --packagetype Unmanaged --allowDelete --allowWrite --clobber
rm -rf "$HERE/canvas-app"
pac canvas unpack --msapp "$HERE/solution/CanvasApps/${APP_NAME}_DocumentUri.msapp" \
  --sources "$HERE/canvas-app" --layout Experimental
