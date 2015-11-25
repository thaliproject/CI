#!/usr/bin/env bash

rm -rf node.config
sudo pkill adb
sudo adb devices
sleep 1;
sudo pkill jx