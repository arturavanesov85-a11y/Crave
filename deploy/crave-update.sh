#!/bin/bash
# Обновление CRAVE на сервере из GitHub (устанавливается как /usr/local/bin/crave-update).
# Новая версия собирается в .next-new, работающий сайт продолжает отдавать .next;
# подмена папок и перезапуск — в самом конце (около 15 секунд недоступности).
set -e
trap '[ $? -ne 0 ] && echo UPDATE-FAILED' EXIT
A=/srv/crave/app
/usr/local/bin/crave-backup || true
sudo -u crave -H bash -c "
  set -e; . /srv/crave/env.sh; cd $A
  before=\$(sha1sum package-lock.json)
  git pull --ff-only
  if [ \"\$before\" != \"\$(sha1sum package-lock.json)\" ] || [ ! -d node_modules ]; then npm ci --no-audit --no-fund; fi
  npx prisma generate >/dev/null
  # Справочник Авито обновляем раз в неделю; не получилось — работаем со старым.
  [ -n \"\$(find storage/avito-catalog.json -mtime -7 2>/dev/null)\" ] || node scripts/avito-catalog.mjs || true
  rm -rf .next-new
  NODE_OPTIONS=--max-old-space-size=1536 NEXT_DIST_DIR=.next-new npx next build
"
cd $A
rm -rf .next-old
[ -d .next ] && mv .next .next-old
mv .next-new .next
systemctl restart crave
rm -rf .next-old
sleep 8
systemctl --no-pager --lines=0 status crave | head -3
echo UPDATE-FINISHED
