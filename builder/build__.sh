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
    LOG $RED_COLOR "build aborted\n"
    exit -1
  fi
}
### END - JXcore Test Server   --------

cd Github;ERROR_ABORT
rm -rf testBuild;ERROR_ABORT
cp -r testBuildOrg/ testBuild;
cd testBuild;ERROR_ABORT
chmod +x {{BUILD_SCRIPT_PATH}};ERROR_ABORT
{{BUILD_SCRIPT}};ERROR_ABORT

