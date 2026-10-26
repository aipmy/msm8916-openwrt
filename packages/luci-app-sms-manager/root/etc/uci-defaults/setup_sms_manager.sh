#!/bin/sh
# 
# Copyright 2026 Rafał Wabik (IceG) - From eko.one.pl forum
# Licensed to the GNU General Public License v3.0.
#

chmod +x /sbin/sms_m_led.sh >/dev/null 2>&1 &
chmod +x /sbin/sms_manager_led.sh >/dev/null 2>&1 &
chmod +x /etc/uci-defaults/off_sms_manager.sh >/dev/null 2>&1 &
chmod +x /etc/uci-defaults/setup_sms_manager.sh >/dev/null 2>&1 &
chmod +x /etc/init.d/sms_manager >/dev/null 2>&1 &

chmod +x /usr/libexec/rpcd/sms_manager_sms_forward >/dev/null 2>&1 &

uci -q batch << 'EOF'
set sms_manager.@sms_manager[0].readport='/org/freedesktop/ModemManager1/Modem/0'
set sms_manager.@sms_manager[0].sendport='/org/freedesktop/ModemManager1/Modem/0'
set sms_manager.@sms_manager[0].ussdport='/org/freedesktop/ModemManager1/Modem/0'
set sms_manager.@sms_manager[0].atport='/org/freedesktop/ModemManager1/Modem/0'
set sms_manager.@sms_manager[0].pnumber='+62'
EOF
uci -q commit sms_manager

rm -rf /tmp/luci-indexcache >/dev/null 2>&1 &
rm -rf /tmp/luci-modulecache/ >/dev/null 2>&1 &
exit 0
