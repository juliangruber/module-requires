#!/usr/bin/env bash

cd $1

pkgDeps=(node -e 'Object.keys(require("./package").dependencies || {}).join("\n")')
pkgDevDeps=(node -e 'Object.keys(require("./package").devDependencies || {}).join("\n")')
pkgAllDeps=(cat $pkgDeps $pkgAllDeps)

entries=(entry-points)

deps=(echo entries | deps --npm | filter $pkgAllDeps) &
(
  allDeps=(cat $entries $(find *.js --exclude node_modules) | uniq | deps --npm | filter $pkgAllDeps) 
  obsolete=(echo $pkgAllDeps | filter --not $allDeps | filter --not mocha --not should)
)
wait

devDeps=(echo $allDeps | filter --not $deps)

missplacedDeps=(echo $pkgDeps | filter $allDeps | filter --not $deps)
missplacedDevDeps=(echo $pkgDevDeps | filter $allDeps | filter --not $devDeps)

