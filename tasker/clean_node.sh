#!/usr/bin/env bash

rm -rf node.config
rm -rf result.json
rm -rf console.json
sudo pkill adb
sudo adb devices
sudo pkill jx