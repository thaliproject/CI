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
    LOG $RED_COLOR "sign ios aborted\n"
    exit -1
  fi
}
### END - JXcore Test Server   --------

ssh thali@192.168.1.20 'bash -s' < pack_ios.sh ;ERROR_ABORT
cd build_ios
scp thali@192.168.1.20:~/Github/testBuild/ios.tar.gz ios_{{BUILD_PR_ID}}.tar.gz ;ERROR_ABORT
tar -zxvf ios_{{BUILD_PR_ID}}.tar.gz ;ERROR_ABORT
