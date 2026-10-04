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
