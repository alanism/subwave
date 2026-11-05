#!/usr/bin/env sh
# Keep this launcher beside the AppImage. Extract-and-run works with or
# without FUSE, including the Linux system used to verify this release.
set -eu
SUBWAVE_LAUNCH_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "$SUBWAVE_LAUNCH_DIR/Subwave-1.0.0-linux-x86_64.AppImage" --appimage-extract-and-run "$@" > /dev/null
