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
    LOG $RED_COLOR "clone aborted\n"
    exit -1
  fi
}
### END - JXcore Test Server   --------

cd Github;ERROR_ABORT
rm -rf testBuildOrg;ERROR_ABORT
scp -r pi@192.168.1.150:~/Repo/{{REPOSITORY}} .;ERROR_ABORT
mv {{REPOSITORY}} testBuildOrg;ERROR_ABORT
cd testBuildOrg;ERROR_ABORT
git checkout master;ERROR_ABORT
git checkout {{TARGET_BRANCH}};ERROR_ABORT
git checkout {{BRANCH_NAME}};ERROR_ABORT
git merge {{TARGET_BRANCH}} --no-edit;ERROR_ABORT
cd ..;ERROR_ABORT
