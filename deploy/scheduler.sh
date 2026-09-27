#!/bin/sh
# Runs inside the scheduler container. Checks every 5 minutes (times in UTC):
#   01:00 UTC = 06:30 India time: daily jobs (reminders, autopay, risk scores, device sync…)
#   20:30 UTC = 02:00 India time: backup of the database and member files, keeping KEEP_DAYS days
set -u
mkdir -p /backups
state=/backups/.state
touch "$state"
last() { grep "^$1=" "$state" | cut -d= -f2; }
mark() { grep -v "^$1=" "$state" > "$state.tmp"; echo "$1=$2" >> "$state.tmp"; mv "$state.tmp" "$state"; }

while true; do
  day=$(date -u +%F)
  hm=$(date -u +%H%M)
  if [ "$hm" -ge 0100 ] && [ "$(last jobs)" != "$day" ]; then
    if wget -q -O /backups/last-jobs.json --header "Authorization: Bearer $CRON_SECRET" http://app:3000/api/jobs/daily; then
      mark jobs "$day"; echo "$(date -u) daily jobs done"
    else
      echo "$(date -u) daily jobs failed; retrying in 5 minutes"
    fi
  fi
  if [ "$hm" -ge 2030 ] && [ "$(last backup)" != "$day" ]; then
    f="/backups/fitron-$(date -u +%Y%m%d-%H%M)"
    if pg_dump -h db -U fitron -d fitron -Fc -f "$f.dump" && tar -czf "$f-files.tar.gz" -C /data storage; then
      mark backup "$day"; echo "$(date -u) backup written: $f"
      find /backups -name 'fitron-*' -mtime +"$KEEP_DAYS" -delete
    else
      rm -f "$f.dump" "$f-files.tar.gz"; echo "$(date -u) backup failed; retrying in 5 minutes"
    fi
  fi
  sleep 300
done
