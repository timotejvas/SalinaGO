#!/bin/sh
# Makes this Mac run `npm run data:update` every hour, and once when you log in: the timetable
# is then downloaded and built again soon after KORDIS publishes a new one (see
# scripts/update-data.mjs). It runs in the background (launchd); what it did is in
# ~/Library/Logs/salinago-update.log, and a notification says when the timetable changed or the
# update failed. Docker must be running for the build; when it is not, the next hour tries again.
#
# Run from the frontend/ folder:  sh scripts/macos/schedule-update.sh            (switch on)
#                                 sh scripts/macos/schedule-update.sh --remove   (switch off)

set -e
if [ ! -f scripts/update-data.mjs ]; then
  echo "Run this from the frontend/ folder." >&2
  exit 1
fi
LABEL="cz.salinago.update-data"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/salinago-update.log"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
if [ "$1" = "--remove" ]; then
  rm -f "$PLIST"
  echo "The hourly update is switched off."
  exit 0
fi

NODE="$(command -v node)"
if [ -z "$NODE" ]; then
  echo "node not found; run this from a terminal where node works." >&2
  exit 1
fi

# launchd starts programs with almost no PATH: the one of this terminal is written into the job,
# so that it finds node, unzip and docker as you do here
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>scripts/update-data.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>$(pwd)</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>$PATH</string></dict>
  <key>StartInterval</key><integer>3600</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST

launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "The update runs every hour. Log: $LOG"
