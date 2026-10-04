#!/bin/sh
# Dedicated rules only; never flush or replace the host firewall.
set -eu
IP=172.30.84.2
CHAIN=AMBERCHEST_PRIVATE
iptables -w -N "$CHAIN" 2>/dev/null || true
iptables -w -C "$CHAIN" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT 2>/dev/null || iptables -w -A "$CHAIN" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -w -C "$CHAIN" -d 172.30.84.3 -p tcp --dport 993 -j ACCEPT 2>/dev/null || iptables -w -A "$CHAIN" -d 172.30.84.3 -p tcp --dport 993 -j ACCEPT
iptables -w -C "$CHAIN" -j REJECT 2>/dev/null || iptables -w -A "$CHAIN" -j REJECT
iptables -w -C DOCKER-USER -s "$IP/32" -j "$CHAIN" 2>/dev/null || iptables -w -I DOCKER-USER 1 -s "$IP/32" -j "$CHAIN"
iptables -w -C INPUT -s "$IP/32" -j "$CHAIN" 2>/dev/null || iptables -w -I INPUT 1 -s "$IP/32" -j "$CHAIN"
# Docker 28 need not enable br_netfilter. Filter this source on the bridge
# directly instead of changing global bridge filtering for unrelated apps.
nft list table bridge amberchest_private >/dev/null 2>&1 || nft add table bridge amberchest_private
nft -f - <<'RULES'
flush table bridge amberchest_private
add chain bridge amberchest_private forward { type filter hook forward priority -200; policy accept; }
add rule bridge amberchest_private forward ip saddr 172.30.84.2 ct state established,related accept
add rule bridge amberchest_private forward ip saddr 172.30.84.2 ip daddr 172.30.84.3 tcp dport 993 accept
add rule bridge amberchest_private forward ip saddr 172.30.84.2 drop
RULES
