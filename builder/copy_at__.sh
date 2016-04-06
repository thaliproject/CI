#!/usr/bin/env bash
### START - JXcore Test Server --------
### Testing environment prepares separate packages for each node.
### Package builder calls this script with each node's IP address
### Make sure multiple calls to this script file compiles the application file

NORMAL_COLOR='\033[0m'
RED_COLOR=''
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
    LOG $RED_COLOR "copy android tests aborted\n"
    exit -1
  fi
}
### END - JXcore Test Server   --------

ssh thali@192.168.1.20 'bash -s' < pack_at.sh;ERROR_ABORT
scp thali@192.168.1.20:~/Github/testBuild/android.apk build_android/android_{{BUILD_INDEX}}_{{BUILD_PR_ID}}.apk;ERROR_ABORT