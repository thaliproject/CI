#!/usr/bin/env bash

rm -rf node.config
rm -rf *.json
sudo pkill adb
sudo adb devices
sudo pkill jx

sudo reboot