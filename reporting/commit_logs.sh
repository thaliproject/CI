#!/bin/bash

PR_C_ID="$1"

NORMAL_COLOR='\033[0m'
RED_COLOR=''
GREEN_COLOR='\033[0;32m'
GREY_COLOR='\033[0;37m'

LOG() {
    COLOR="$1"
    TEXT="$2"
    echo -e "${COLOR}$TEXT ${NORMAL_COLOR}"
}


ERROR_ABORT() {
  if [[ $? != 0 ]]
  then
    LOG $RED_COLOR "commit_logs.sh: $1\n"
    x=$(rm test)
    exit 1
  fi
}

if [ $# -gt 0 ]
then
 cd ../TestResults/
  ret=$(git add .)

  ret=$(git commit -a -m Results)

  ret=$(git push --set-upstream origin $PR_C_ID)
  ERROR_ABORT "push has failed : $ret"
else
  ERROR_ABORT "MISSING ARGUMENTS\n"
fi