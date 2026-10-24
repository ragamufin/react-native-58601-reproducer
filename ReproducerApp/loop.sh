#!/bin/zsh
# usage: loop.sh <seconds> <label>
# Lets the self-reloading app run for <seconds> on the booted simulator. Every reload bumps a counter kept in
# NSUserDefaults; a crash is the app process disappearing, after which the script relaunches it.
BID=dev.repro58601.rn
SECS=${1:-60}; LABEL=${2:-run}
plist() { plutil -extract iteration raw "$(xcrun simctl get_app_container booted $BID data)/Library/Preferences/$BID.plist" 2>/dev/null || echo 0; }
alive() { xcrun simctl spawn booted launchctl list 2>/dev/null | grep -q "UIKitApplication:$BID"; }
reports() { ls ~/Library/Logs/DiagnosticReports 2>/dev/null | grep -c "^ReproducerApp.*ips"; }
start=$(date "+%Y-%m-%d %H:%M:%S")
xcrun simctl launch booted $BID >/dev/null 2>&1; sleep 5
i0=$(plist); r0=$(reports); crashes=0; end=$((SECONDS+SECS))
while [ $SECONDS -lt $end ]; do
  sleep 1
  if ! alive; then crashes=$((crashes+1)); sleep 2; xcrun simctl launch booted $BID >/dev/null 2>&1; sleep 3; fi
done
i1=$(plist); r1=$(reports)
sleep 2
attempts=$(xcrun simctl spawn booted log show --start "$start" --predicate 'process == "ReproducerApp"' --info --debug 2>/dev/null | grep -ac "R58601] reload() attempt")
echo "$LABEL: ${SECS}s loads=$((i1-i0)) attempts_in_log=$attempts crashes=$crashes crashes_per_load=$(( (i1-i0)>0 ? 100*crashes/(i1-i0) : 0 ))%"
