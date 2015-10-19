#!/usr/bin/env bash
### START - JXcore Test Server --------
### Testing environment prepares separate packages for each node.
### Package builder calls this script with each node's IP address
### Make sure multiple calls to this script file compiles the application file

NORMAL_COLOR='\033[0m'
RED_COLOR='\033[0;31m'
GREEN_COLOR='\033[0;32m'
GRAY_COLOR='\033[0;37m'

LOG() {
  COLOR="$1"
  TEXT="$2"
  echo -e "${COLOR}$TEXT ${NORMAL_COLOR}"
}


ERROR_ABORT() {
  if [[ $? != 0 ]]
  then
    LOG $RED_COLOR "compilation aborted\n"
    exit -1
  fi
}
### END - JXcore Test Server   --------
rm -rf node.config
echo "ACTIVE" > node.config
ERROR_ABORT
rm -rf test
ERROR_ABORT
mkdir -p test/builder/builds/{{PR_ID}}/build_android/
ERROR_ABORT
mkdir -p test/tasker
ERROR_ABORT
sudo adb kill-server
sudo adb devices -l