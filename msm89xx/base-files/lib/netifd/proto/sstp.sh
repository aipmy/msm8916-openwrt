#!/bin/sh

[ -x /usr/bin/sstpc ] || exit 0

[ -n "$INCLUDE_ONLY" ] || {
	. /lib/functions.sh
	. ../netifd-proto.sh
	init_proto "$@"
}

proto_sstp_init_config() {
	proto_config_add_string "server"
	proto_config_add_string "port"
	proto_config_add_string "username"
	proto_config_add_string "password"
	proto_config_add_string "pppd_options"
	proto_config_add_string "sstp_options"
	proto_config_add_int "log_level"
	proto_config_add_int "mtu"
	proto_config_add_boolean "ipv6"
	proto_config_add_boolean "defaultroute"
	proto_config_add_boolean "peerdns"
	available=1
	no_device=1
}

proto_sstp_setup() {
	local config="$1"; shift
	local iface="$2"
	local ifname="sstp-$config"

	export OPENSSL_MODULES=/usr/lib/ossl-modules

	local ip serv_addr server port ipv6 defaultroute peerdns
	json_get_var server server && {
		for ip in $(resolveip -t 5 "$server"); do
			( proto_add_host_dependency "$config" "$ip" )
			serv_addr=1
		done
	}
	[ -n "$serv_addr" ] || {
		echo "Could not resolve server address"
		sleep 5
		proto_setup_failed "$config"
		exit 1
	}

	json_get_vars port username password pppd_options sstp_options log_level ipv6 defaultroute peerdns

	[ -n "$mtu" ] || json_get_var mtu mtu
	[ -n "$log_level" ] || log_level=0

	for module in slhc ppp_generic ppp_async ppp_mppe ip_gre gre pptp; do
		grep -q "^$module " /proc/modules && continue
		/sbin/insmod $module 2>&- >&-
	done

	proto_run_command "$config" sstpc \
		--speed 115200 \
		--cert-warn \
		--password "$password" \
		--user "$username" \
		--log-level "$log_level" \
		--save-server-route \
		--ipparam "$config" \
		$sstp_options \
		"$server${port:+:$port}" \
		ifname "$ifname" \
		ipparam "$config" \
		require-mschap-v2 \
		refuse-pap \
		noauth \
		nodefaultroute \
		${peerdns:+usepeerdns} \
		ip-up-script /lib/netifd/ppp-up \
		ip-down-script /lib/netifd/ppp-down \
		${mtu:+mtu $mtu mru $mtu} \
		$pppd_options
}

proto_sstp_teardown() {
	local interface="$1"
	proto_kill_command "$interface"
}

[ -n "$INCLUDE_ONLY" ] || {
	add_protocol sstp
}
