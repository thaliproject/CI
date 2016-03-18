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
    rm -rf runServerRemote.sh
    LOG "One or more Android tests are failed.\n"
    exit -1
  fi
}
### END - JXcore Test Server   --------

scp -r $1 pi@192.168.1.150:~/Test/;ERROR_ABORT
scp ______.js $2;ERROR_ABORT
ssh pi@192.168.1.150 'bash -s' < runServerRemote.sh;ERROR_ABORT
rm runServerRemote.sh;ERROR_ABORT