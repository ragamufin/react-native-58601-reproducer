#!/bin/zsh
# usage: variant.sh <label> <seconds> '<json>'   -> writes config.json, lets the loop run, prints the counts
cd "$(dirname $0)"
echo "$3" > config.json
sleep 4
./loop.sh $2 "$1 $(echo $3 | tr -d '\n\t ')"
