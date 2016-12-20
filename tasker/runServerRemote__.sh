#!/usr/bin/env bash

### START - JXcore Test Server --------
### Testing environment prepares separate packages for each node.
### Package builder calls this script with each node's IP address
### Make sure multiple calls to this script file compiles the application file

log_error() {
  local filename=$(basename "$0")
  local linenumber=${1}
  local code="${2:-1}"

  NORMAL_COLOR='\033[0m'
  RED_COLOR='\033[0;31m'

  echo -e "${RED_COLOR}error: command '${BASH_COMMAND}' failed with code ${code}, file '${filename}' on line ${linenumber}${NORMAL_COLOR}"
}

set -euo pipefail

trap 'log_error $LINENO' ERR

### END - JXcore Test Server   --------

cd ~/Test/{{SERVER_LOCATION}}
# I don't know the reason why it fails
# so we're skipping errors for 'sudo pkill jx'
# MUST be fixed
! sudo pkill jx
sudo jx ______.js {{TARGET}}
