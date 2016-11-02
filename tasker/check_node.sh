#!/usr/bin/env bash

LIST_OF_DEVICES=$(sudo adb devices | grep -v "List" | grep -v "adb I " | grep -v "* daemon" | cut -f 1)

for SERIAL in $LIST_OF_DEVICES; do
  echo "Device with serial: $SERIAL"
  sudo adb -s $SERIAL shell getprop | grep "product.name\|version.sdk"
  sudo adb -s $SERIAL shell uptime
  sudo adb -s $SERIAL shell pm list packages | grep "thali"
#  sudo adb -s $SERIAL shell pm uninstall com.test.thalitest
#  sudo adb -s $SERIAL reboot
  printf "\n"
done

