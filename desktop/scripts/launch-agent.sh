#!/bin/sh
set -eu
SUBWAVE_AGENT_PATH=$(readlink -f -- "$0")
SUBWAVE_AGENT_DIR=$(CDPATH= cd -- "$(dirname -- "$SUBWAVE_AGENT_PATH")" && pwd)
export ELECTRON_RUN_AS_NODE=1
exec "$SUBWAVE_AGENT_DIR/subwave" "$SUBWAVE_AGENT_DIR/resources/service/agent.cjs" "$@"
