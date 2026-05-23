#!/bin/bash


scp -r app/* pi@ha.local:/home/pi/test-app/app
ssh pi@ha.local sudo systemctl restart test-app
