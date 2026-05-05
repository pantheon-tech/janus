#!/usr/bin/env bash
ln -s real.txt link.txt
git add link.txt
git -c user.name=fixture -c user.email=f@x.com commit -q -m "fixture: add symlink"
