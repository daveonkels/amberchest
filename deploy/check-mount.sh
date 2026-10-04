#!/bin/sh
set -eu
: "${AMBERCHEST_MOUNT:?Required NAS mountpoint}"
: "${AMBERCHEST_MOUNT_SOURCE:?Required exact NAS source}"
: "${AMBERCHEST_ARCHIVE_PATH:?Required archive directory}"
# Fail closed before any container can bind an underlying local directory.
TYPE=$(findmnt -n -o FSTYPE --target "$AMBERCHEST_MOUNT")
[ "$TYPE" = nfs ] || [ "$TYPE" = nfs4 ]
[ "$(findmnt -n -o SOURCE --target "$AMBERCHEST_MOUNT")" = "$AMBERCHEST_MOUNT_SOURCE" ]
[ -d "$AMBERCHEST_ARCHIVE_PATH" ]
