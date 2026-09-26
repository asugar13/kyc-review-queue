#!/usr/bin/env bash
# Rebuilds the canvas app .msapp from powerapps/canvas-app, packs the Dataverse
# solution and imports it into the environment selected by `pac auth`.
#
#   pac auth create --url https://<env>.crm11.dynamics.com --applicationId "$PP_CLIENT_ID" \
#     --clientSecret "$PP_CLIENT_SECRET" --tenant "$PP_TENANT_ID" --accept-cleartext-caching
#   powerapps/scripts/deploy.sh            # pack + import + publish
#   powerapps/scripts/deploy.sh --no-import
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="kyc_kycreviewqueue_7c2e1"
SOLUTION_DIR="$HERE/solution"
MSAPP="$SOLUTION_DIR/CanvasApps/${APP_NAME}_DocumentUri.msapp"
BUILD_DIR="$HERE/build"
ZIP="$BUILD_DIR/KYCReviewQueue.zip"

mkdir -p "$BUILD_DIR"
rm -f "$ZIP"

# Experimental layout: the msapp generated here is structure version 2.0, which the
# SourceCode layout in pac 2.12 refuses to unpack, so the source is kept in the
# Experimental layout on both sides of the round trip.
pac canvas pack --sources "$HERE/canvas-app" --msapp "$MSAPP" --layout Experimental --overwrite
pac solution pack --folder "$SOLUTION_DIR" --zipfile "$ZIP" --packagetype Unmanaged

if [[ "${1:-}" == "--no-import" ]]; then
  echo "Built $ZIP"
  exit 0
fi

pac solution import --path "$ZIP" --publish-changes --force-overwrite --async
