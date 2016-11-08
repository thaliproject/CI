#!/usr/bin/env bash

### START - JXcore Test Server --------
### Testing environment prepares separate packages for each node.
### Package builder calls this script with each node's IP address
### Make sure multiple calls to this script file compiles the application file

NORMAL_COLOR='\033[0m'
RED_COLOR=''

OUTPUT() {
  echo -e "${RED_COLOR}$BASH_COMMAND CI FAILED - clone.sh failure${NORMAL_COLOR}"
}

set -euo pipefail
trap OUTPUT ERR

### END - JXcore Test Server   --------

cd Github
rm -rf testBuildOrg
scp -r pi@192.168.1.150:~/Repo/{{REPOSITORY}} .
mv {{REPOSITORY}} testBuildOrg
cd testBuildOrg
git checkout master
git checkout {{TARGET_BRANCH}}
git checkout {{BRANCH_NAME}}
git merge {{TARGET_BRANCH}} --no-edit
cd ..
