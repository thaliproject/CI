#!/usr/bin/env bash

### START - JXcore Test Server --------
### Testing environment prepares separate packages for each node.
### Package builder calls this script with each node's IP address
### Make sure multiple calls to this script file compiles the application file

NORMAL_COLOR='\033[0m'
RED_COLOR=''

OUTPUT() {
  echo -e "${RED_COLOR}$BASH_COMMAND CI FAILED - pack_android.sh failure${NORMAL_COLOR}"
}

set -euo pipefail
trap OUTPUT ERR

### END - JXcore Test Server   --------

cd Github/testBuild
jx -e "var fs=require('fs');var x = fs.existsSync('{{BUILD_PATH}}'); if (!x) console.error('Could not find the application path. Check build location on mobile_test.json');process.exit(x ? 0 : 1)"
cp {{BUILD_PATH}} android-unaligned.apk
jarsigner -verbose -sigalg SHA1withRSA -digestalg SHA1 -storepass asddsa -keypass asddsa -keystore my-release-key.keystore android-unaligned.apk alias_name
zipalign -v 4 android-unaligned.apk android.apk
