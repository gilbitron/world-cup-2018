#!/bin/bash

mkdir icon.iconset
sips -z 32 32   icon-32.png --out icon.iconset/icon_32x32.png
sips -z 64 64   icon-64.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128 icon-128.png --out icon.iconset/icon_128x128.png
sips -z 256 256 icon-256.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256 icon-256.png --out icon.iconset/icon_256x256.png
sips -z 512 512 icon-512.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512 icon-512.png --out icon.iconset/icon_512x512.png
cp icon-1024.png icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset
rm -R icon.iconset
