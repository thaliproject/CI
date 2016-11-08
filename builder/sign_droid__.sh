#!/usr/bin/env bash

### START - JXcore Test Server --------
### Testing environment prepares separate packages for each node.
### Package builder calls this script with each node's IP address
### Make sure multiple calls to this script file compiles the application file

NORMAL_COLOR='\033[0m'
RED_COLOR=''

OUTPUT() {
  echo -e "${RED_COLOR}$BASH_COMMAND CI FAILED - sign_android.sh failure${NORMAL_COLOR}"
}

set -euo pipefail
trap OUTPUT ERR

### END - JXcore Test Server   --------

scp my-release-key.keystore thali@192.168.1.20:~/Github/testBuild/
ssh thali@192.168.1.20 'bash -s' < pack_android.sh
scp thali@192.168.1.20:~/Github/testBuild/android.apk build_android/android_{{BUILD_INDEX}}_{{BUILD_PR_ID}}.apk
