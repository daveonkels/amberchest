#!/bin/sh
# Run only after the approved frozen Socket install, build, tests and audit.
set -eu
DESTINATION=${1:?Usage: deploy/build-context.sh /absolute/new/build-context}
[ ! -e "$DESTINATION" ] || { echo 'Destination must not exist' >&2; exit 1; }
mkdir -p "$DESTINATION"
sfw pnpm --filter @amberchest/server deploy --prod "$DESTINATION/runtime" --offline --ignore-scripts
cp -R packages/web/dist "$DESTINATION/web"
cp deploy/Dockerfile deploy/snapshot.mjs "$DESTINATION/"
# Production never needs browser source maps.
find "$DESTINATION/web" -name '*.map' -delete
