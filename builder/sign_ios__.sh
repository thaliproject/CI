#!/usr/bin/env bash

### START - JXcore Test Server --------
### Testing environment prepares separate packages for each node.
### Package builder calls this script with each node's IP address
### Make sure multiple calls to this script file compiles the application file

NORMAL_COLOR='\033[0m'
RED_COLOR=''

OUTPUT() {
  echo -e "${RED_COLOR}$BASH_COMMAND CI FAILED - sign_ios.sh failure${NORMAL_COLOR}"
}

set -euo pipefail
trap OUTPUT ERR

### END - JXcore Test Server   --------

ssh thali@192.168.1.20 'bash -s' < pack_ios.sh
cd build_ios
scp thali@192.168.1.20:~/Github/testBuild/ios.tar.gz ios_{{BUILD_PR_ID}}.tar.gz
tar -zxvf ios_{{BUILD_PR_ID}}.tar.gz
