'use strict';
'require view';
'require dom';
'require ui';
'require uci';
'require network';
'require rpc';
'require poll';
'require fs';

var callNetworkDump = rpc.declare({
	object: 'network.interface',
	method: 'dump',
	expect: { 'interface': [] }
});

var callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	expect: {}
});

function callInterfaceUp(ifname) {
	return rpc.declare({
		object: 'network.interface.' + ifname,
		method: 'up',
		expect: {}
	})().catch(function() {
		return fs.exec('/sbin/ifup', [ ifname ]);
	});
}

function callInterfaceDown(ifname) {
	return rpc.declare({
		object: 'network.interface.' + ifname,
		method: 'down',
		expect: {}
	})().catch(function() {
		return fs.exec('/sbin/ifdown', [ ifname ]);
	});
}

var callUciCommit = rpc.declare({
	object: 'uci',
	method: 'commit',
	params: [ 'config' ],
	expect: {}
});

var callUciReloadConfig = rpc.declare({
	object: 'uci',
	method: 'reload_config',
	expect: {}
});

function commitAndApplyUCI(configs) {
	var pkgList = configs || [ 'network', 'firewall' ];
	return uci.save().then(function() {
		var tasks = pkgList.map(function(pkg) {
			return callUciCommit({ config: pkg }).catch(function() { return null; });
		});
		return Promise.all(tasks);
	}).then(function() {
		return callUciReloadConfig().catch(function() { return null; });
	}).then(function() {
		if (typeof L !== 'undefined' && L.ui && L.ui.changes) {
			return L.resolveDefault(L.ui.changes.init(), null);
		}
	});
}

function parseDevStats(content) {
	var stats = {};
	if (!content) return stats;
	var lines = content.split('\n');
	for (var i = 2; i < lines.length; i++) {
		var line = lines[i].trim();
		if (!line) continue;
		var parts = line.split(/[:\s]+/);
		if (parts.length >= 10) {
			var dev = parts[0];
			var rx = parseInt(parts[1], 10) || 0;
			var tx = parseInt(parts[9], 10) || 0;
			stats[dev] = { rx: rx, tx: tx };
		}
	}
	return stats;
}

function formatBytes(bytes) {
	if (bytes == null || isNaN(bytes)) return '0 B';
	if (bytes < 1024) return bytes + ' B';
	if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
	if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
	return (bytes / 1073741824).toFixed(2) + ' GB';
}

function formatSpeed(bytesPerSec) {
	if (bytesPerSec == null || isNaN(bytesPerSec) || bytesPerSec < 1) return '0 B/s';
	if (bytesPerSec < 1024) return Math.round(bytesPerSec) + ' B/s';
	if (bytesPerSec < 1048576) return (bytesPerSec / 1024).toFixed(1) + ' KB/s';
	return (bytesPerSec / 1048576).toFixed(2) + ' MB/s';
}

function renderSvgIcon(type) {
	var svg = '';
	if (type === 'log') {
		svg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>';
	} else if (type === 'restart') {
		svg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.19"/></svg>';
	} else if (type === 'stop') {
		svg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
	} else if (type === 'start') {
		svg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
	} else if (type === 'settings') {
		svg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
	} else if (type === 'delete') {
		svg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
	}
	var span = document.createElement('span');
	span.style.display = 'inline-flex';
	span.style.alignItems = 'center';
	span.style.justifyContent = 'center';
	span.innerHTML = svg;
	return span;
}

return view.extend({
	prevTraffic: {},
	lastPollTime: null,

	load: function() {
		return Promise.all([
			callNetworkDump(),
			L.resolveDefault(fs.read_direct('/proc/net/dev'), ''),
			callServiceList(),
			uci.load('network'),
			uci.load('firewall').catch(function() { return null; }),
			L.resolveDefault(fs.stat('/usr/sbin/openvpn'), null)
		]);
	},

	openLogsModal: function(ifname, proto) {
		var self = this;
		var pre = E('pre', {
			'style': 'margin: 0; padding: 12px 14px; background: #080c14; border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; font-family: monospace; font-size: 11px; line-height: 1.45; color: #38bdf8; max-height: 55vh; overflow-y: auto; white-space: pre-wrap; word-break: break-all;'
		}, [ E('span', { 'class': 'spinning' }, _('Fetching log entries…')) ]);

		var modal = ui.showModal(_('Tunnel Logs: ') + ifname + ' (' + (proto || '').toUpperCase() + ')', [
			E('div', { 'style': 'font-size: 12px; margin-bottom: 12px; color: var(--text-color-medium, #94a3b8); display: flex; justify-content: space-between; align-items: center;' }, [
				E('span', {}, _('Recent syslog entries for this interface & daemon.')),
				E('button', {
					'class': 'cbi-button cbi-button-neutral',
					'style': 'font-size: 11px; padding: 3px 8px; border-radius: 4px;',
					'click': function() { fetchLogs(); }
				}, _('🔄 Refresh'))
			]),
			pre,
			E('div', { 'class': 'right', 'style': 'margin-top: 16px; display: flex; justify-content: flex-end;' }, [
				E('button', {
					'class': 'cbi-button cbi-button-neutral',
					'click': ui.hideModal
				}, _('Close'))
			])
		]);

		function fetchLogs() {
			pre.innerHTML = '<span class="spinning">' + _('Loading…') + '</span>';
			fs.exec_direct('/sbin/logread', [ '-l', '350' ]).then(function(content) {
				if (!content) {
					pre.textContent = _('No log output returned from system.');
					return;
				}
				var lines = content.trim().split('\n');
				var pat = ifname.toLowerCase();
				var protoPat = (proto || '').toLowerCase();

				var filtered = lines.filter(function(line) {
					var l = line.toLowerCase();
					if (l.indexOf(pat) !== -1) return true;
					if (protoPat === 'sstp' && (l.indexOf('sstp') !== -1 || l.indexOf('pppd') !== -1)) return true;
					if (protoPat === 'pptp' && (l.indexOf('pptp') !== -1 || l.indexOf('pppd') !== -1)) return true;
					if (protoPat === 'l2tp' && (l.indexOf('l2tp') !== -1 || l.indexOf('xl2tpd') !== -1 || l.indexOf('pppd') !== -1)) return true;
					if (protoPat === 'wireguard' && (l.indexOf('wireguard') !== -1 || l.indexOf('wg') !== -1)) return true;
					if (protoPat === 'openvpn' && l.indexOf('openvpn') !== -1) return true;
					return false;
				});

				if (filtered.length === 0) {
					pre.textContent = _('No recent log entries matching "%s". Tunnel may be idle or logged under different facility.').format(ifname);
				} else {
					pre.textContent = filtered.slice(-40).join('\n');
					pre.scrollTop = pre.scrollHeight;
				}
			}).catch(function(err) {
				pre.textContent = _('Failed to read logs: ') + (err.message || err);
			});
		}

		fetchLogs();
	},

	confirmAction: function(title, message, confirmText, isDanger, onConfirm) {
		ui.showModal(title, [
			E('p', { 'style': 'margin-bottom: 20px; line-height: 1.5; font-size: 13px;' }, message),
			E('div', { 'class': 'right', 'style': 'display: flex; justify-content: flex-end; gap: 8px;' }, [
				E('button', {
					'class': 'cbi-button cbi-button-neutral',
					'click': ui.hideModal
				}, _('Cancel')),
				E('button', {
					'class': 'cbi-button ' + (isDanger ? 'cbi-button-negative' : 'cbi-button-action'),
					'click': function() {
						ui.hideModal();
						onConfirm();
					}
				}, confirmText)
			])
		]);
	},

	restartInterface: function(ifname) {
		var self = this;
		this.confirmAction(
			_('Restart Interface'),
			_('Restart VPN interface "%s"? Connection traffic will momentarily reset.').format(ifname),
			_('Restart Now'),
			false,
			function() {
				ui.showModal(null, [ E('p', { 'class': 'spinning' }, _('Restarting interface %s…').format(ifname)) ]);
				callInterfaceDown(ifname).then(function() {
					return new Promise(function(resolve) { setTimeout(resolve, 1500); });
				}).then(function() {
					return callInterfaceUp(ifname);
				}).then(function() {
					ui.hideModal();
					ui.addNotification(null, E('p', _('Interface "%s" restarted.').format(ifname)), 'success');
				}).catch(function(err) {
					ui.hideModal();
					ui.addNotification(null, E('p', _('Failed to restart interface: ') + (err.message || err)), 'error');
				});
			}
		);
	},

	toggleInterface: function(ifname, currentlyUp) {
		var self = this;
		var actionTitle = currentlyUp ? _('Stop Interface') : _('Start Interface');
		var actionMsg = currentlyUp 
			? _('Stop/disconnect VPN interface "%s"?').format(ifname)
			: _('Start/reconnect VPN interface "%s"?').format(ifname);
		var confirmBtn = currentlyUp ? _('Stop') : _('Start');

		this.confirmAction(
			actionTitle,
			actionMsg,
			confirmBtn,
			currentlyUp,
			function() {
				ui.showModal(null, [ E('p', { 'class': 'spinning' }, (currentlyUp ? _('Stopping %s…') : _('Starting %s…')).format(ifname)) ]);

				var preparePromise = Promise.resolve();
				if (!currentlyUp && uci.get('network', ifname, 'disabled') === '1') {
					uci.unset('network', ifname, 'disabled');
					preparePromise = commitAndApplyUCI([ 'network' ]);
				}

				preparePromise.then(function() {
					return currentlyUp ? callInterfaceDown(ifname) : callInterfaceUp(ifname);
				}).then(function() {
					ui.hideModal();
					ui.addNotification(null, E('p', (currentlyUp ? _('Interface "%s" stopped.') : _('Interface "%s" started.')).format(ifname)), currentlyUp ? 'info' : 'success');
				}).catch(function(err) {
					ui.hideModal();
					ui.addNotification(null, E('p', _('Failed to change interface state: ') + (err.message || err)), 'error');
				});
			}
		);
	},

	deleteInterface: function(ifname, proto) {
		var self = this;
		this.confirmAction(
			_('Delete VPN Interface'),
			_('Permanently delete VPN interface "%s"? All configuration and WAN firewall rules for this tunnel will be removed.').format(ifname),
			_('Delete Permanently'),
			true,
			function() {
				ui.showModal(null, [ E('p', { 'class': 'spinning' }, _('Deleting interface %s…').format(ifname)) ]);
				callInterfaceDown(ifname).catch(function() { return null; }).then(function() {
					try {
						uci.remove('network', ifname);

						if (proto === 'wireguard') {
							uci.sections('network', 'wireguard_' + ifname, function(s) {
								uci.remove('network', s['.name']);
							});
						}

						var zones = uci.sections('firewall', 'zone');
						for (var i = 0; i < zones.length; i++) {
							if (zones[i].name === 'wan') {
								var curNets = uci.get('firewall', zones[i]['.name'], 'network') || [];
								if (!Array.isArray(curNets)) curNets = curNets.split(/\s+/);
								var idx = curNets.indexOf(ifname);
								if (idx !== -1) {
									curNets.splice(idx, 1);
									uci.set('firewall', zones[i]['.name'], 'network', curNets);
								}
								break;
							}
						}

						return commitAndApplyUCI([ 'network', 'firewall' ]).then(function() {
							ui.hideModal();
							ui.addNotification(null, E('p', _('Interface "%s" permanently deleted.').format(ifname)), 'success');
							setTimeout(function() { window.location.reload(); }, 800);
						});
					} catch(e) {
						ui.hideModal();
						ui.addNotification(null, E('p', _('Failed to delete interface: ') + e.message), 'error');
					}
				}).catch(function(err) {
					ui.hideModal();
					ui.addNotification(null, E('p', _('Failed during interface deletion: ') + (err.message || err)), 'error');
				});
			}
		);
	},

	openQuickSetupModal: function(protoId, protoTitle) {
		var isWireGuard = (protoId === 'wireguard');

		var body = E('div', { 'style': 'font-size: 13px;' }, [
			E('p', { 'style': 'color: var(--text-color-medium, #94a3b8); margin-bottom: 16px; line-height: 1.5;' }, 
				isWireGuard 
					? _('Configure your WireGuard client interface to MikroTik / peer server.') 
					: _('MikroTik-compatible PPP Client Dial-Out setup. An uplink interface and WAN firewall zone will be attached automatically.')
			),
			E('div', { 'class': 'cbi-value', 'style': 'margin-bottom: 12px;' }, [
				E('label', { 'class': 'cbi-value-title', 'style': 'font-weight: 600; width: 35%;' }, _('Interface Name')),
				E('div', { 'class': 'cbi-value-field', 'style': 'width: 65%;' }, [
					E('input', {
						'type': 'text',
						'class': 'cbi-input-text',
						'id': 'vpn_ifname',
						'value': 'vpn_' + protoId,
						'placeholder': 'vpn_' + protoId,
						'style': 'width: 100%;'
					})
				])
			]),
			E('div', { 'class': 'cbi-value', 'style': 'margin-bottom: 12px;' }, [
				E('label', { 'class': 'cbi-value-title', 'style': 'font-weight: 600; width: 35%;' }, _('Connect To (Server / IP)')),
				E('div', { 'class': 'cbi-value-field', 'style': 'width: 65%;' }, [
					E('input', {
						'type': 'text',
						'class': 'cbi-input-text',
						'id': 'vpn_server',
						'placeholder': isWireGuard ? 'vpn.example.com:51820 or 203.0.113.10:51820' : 'vpn.example.com or 203.0.113.10',
						'style': 'width: 100%;'
					})
				])
			])
		]);

		if (protoId === 'sstp') {
			body.appendChild(E('div', { 'class': 'cbi-value', 'style': 'margin-bottom: 12px;' }, [
				E('label', { 'class': 'cbi-value-title', 'style': 'font-weight: 600; width: 35%;' }, _('Port')),
				E('div', { 'class': 'cbi-value-field', 'style': 'width: 65%;' }, [
					E('input', {
						'type': 'number',
						'class': 'cbi-input-text',
						'id': 'vpn_port',
						'value': '443',
						'placeholder': '443 or 4430',
						'style': 'width: 100%;'
					})
				])
			]));
		}

		if (isWireGuard) {
			body.appendChild(E('div', { 'class': 'cbi-value', 'style': 'margin-bottom: 12px;' }, [
				E('label', { 'class': 'cbi-value-title', 'style': 'font-weight: 600; width: 35%;' }, _('Client IP Address')),
				E('div', { 'class': 'cbi-value-field', 'style': 'width: 65%;' }, [
					E('input', {
						'type': 'text',
						'class': 'cbi-input-text',
						'id': 'vpn_client_ip',
						'placeholder': '10.50.10.50/24',
						'style': 'width: 100%;'
					})
				])
			]));
			body.appendChild(E('div', { 'class': 'cbi-value', 'style': 'margin-bottom: 12px;' }, [
				E('label', { 'class': 'cbi-value-title', 'style': 'font-weight: 600; width: 35%;' }, _('Client Private Key')),
				E('div', { 'class': 'cbi-value-field', 'style': 'width: 65%;' }, [
					E('input', {
						'type': 'password',
						'class': 'cbi-input-text',
						'id': 'vpn_privkey',
						'placeholder': 'Base64 Private Key',
						'style': 'width: 100%;'
					})
				])
			]));
			body.appendChild(E('div', { 'class': 'cbi-value', 'style': 'margin-bottom: 12px;' }, [
				E('label', { 'class': 'cbi-value-title', 'style': 'font-weight: 600; width: 35%;' }, _('MikroTik Public Key')),
				E('div', { 'class': 'cbi-value-field', 'style': 'width: 65%;' }, [
					E('input', {
						'type': 'text',
						'class': 'cbi-input-text',
						'id': 'vpn_pubkey',
						'placeholder': 'f1F7zU8lsZ7sOeOs0nBNBYr6CM7xXRCUOc/D2E8gM2M=',
						'style': 'width: 100%;'
					})
				])
			]));
			body.appendChild(E('div', { 'class': 'cbi-value', 'style': 'margin-bottom: 12px;' }, [
				E('label', { 'class': 'cbi-value-title', 'style': 'font-weight: 600; width: 35%;' }, _('Allowed IPs')),
				E('div', { 'class': 'cbi-value-field', 'style': 'width: 65%;' }, [
					E('input', {
						'type': 'text',
						'class': 'cbi-input-text',
						'id': 'vpn_allowed_ips',
						'value': '10.50.10.0/24',
						'placeholder': '10.50.10.0/24 or 0.0.0.0/0',
						'style': 'width: 100%;'
					})
				])
			]));
		} else {
			body.appendChild(E('div', { 'class': 'cbi-value', 'style': 'margin-bottom: 12px;' }, [
				E('label', { 'class': 'cbi-value-title', 'style': 'font-weight: 600; width: 35%;' }, _('User')),
				E('div', { 'class': 'cbi-value-field', 'style': 'width: 65%;' }, [
					E('input', {
						'type': 'text',
						'class': 'cbi-input-text',
						'id': 'vpn_username',
						'placeholder': 'PPP Username',
						'style': 'width: 100%;'
					})
				])
			]));
			body.appendChild(E('div', { 'class': 'cbi-value', 'style': 'margin-bottom: 12px;' }, [
				E('label', { 'class': 'cbi-value-title', 'style': 'font-weight: 600; width: 35%;' }, _('Password')),
				E('div', { 'class': 'cbi-value-field', 'style': 'width: 65%;' }, [
					E('input', {
						'type': 'password',
						'class': 'cbi-input-text',
						'id': 'vpn_password',
						'placeholder': 'PPP Password',
						'style': 'width: 100%;'
					})
				])
			]));

			body.appendChild(E('div', { 'class': 'cbi-value', 'style': 'margin-bottom: 12px;' }, [
				E('label', { 'class': 'cbi-value-title', 'style': 'font-weight: 600; width: 35%;' }, _('Keepalive Timeout (s)')),
				E('div', { 'class': 'cbi-value-field', 'style': 'width: 65%;' }, [
					E('input', {
						'type': 'number',
						'class': 'cbi-input-text',
						'id': 'vpn_keepalive',
						'value': '30',
						'placeholder': '30',
						'style': 'width: 100%;'
					})
				])
			]));

			body.appendChild(E('div', { 'class': 'cbi-value', 'style': 'margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between;' }, [
				E('label', { 'class': 'cbi-value-title', 'style': 'font-weight: 600; width: auto;' }, _('Add Default Route')),
				E('div', { 'class': 'cbi-value-field', 'style': 'width: auto; margin: 0;' }, [
					E('input', {
						'type': 'checkbox',
						'id': 'vpn_defaultroute',
						'style': 'cursor: pointer;'
					})
				])
			]));

			body.appendChild(E('div', { 'class': 'cbi-value', 'style': 'margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between;' }, [
				E('label', { 'class': 'cbi-value-title', 'style': 'font-weight: 600; width: auto;' }, _('Use Peer DNS')),
				E('div', { 'class': 'cbi-value-field', 'style': 'width: auto; margin: 0;' }, [
					E('input', {
						'type': 'checkbox',
						'id': 'vpn_peerdns',
						'style': 'cursor: pointer;'
					})
				])
			]));
		}

		var self = this;
		ui.showModal(_('MikroTik Client Setup: ') + protoTitle, [
			body,
			E('div', { 'class': 'right', 'style': 'margin-top: 20px; display: flex; justify-content: flex-end; gap: 8px;' }, [
				E('button', {
					'class': 'cbi-button cbi-button-neutral',
					'click': ui.hideModal
				}, _('Cancel')),
				E('button', {
					'class': 'cbi-button cbi-button-action',
					'click': function(ev) {
						var ifname = (document.getElementById('vpn_ifname').value || '').trim();
						var server = (document.getElementById('vpn_server').value || '').trim();

						if (!ifname) {
							ui.addNotification(null, E('p', _('Interface name is required.')), 'error');
							return;
						}
						if (!server) {
							ui.addNotification(null, E('p', _('Server address is required.')), 'error');
							return;
						}

						var sstpPort = (document.getElementById('vpn_port')?.value || '443').trim();
						var privKey = (document.getElementById('vpn_privkey')?.value || '').trim();
						var pubKey = (document.getElementById('vpn_pubkey')?.value || '').trim();
						var clientIp = (document.getElementById('vpn_client_ip')?.value || '').trim();
						var allowedIps = (document.getElementById('vpn_allowed_ips')?.value || '0.0.0.0/0').trim();

						var user = (document.getElementById('vpn_username')?.value || '').trim();
						var pass = (document.getElementById('vpn_password')?.value || '').trim();
						var keepalive = parseInt(document.getElementById('vpn_keepalive')?.value || '30', 10);
						var addDefaultRoute = document.getElementById('vpn_defaultroute')?.checked || false;
						var usePeerDns = document.getElementById('vpn_peerdns')?.checked || false;

						ui.showModal(null, [ E('p', { 'class': 'spinning' }, _('Saving VPN Interface…')) ]);

						try {
							uci.add('network', 'interface', ifname);
							uci.set('network', ifname, 'proto', protoId);
							uci.set('network', ifname, 'server', server);
							if (protoId === 'sstp') {
								uci.set('network', ifname, 'port', sstpPort);
							}
							uci.set('network', ifname, 'ipv6', '0');

							if (isWireGuard) {
								if (privKey) uci.set('network', ifname, 'private_key', privKey);
								if (clientIp) uci.set('network', ifname, 'addresses', [ clientIp ]);

								if (pubKey) {
									var peerSec = uci.add('network', 'wireguard_' + ifname, 'wgpeer_' + ifname);
									uci.set('network', peerSec, 'public_key', pubKey);
									uci.set('network', peerSec, 'route_allowed_ips', '1');
									uci.set('network', peerSec, 'allowed_ips', allowedIps.split(/\s*,\s*|\s+/));
									uci.set('network', peerSec, 'persistent_keepalive', '25');
									var parts = server.split(':');
									if (parts.length === 2) {
										uci.set('network', peerSec, 'endpoint_host', parts[0]);
										uci.set('network', peerSec, 'endpoint_port', parts[1]);
									} else {
										uci.set('network', peerSec, 'endpoint_host', server);
									}
								}
							} else {
								if (user) uci.set('network', ifname, 'username', user);
								if (pass) uci.set('network', ifname, 'password', pass);
								
								uci.set('network', ifname, 'keepalive', '5 ' + keepalive);
								uci.set('network', ifname, 'defaultroute', addDefaultRoute ? '1' : '0');
								uci.set('network', ifname, 'peerdns', usePeerDns ? '1' : '0');
							}

							var zones = uci.sections('firewall', 'zone');
							for (var i = 0; i < zones.length; i++) {
								if (zones[i].name === 'wan') {
									var curNetworks = uci.get('firewall', zones[i]['.name'], 'network') || [];
									if (!Array.isArray(curNetworks)) curNetworks = curNetworks.split(/\s+/);
									if (curNetworks.indexOf(ifname) === -1) {
										curNetworks.push(ifname);
										uci.set('firewall', zones[i]['.name'], 'network', curNetworks);
									}
									break;
								}
							}

							commitAndApplyUCI([ 'network', 'firewall' ]).then(function() {
								return callInterfaceUp(ifname).catch(function() { return null; });
							}).then(function() {
								ui.hideModal();
								ui.addNotification(null, E('p', _('VPN interface "%s" successfully created!').format(ifname)), 'success');
								setTimeout(function() { window.location.reload(); }, 800);
							}).catch(function(err) {
								ui.hideModal();
								ui.addNotification(null, E('p', _('Failed to apply configuration: ') + (err.message || err)), 'error');
							});
						} catch (e) {
							ui.hideModal();
							ui.addNotification(null, E('p', _('Error: ') + e.message), 'error');
						}
					}
				}, _('Connect & Save'))
			])
		]);
	},

	openEditModal: function(ifname, protoId) {
		var isWireGuard = (protoId === 'wireguard');
		var self = this;

		var curServer = uci.get('network', ifname, 'server') || '';
		var curPort = uci.get('network', ifname, 'port') || '443';
		var curUser = uci.get('network', ifname, 'username') || '';
		var curPass = uci.get('network', ifname, 'password') || '';
		var curKeepalive = uci.get('network', ifname, 'keepalive') || '30';
		if (typeof curKeepalive === 'string' && curKeepalive.indexOf(' ') !== -1) {
			curKeepalive = curKeepalive.split(' ').pop();
		}
		var curDefRoute = (uci.get('network', ifname, 'defaultroute') === '1');
		var curPeerDns = (uci.get('network', ifname, 'peerdns') === '1');

		var curPrivKey = '';
		var curPubKey = '';
		var curClientIp = '';
		var curAllowedIps = '0.0.0.0/0';

		if (isWireGuard) {
			curPrivKey = uci.get('network', ifname, 'private_key') || '';
			var addrs = uci.get('network', ifname, 'addresses') || [];
			curClientIp = Array.isArray(addrs) ? (addrs[0] || '') : (addrs || '');
			uci.sections('network', 'wireguard_' + ifname, function(s) {
				curPubKey = s.public_key || '';
				var aips = s.allowed_ips || [];
				curAllowedIps = Array.isArray(aips) ? aips.join(', ') : (aips || '0.0.0.0/0');
				if (s.endpoint_host) {
					curServer = s.endpoint_port ? (s.endpoint_host + ':' + s.endpoint_port) : s.endpoint_host;
				}
			});
		}

		var body = E('div', { 'style': 'font-size: 13px;' }, [
			E('p', { 'style': 'color: var(--text-color-medium, #94a3b8); margin-bottom: 16px; line-height: 1.5;' },
				_('Edit configuration parameters for VPN interface "%s" (%s).').format(ifname, (protoId || '').toUpperCase())
			),
			E('div', { 'class': 'cbi-value', 'style': 'margin-bottom: 12px;' }, [
				E('label', { 'class': 'cbi-value-title', 'style': 'font-weight: 600; width: 35%;' }, _('Interface Name')),
				E('div', { 'class': 'cbi-value-field', 'style': 'width: 65%;' }, [
					E('input', {
						'type': 'text',
						'class': 'cbi-input-text',
						'id': 'edit_vpn_ifname',
						'value': ifname,
						'disabled': true,
						'style': 'width: 100%; opacity: 0.7; cursor: not-allowed;'
					})
				])
			]),
			E('div', { 'class': 'cbi-value', 'style': 'margin-bottom: 12px;' }, [
				E('label', { 'class': 'cbi-value-title', 'style': 'font-weight: 600; width: 35%;' }, _('Connect To (Server / IP)')),
				E('div', { 'class': 'cbi-value-field', 'style': 'width: 65%;' }, [
					E('input', {
						'type': 'text',
						'class': 'cbi-input-text',
						'id': 'edit_vpn_server',
						'value': curServer,
						'placeholder': isWireGuard ? 'vpn.example.com:51820 or 203.0.113.10:51820' : 'vpn.example.com or 203.0.113.10',
						'style': 'width: 100%;'
					})
				])
			])
		]);

		if (protoId === 'sstp') {
			body.appendChild(E('div', { 'class': 'cbi-value', 'style': 'margin-bottom: 12px;' }, [
				E('label', { 'class': 'cbi-value-title', 'style': 'font-weight: 600; width: 35%;' }, _('Port')),
				E('div', { 'class': 'cbi-value-field', 'style': 'width: 65%;' }, [
					E('input', {
						'type': 'number',
						'class': 'cbi-input-text',
						'id': 'edit_vpn_port',
						'value': curPort,
						'placeholder': '443 or 4430',
						'style': 'width: 100%;'
					})
				])
			]));
		}

		if (isWireGuard) {
			body.appendChild(E('div', { 'class': 'cbi-value', 'style': 'margin-bottom: 12px;' }, [
				E('label', { 'class': 'cbi-value-title', 'style': 'font-weight: 600; width: 35%;' }, _('Client IP Address')),
				E('div', { 'class': 'cbi-value-field', 'style': 'width: 65%;' }, [
					E('input', {
						'type': 'text',
						'class': 'cbi-input-text',
						'id': 'edit_vpn_client_ip',
						'value': curClientIp,
						'placeholder': '10.50.10.50/24',
						'style': 'width: 100%;'
					})
				])
			]));
			body.appendChild(E('div', { 'class': 'cbi-value', 'style': 'margin-bottom: 12px;' }, [
				E('label', { 'class': 'cbi-value-title', 'style': 'font-weight: 600; width: 35%;' }, _('Client Private Key')),
				E('div', { 'class': 'cbi-value-field', 'style': 'width: 65%;' }, [
					E('input', {
						'type': 'password',
						'class': 'cbi-input-text',
						'id': 'edit_vpn_privkey',
						'value': curPrivKey,
						'placeholder': 'Base64 Private Key',
						'style': 'width: 100%;'
					})
				])
			]));
			body.appendChild(E('div', { 'class': 'cbi-value', 'style': 'margin-bottom: 12px;' }, [
				E('label', { 'class': 'cbi-value-title', 'style': 'font-weight: 600; width: 35%;' }, _('MikroTik Public Key')),
				E('div', { 'class': 'cbi-value-field', 'style': 'width: 65%;' }, [
					E('input', {
						'type': 'text',
						'class': 'cbi-input-text',
						'id': 'edit_vpn_pubkey',
						'value': curPubKey,
						'placeholder': 'f1F7zU8lsZ7sOeOs0nBNBYr6CM7xXRCUOc/D2E8gM2M=',
						'style': 'width: 100%;'
					})
				])
			]));
			body.appendChild(E('div', { 'class': 'cbi-value', 'style': 'margin-bottom: 12px;' }, [
				E('label', { 'class': 'cbi-value-title', 'style': 'font-weight: 600; width: 35%;' }, _('Allowed IPs')),
				E('div', { 'class': 'cbi-value-field', 'style': 'width: 65%;' }, [
					E('input', {
						'type': 'text',
						'class': 'cbi-input-text',
						'id': 'edit_vpn_allowed_ips',
						'value': curAllowedIps,
						'placeholder': '10.50.10.0/24 or 0.0.0.0/0',
						'style': 'width: 100%;'
					})
				])
			]));
		} else {
			body.appendChild(E('div', { 'class': 'cbi-value', 'style': 'margin-bottom: 12px;' }, [
				E('label', { 'class': 'cbi-value-title', 'style': 'font-weight: 600; width: 35%;' }, _('User')),
				E('div', { 'class': 'cbi-value-field', 'style': 'width: 65%;' }, [
					E('input', {
						'type': 'text',
						'class': 'cbi-input-text',
						'id': 'edit_vpn_username',
						'value': curUser,
						'placeholder': 'PPP Username',
						'style': 'width: 100%;'
					})
				])
			]));
			body.appendChild(E('div', { 'class': 'cbi-value', 'style': 'margin-bottom: 12px;' }, [
				E('label', { 'class': 'cbi-value-title', 'style': 'font-weight: 600; width: 35%;' }, _('Password')),
				E('div', { 'class': 'cbi-value-field', 'style': 'width: 65%;' }, [
					E('input', {
						'type': 'password',
						'class': 'cbi-input-text',
						'id': 'edit_vpn_password',
						'value': curPass,
						'placeholder': 'PPP Password',
						'style': 'width: 100%;'
					})
				])
			]));
			body.appendChild(E('div', { 'class': 'cbi-value', 'style': 'margin-bottom: 12px;' }, [
				E('label', { 'class': 'cbi-value-title', 'style': 'font-weight: 600; width: 35%;' }, _('Keepalive Timeout (s)')),
				E('div', { 'class': 'cbi-value-field', 'style': 'width: 65%;' }, [
					E('input', {
						'type': 'number',
						'class': 'cbi-input-text',
						'id': 'edit_vpn_keepalive',
						'value': curKeepalive,
						'placeholder': '30',
						'style': 'width: 100%;'
					})
				])
			]));
			body.appendChild(E('div', { 'class': 'cbi-value', 'style': 'margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between;' }, [
				E('label', { 'class': 'cbi-value-title', 'style': 'font-weight: 600; width: auto;' }, _('Add Default Route')),
				E('div', { 'class': 'cbi-value-field', 'style': 'width: auto; margin: 0;' }, [
					E('input', {
						'type': 'checkbox',
						'id': 'edit_vpn_defaultroute',
						'checked': curDefRoute ? 'checked' : null,
						'style': 'cursor: pointer;'
					})
				])
			]));
			body.appendChild(E('div', { 'class': 'cbi-value', 'style': 'margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between;' }, [
				E('label', { 'class': 'cbi-value-title', 'style': 'font-weight: 600; width: auto;' }, _('Use Peer DNS')),
				E('div', { 'class': 'cbi-value-field', 'style': 'width: auto; margin: 0;' }, [
					E('input', {
						'type': 'checkbox',
						'id': 'edit_vpn_peerdns',
						'checked': curPeerDns ? 'checked' : null,
						'style': 'cursor: pointer;'
					})
				])
			]));
		}

		ui.showModal(_('Edit VPN Interface: ') + ifname, [
			body,
			E('div', { 'class': 'right', 'style': 'margin-top: 20px; display: flex; justify-content: flex-end; gap: 8px;' }, [
				E('button', {
					'class': 'cbi-button cbi-button-neutral',
					'click': ui.hideModal
				}, _('Cancel')),
				E('button', {
					'class': 'cbi-button cbi-button-action',
					'click': function() {
						var server = (document.getElementById('edit_vpn_server')?.value || '').trim();
						if (!server) {
							ui.addNotification(null, E('p', _('Server address is required.')), 'error');
							return;
						}

						ui.showModal(null, [ E('p', { 'class': 'spinning' }, _('Updating VPN Interface…')) ]);

						try {
							uci.set('network', ifname, 'server', server);

							if (protoId === 'sstp') {
								var port = (document.getElementById('edit_vpn_port')?.value || '443').trim();
								uci.set('network', ifname, 'port', port);
							}

							if (isWireGuard) {
								var privKey = (document.getElementById('edit_vpn_privkey')?.value || '').trim();
								var pubKey = (document.getElementById('edit_vpn_pubkey')?.value || '').trim();
								var clientIp = (document.getElementById('edit_vpn_client_ip')?.value || '').trim();
								var allowedIps = (document.getElementById('edit_vpn_allowed_ips')?.value || '0.0.0.0/0').trim();

								if (privKey) uci.set('network', ifname, 'private_key', privKey);
								if (clientIp) uci.set('network', ifname, 'addresses', [ clientIp ]);

								if (pubKey) {
									var peerSecName = null;
									uci.sections('network', 'wireguard_' + ifname, function(s) {
										peerSecName = s['.name'];
									});
									if (!peerSecName) {
										peerSecName = uci.add('network', 'wireguard_' + ifname, 'wgpeer_' + ifname);
									}
									uci.set('network', peerSecName, 'public_key', pubKey);
									uci.set('network', peerSecName, 'route_allowed_ips', '1');
									uci.set('network', peerSecName, 'allowed_ips', allowedIps.split(/\s*,\s*|\s+/));
									var parts = server.split(':');
									if (parts.length === 2) {
										uci.set('network', peerSecName, 'endpoint_host', parts[0]);
										uci.set('network', peerSecName, 'endpoint_port', parts[1]);
									} else {
										uci.set('network', peerSecName, 'endpoint_host', server);
									}
								}
							} else {
								var user = (document.getElementById('edit_vpn_username')?.value || '').trim();
								var pass = (document.getElementById('edit_vpn_password')?.value || '').trim();
								var keepalive = parseInt(document.getElementById('edit_vpn_keepalive')?.value || '30', 10);
								var addDefaultRoute = document.getElementById('edit_vpn_defaultroute')?.checked || false;
								var usePeerDns = document.getElementById('edit_vpn_peerdns')?.checked || false;

								if (user) uci.set('network', ifname, 'username', user);
								if (pass) uci.set('network', ifname, 'password', pass);
								uci.set('network', ifname, 'keepalive', '5 ' + keepalive);
								uci.set('network', ifname, 'defaultroute', addDefaultRoute ? '1' : '0');
								uci.set('network', ifname, 'peerdns', usePeerDns ? '1' : '0');
							}

							commitAndApplyUCI([ 'network', 'firewall' ]).then(function() {
								return callInterfaceDown(ifname).catch(function() { return null; });
							}).then(function() {
								return new Promise(function(resolve) { setTimeout(resolve, 1000); });
							}).then(function() {
								return callInterfaceUp(ifname).catch(function() { return null; });
							}).then(function() {
								ui.hideModal();
								ui.addNotification(null, E('p', _('VPN interface "%s" updated successfully!').format(ifname)), 'success');
								setTimeout(function() { window.location.reload(); }, 800);
							}).catch(function(err) {
								ui.hideModal();
								ui.addNotification(null, E('p', _('Failed to update configuration: ') + (err.message || err)), 'error');
							});
						} catch(e) {
							ui.hideModal();
							ui.addNotification(null, E('p', _('Error: ') + e.message), 'error');
						}
					}
				}, _('Save & Apply'))
			])
		]);
	},

	updateTableRows: function(ifaces, devStatsText) {
		var self = this;
		var tbody = document.getElementById('vpn_tunnels_tbody');
		if (!tbody) return;

		var devStats = parseDevStats(devStatsText);

		var now = Date.now();
		var timeDelta = (self.lastPollTime ? (now - self.lastPollTime) / 1000 : 2);
		if (timeDelta <= 0) timeDelta = 2;
		self.lastPollTime = now;
		self.prevTraffic = self.prevTraffic || {};

		// Map active interfaces from netifd dump
		var dumpMap = {};
		(ifaces || []).forEach(function(ifc) {
			if (ifc && ifc.interface) dumpMap[ifc.interface] = ifc;
		});

		// Fetch all defined VPN interfaces from UCI network configuration
		var uciSections = uci.sections('network', 'interface') || [];
		var vpnNames = [];
		var vpnIfaces = [];

		uciSections.forEach(function(s) {
			var n = s['.name'] || '';
			var p = s.proto || '';
			if (p === 'wireguard' || p === 'pptp' || p === 'l2tp' || p === 'sstp' || p === 'openvpn' || n.indexOf('vpn') >= 0) {
				vpnNames.push(n);
				var dumpIfc = dumpMap[n];
				if (dumpIfc) {
					vpnIfaces.push(dumpIfc);
				} else {
					vpnIfaces.push({
						interface: n,
						proto: p,
						up: false,
						l3_device: '-',
						device: s.device || '-',
						'ipv4-address': [],
						uptime: 0
					});
				}
			}
		});

		// Also include any dump interface that might not be in uci
		(ifaces || []).forEach(function(ifc) {
			var n = ifc.interface || '';
			var p = ifc.proto || '';
			if (vpnNames.indexOf(n) === -1 && (p === 'wireguard' || p === 'pptp' || p === 'l2tp' || p === 'sstp' || p === 'openvpn' || n.indexOf('vpn') >= 0)) {
				vpnIfaces.push(ifc);
			}
		});

		var emptyRow = document.getElementById('vpn_empty_row');
		if (vpnIfaces.length === 0) {
			if (emptyRow) emptyRow.style.display = '';
			tbody.querySelectorAll('tr.vpn-data-row').forEach(function(r) { r.remove(); });
			return;
		}

		if (emptyRow) emptyRow.style.display = 'none';

		vpnIfaces.forEach(function(ifc) {
			var rowId = 'vpn_row_' + ifc.interface;
			var row = document.getElementById(rowId);
			var isDisabled = (uci.get('network', ifc.interface, 'disabled') === '1');
			var isUp = !!ifc.up;
			var isPending = !!ifc.pending;
			var hasIp = !!(ifc['ipv4-address'] && ifc['ipv4-address'].length && ifc['ipv4-address'][0].address);

			var assignedIp = '-';
			if (hasIp) {
				assignedIp = ifc['ipv4-address'][0].address;
			}

			var dotColor = '#ef4444'; // Red (Down)
			var dotTitle = _('Disconnected / Down');
			var isConnecting = false;

			if (isDisabled) {
				dotColor = '#64748b'; // Gray (Disabled)
				dotTitle = _('Disabled');
			} else if (isUp && hasIp) {
				dotColor = '#10b981'; // Green (Connected / UP)
				dotTitle = _('Connected / UP');
			} else if (isPending || (isUp && !hasIp)) {
				dotColor = '#f59e0b'; // Amber (Connecting / Dialing)
				dotTitle = _('Connecting / Dialing…');
				isConnecting = true;
			}

			var devName = ifc.l3_device || ifc.device || '';
			var stats = devStats[devName] || { rx: 0, tx: 0 };

			// Calculate real-time speed
			var prev = self.prevTraffic[devName] || stats;
			var rxSpeed = (isUp && stats.rx >= prev.rx) ? (stats.rx - prev.rx) / timeDelta : 0;
			var txSpeed = (isUp && stats.tx >= prev.tx) ? (stats.tx - prev.tx) / timeDelta : 0;
			self.prevTraffic[devName] = { rx: stats.rx, tx: stats.tx };

			var speedStr = (rxSpeed > 0 || txSpeed > 0)
				? ('↓ ' + formatSpeed(rxSpeed) + '  ↑ ' + formatSpeed(txSpeed))
				: '-';
			var totalStr = '↓ ' + formatBytes(stats.rx) + '  ↑ ' + formatBytes(stats.tx);

			// Routing & Peer IP details
			var isDefRoute = (uci.get('network', ifc.interface, 'defaultroute') === '1');
			var routeBadgeBg = isDefRoute ? 'rgba(56, 189, 248, 0.12)' : 'rgba(148, 163, 184, 0.08)';
			var routeBadgeColor = isDefRoute ? '#38bdf8' : '#94a3b8';
			var routeBadgeBorder = isDefRoute ? 'rgba(56, 189, 248, 0.25)' : 'rgba(148, 163, 184, 0.18)';
			var routeBadgeLabel = isDefRoute ? 'Default GW' : 'Split Tunnel';

			var peerIp = (ifc['ipv4-address'] && ifc['ipv4-address'][0] && ifc['ipv4-address'][0].ptpaddress) 
				? ifc['ipv4-address'][0].ptpaddress : '';

			if (row) {
				var dot = row.querySelector('.vpn-status-dot');
				if (dot) {
					dot.style.background = dotColor;
					dot.title = dotTitle;
					dot.style.boxShadow = isConnecting ? '0 0 6px rgba(245, 158, 11, 0.7)' : (isUp && hasIp ? '0 0 5px rgba(16, 185, 129, 0.5)' : 'none');
				}

				var ipCell = row.querySelector('.vpn-ip-cell');
				if (ipCell) {
					ipCell.textContent = assignedIp;
					ipCell.style.color = (assignedIp !== '-') ? '#38bdf8' : 'inherit';
					if (peerIp) ipCell.title = _('Peer IP: ') + peerIp;
				}

				var speedCell = row.querySelector('.vpn-speed-cell');
				if (speedCell) {
					speedCell.textContent = speedStr;
					speedCell.style.color = (speedStr !== '-') ? '#38bdf8' : 'inherit';
				}

				var totalCell = row.querySelector('.vpn-total-cell');
				if (totalCell) totalCell.textContent = totalStr;

				var uptimeCell = row.querySelector('.vpn-uptime-cell');
				if (uptimeCell) uptimeCell.textContent = ifc.uptime ? '%t'.format(ifc.uptime) : '-';

				var toggleBtn = row.querySelector('.btn-toggle');
				if (toggleBtn) {
					toggleBtn.title = isUp ? _('Stop interface') : _('Start interface');
					dom.content(toggleBtn, renderSvgIcon(isUp ? 'stop' : 'start'));
				}
			} else {
				var newRow = E('tr', { 'class': 'tr vpn-data-row', 'id': rowId, 'style': 'border-bottom: 1px solid rgba(255,255,255,0.04);' }, [
					// 1. Interface
					E('td', { 'class': 'td vpn-interface-cell', 'style': 'font-weight: 600;' }, [
						E('div', { 'class': 'vpn-ifname-wrap', 'style': 'display: flex; align-items: center; justify-content: space-between; width: 100%;' }, [
							E('div', { 'style': 'display: flex; align-items: center;' }, [
								E('span', {
									'class': 'vpn-status-dot',
									'title': dotTitle,
									'style': 'display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 6px; vertical-align: middle; cursor: help; background: ' + dotColor + ';' + (isConnecting ? ' box-shadow: 0 0 6px rgba(245, 158, 11, 0.7);' : (isUp && hasIp ? ' box-shadow: 0 0 5px rgba(16, 185, 129, 0.5);' : ''))
								}),
								E('span', { 'class': 'vpn-ifname-text' }, ifc.interface)
							]),
							// Visible on mobile only
							E('div', { 'class': 'vpn-badges-mobile', 'style': 'display: flex; gap: 4px;' }, [
								E('span', {
									'class': 'vpn-proto-badge-mobile',
									'style': 'font-size: 10px; font-weight: 600; text-transform: uppercase; padding: 1px 5px; border-radius: 3px; background: rgba(255,255,255,0.06); color: var(--proton-fg, #e2e8f0);'
								}, ifc.proto || '-'),
								E('span', {
									'class': 'vpn-route-badge-mobile',
									'style': 'font-size: 9.5px; padding: 1px 5px; border-radius: 3px; background: ' + routeBadgeBg + '; color: ' + routeBadgeColor + '; border: 1px solid ' + routeBadgeBorder + ';'
								}, routeBadgeLabel)
							])
						])
					]),
					// 2. Protocol (Desktop)
					E('td', { 'class': 'td vpn-proto-cell' }, [
						E('span', {
							'style': 'font-size: 10.5px; font-weight: 600; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,0.05); color: var(--proton-fg, #e2e8f0); border: 1px solid rgba(255,255,255,0.08);'
						}, ifc.proto || '-')
					]),
					// 3. Routing (Desktop)
					E('td', { 'class': 'td vpn-route-cell vpn-col-hide-mobile' }, [
						E('span', {
							'class': 'badge',
							'style': 'font-size: 9.5px; padding: 2px 6px; border-radius: 3px; background: ' + routeBadgeBg + '; color: ' + routeBadgeColor + '; border: 1px solid ' + routeBadgeBorder + ';'
						}, routeBadgeLabel)
					]),
					// 4. Assigned IP
					E('td', { 'class': 'td vpn-ip-cell', 'style': 'font-family: monospace; color: ' + (assignedIp !== '-' ? '#38bdf8' : 'inherit') + ';', 'title': peerIp ? (_('Peer IP: ') + peerIp) : '' }, assignedIp),
					// 5. Speed (Rate)
					E('td', { 'class': 'td vpn-speed-cell', 'style': 'font-family: monospace; font-size: 11px; color: ' + (speedStr !== '-' ? '#38bdf8' : 'inherit') + ';' }, speedStr),
					// 6. Total Traffic
					E('td', { 'class': 'td vpn-total-cell', 'style': 'font-family: monospace; font-size: 11px; white-space: nowrap;' }, totalStr),
					// 7. Uptime
					E('td', { 'class': 'td vpn-uptime-cell vpn-col-hide-mobile' }, ifc.uptime ? '%t'.format(ifc.uptime) : '-'),
					// 8. Actions
					E('td', { 'class': 'td vpn-actions-cell', 'style': 'text-align: right; white-space: nowrap;' }, [
						// Restart Button (🔄)
						E('button', {
							'class': 'vpn-action-btn btn-restart',
							'title': _('Restart interface'),
							'click': function() { self.restartInterface(ifc.interface); }
						}, renderSvgIcon('restart')),
						// Toggle Stop / Start Button (⏸️ / ▶️)
						E('button', {
							'class': 'vpn-action-btn btn-toggle',
							'title': isUp ? _('Stop interface') : _('Start interface'),
							'click': function() { self.toggleInterface(ifc.interface, isUp); }
						}, renderSvgIcon(isUp ? 'stop' : 'start')),
						// Logs Button (📄)
						E('button', {
							'class': 'vpn-action-btn btn-log',
							'title': _('Tunnel Logs'),
							'click': function() { self.openLogsModal(ifc.interface, ifc.proto); }
						}, renderSvgIcon('log')),
						// Settings Button (⚙️)
						E('button', {
							'class': 'vpn-action-btn btn-settings',
							'title': _('Settings'),
							'click': function() { self.openEditModal(ifc.interface, ifc.proto); }
						}, renderSvgIcon('settings')),
						// Delete Button (🗑️)
						E('button', {
							'class': 'vpn-action-btn btn-delete',
							'title': _('Delete interface'),
							'click': function() { self.deleteInterface(ifc.interface, ifc.proto); }
						}, renderSvgIcon('delete'))
					])
				]);
				tbody.appendChild(newRow);
			}
		});
	},

	render: function(data) {
		var ifaces = data[0] || [];
		var devStatsText = data[1] || '';
		var self = this;

		var hasOpenVPN = !!data[5];

		var protocols = [
			{
				id: 'wireguard',
				name: 'WireGuard',
				port: '51820 UDP',
				tag: 'Kernel Fast-Path',
				crypto: 'ChaCha20-Poly1305',
				layer: 'Layer 3',
				desc: _('Ultra-fast kernel-accelerated modern VPN. Lowest CPU and battery overhead for mobile links.'),
				status: _('Native / Ready'),
				installed: true,
				easySetup: true
			},
			{
				id: 'sstp',
				name: 'SSTP Client',
				port: '443 / 4430 TCP',
				tag: 'HTTPS Stealth',
				crypto: 'TLS 1.2/1.3 • MS-CHAPv2',
				layer: 'Layer 3 PPP',
				desc: _('Encapsulated inside standard HTTPS 443. Bypasses strict carrier firewalls and airport DPI.'),
				status: _('Native / Ready'),
				installed: true,
				easySetup: true
			},
			{
				id: 'l2tp',
				name: 'L2TP Client',
				port: '1701 UDP',
				tag: 'Layer 2 Tunneling',
				crypto: 'PPP / CHAP',
				layer: 'Layer 2 over UDP',
				desc: _('Layer 2 Tunneling Protocol client via xl2tpd. Native compatibility with MikroTik L2TP dial-out.'),
				status: _('Native / Ready'),
				installed: true,
				easySetup: true
			},
			{
				id: 'pptp',
				name: 'PPTP Client',
				port: '1723 TCP + GRE',
				tag: 'Low Overhead',
				crypto: 'MPPE 128-bit',
				layer: 'Layer 3 GRE / PPP',
				desc: _('Lightweight Point-to-Point Tunneling. High throughput on low-spec mobile appliances and legacy routers.'),
				status: _('Native / Ready'),
				installed: true,
				easySetup: true
			},
			{
				id: 'openvpn',
				name: 'OpenVPN',
				port: '1194 UDP/TCP',
				tag: 'Custom TLS',
				crypto: 'AES-GCM / TLS',
				layer: 'TUN / TAP',
				desc: _('Enterprise SSL/TLS VPN client. Supports custom certificate bundles and flexible corporate profiles.'),
				status: hasOpenVPN ? _('Installed') : _('Not Installed'),
				installed: hasOpenVPN,
				easySetup: hasOpenVPN
			}
		];

		var container = E('div', { 'class': 'cbi-map vpn-dashboard-container' });

		// Scoped style for compact mobile layout and icon buttons
		container.appendChild(E('style', {}, [
			'.vpn-action-btn {',
			'  display: inline-flex; align-items: center; justify-content: center;',
			'  width: 28px; height: 28px; padding: 0; margin-left: 3px; border-radius: 6px;',
			'  border: 1px solid var(--proton-border, rgba(255,255,255,0.1));',
			'  background: var(--proton-bg-hover, rgba(255,255,255,0.06));',
			'  color: var(--proton-fg, #e2e8f0); cursor: pointer; transition: all 0.15s ease;',
			'  vertical-align: middle;',
			'}',
			'.vpn-action-btn:hover { background: rgba(255,255,255,0.18); border-color: rgba(255,255,255,0.35); }',
			'.vpn-action-btn.btn-restart:hover { background: rgba(56, 189, 248, 0.25); border-color: #38bdf8; color: #38bdf8; }',
			'.vpn-action-btn.btn-toggle:hover { background: rgba(245, 158, 11, 0.25); border-color: #f59e0b; color: #f59e0b; }',
			'.vpn-action-btn.btn-delete:hover { background: rgba(239, 68, 68, 0.25); border-color: #ef4444; color: #ef4444; }',
			'.vpn-hero-card {',
			'  background: linear-gradient(135deg, rgba(24, 32, 47, 0.7) 0%, rgba(12, 17, 29, 0.9) 100%);',
			'  border: 1px solid var(--proton-border, rgba(255,255,255,0.08)); border-radius: 8px;',
			'  padding: 12px 16px; margin-bottom: 12px;',
			'}',
			'.vpn-section-card {',
			'  background: var(--proton-card-bg, rgba(255,255,255,0.025));',
			'  border: 1px solid var(--proton-border, rgba(255,255,255,0.07));',
			'  border-radius: 8px; padding: 12px 16px; margin-bottom: 12px;',
			'}',
			'.vpn-proto-grid {',
			'  display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));',
			'  gap: 10px; margin-bottom: 12px;',
			'}',
			'.vpn-proto-card {',
			'  background: var(--proton-card-bg, rgba(255,255,255,0.02));',
			'  border: 1px solid var(--proton-border, rgba(255,255,255,0.07));',
			'  border-radius: 8px; padding: 12px 14px; display: flex; flex-direction: column;',
			'  justify-content: space-between; transition: border-color 0.15s ease, background 0.15s ease;',
			'}',
			'.vpn-proto-card:hover { border-color: rgba(255,255,255,0.18); background: rgba(255,255,255,0.04); }',
			'.vpn-badges-mobile { display: none; }',
			'@media (max-width: 768px) {',
			'  .vpn-hero-card { padding: 10px 12px !important; margin-bottom: 8px !important; }',
			'  .vpn-hero-card h2 { font-size: 15px !important; }',
			'  .vpn-hero-card p { display: none !important; }',
			'  .vpn-legend-wrap { width: 100% !important; margin-top: 6px !important; flex-wrap: wrap !important; gap: 8px !important; }',
			'  .vpn-section-card { padding: 8px 10px !important; margin-bottom: 8px !important; }',
			'  .vpn-proto-grid { grid-template-columns: 1fr !important; gap: 8px !important; margin-bottom: 8px !important; }',
			'  .vpn-proto-card { padding: 10px 12px !important; }',
			'  .vpn-table thead { display: none !important; }',
			'  .vpn-table, .vpn-table tbody { display: block !important; width: 100% !important; }',
			'  .vpn-table tr.vpn-data-row {',
			'    display: flex !important; flex-direction: column !important;',
			'    background: rgba(255, 255, 255, 0.02) !important;',
			'    border: 1px solid var(--proton-border, rgba(255, 255, 255, 0.08)) !important;',
			'    border-radius: 8px !important; padding: 10px 12px !important; margin-bottom: 8px !important; gap: 5px !important;',
			'  }',
			'  .vpn-table tr.vpn-data-row td {',
			'    display: flex !important; justify-content: space-between !important; align-items: center !important;',
			'    padding: 0 !important; border: none !important; width: 100% !important;',
			'  }',
			'  .vpn-badges-mobile { display: flex !important; }',
			'  .vpn-proto-cell { display: none !important; }',
			'  .vpn-route-cell { display: none !important; }',
			'  .vpn-col-hide-mobile { display: none !important; }',
			'  .vpn-interface-cell { padding-bottom: 5px !important; border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important; font-size: 13.5px !important; }',
			'  .vpn-ip-cell { font-size: 11.5px !important; }',
			'  .vpn-ip-cell::before { content: "IP Address:"; color: var(--text-color-medium, #94a3b8); font-size: 11px; }',
			'  .vpn-speed-cell { font-size: 11px !important; }',
			'  .vpn-speed-cell::before { content: "Speed (Rate):"; color: var(--text-color-medium, #94a3b8); font-size: 11px; }',
			'  .vpn-total-cell { font-size: 11px !important; }',
			'  .vpn-total-cell::before { content: "Total Traffic:"; color: var(--text-color-medium, #94a3b8); font-size: 11px; }',
			'  .vpn-uptime-cell { display: flex !important; font-size: 11px !important; }',
			'  .vpn-uptime-cell::before { content: "Uptime:"; color: var(--text-color-medium, #94a3b8); font-size: 11px; }',
			'  .vpn-actions-cell {',
			'    padding-top: 8px !important; margin-top: 4px !important;',
			'    border-top: 1px solid rgba(255, 255, 255, 0.05) !important;',
			'    justify-content: flex-end !important; gap: 6px !important;',
			'  }',
			'  .vpn-action-btn { width: 30px !important; height: 30px !important; margin-left: 0 !important; border-radius: 6px !important; }',
			'  .cbi-value { flex-direction: column !important; align-items: flex-start !important; }',
			'  .cbi-value-title { width: 100% !important; margin-bottom: 4px !important; text-align: left !important; }',
			'  .cbi-value-field { width: 100% !important; }',
			'}'
		]));

		// Header Hero Card
		container.appendChild(E('div', { 'class': 'vpn-hero-card' }, [
			E('div', { 'style': 'display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;' }, [
				E('div', {}, [
					E('div', { 'style': 'display: flex; align-items: center; gap: 8px; margin-bottom: 3px;' }, [
						E('h2', { 'style': 'margin: 0; font-size: 18px; font-weight: 700; color: #fff;' }, _('VPN Client Center')),
						E('span', { 'style': 'font-size: 10px; font-weight: bold; padding: 1px 6px; border-radius: 6px; background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);' }, _('Plug & Play'))
					]),
					E('p', { 'style': 'margin: 0; font-size: 12px; color: var(--text-color-medium, #94a3b8); max-width: 760px; line-height: 1.4;' }, 
						_('Live dial-out manager for MikroTik & remote VPN servers. Tunnels refresh in real-time.')
					)
				]),
				E('div', { 'style': 'display: flex; gap: 6px; flex-wrap: wrap;' }, [
					E('a', {
						'class': 'cbi-button cbi-button-neutral',
						'href': L.url('admin/status/wireguard'),
						'style': 'font-size: 11px; padding: 4px 8px; border-radius: 4px;'
					}, _('WireGuard')),
					E('a', {
						'class': 'cbi-button cbi-button-neutral',
						'href': L.url('admin/network/network'),
						'style': 'font-size: 11px; padding: 4px 8px; border-radius: 4px;'
					}, _('Interfaces'))
				])
			])
		]));

		// Active VPN Tunnels Section
		var tunnelsCard = E('div', { 'class': 'vpn-section-card' });

		tunnelsCard.appendChild(E('div', { 'style': 'display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;' }, [
			E('div', {}, [
				E('h3', { 'style': 'margin: 0 0 2px 0; font-size: 14px; font-weight: 600;' }, _('Active VPN Tunnels')),
				E('p', { 'style': 'margin: 0; font-size: 11px; color: var(--text-color-medium, #94a3b8);' }, _('Connected VPN uplinks routing network traffic.'))
			]),
			E('div', { 'class': 'vpn-legend-wrap', 'style': 'display: flex; align-items: center; gap: 10px; font-size: 10.5px; color: var(--text-color-medium, #94a3b8);' }, [
				E('span', { 'style': 'display: flex; align-items: center; gap: 4px;' }, [
					E('span', { 'style': 'width: 6px; height: 6px; border-radius: 50%; background: #10b981; box-shadow: 0 0 4px #10b981;' }),
					_('Connected')
				]),
				E('span', { 'style': 'display: flex; align-items: center; gap: 4px;' }, [
					E('span', { 'style': 'width: 6px; height: 6px; border-radius: 50%; background: #f59e0b; box-shadow: 0 0 4px #f59e0b;' }),
					_('Connecting')
				]),
				E('span', { 'style': 'display: flex; align-items: center; gap: 4px;' }, [
					E('span', { 'style': 'width: 6px; height: 6px; border-radius: 50%; background: #ef4444;' }),
					_('Down')
				]),
				E('span', { 'style': 'display: flex; align-items: center; gap: 4px;' }, [
					E('span', { 'style': 'width: 6px; height: 6px; border-radius: 50%; background: #64748b;' }),
					_('Disabled')
				])
			])
		]));

		var table = E('table', { 'class': 'table vpn-table', 'style': 'width: 100%; border-collapse: collapse; font-size: 12px;' }, [
			E('thead', {}, [
				E('tr', { 'class': 'tr table-titles', 'style': 'border-bottom: 1px solid var(--proton-border, rgba(255,255,255,0.1));' }, [
					E('th', { 'class': 'th' }, _('Interface')),
					E('th', { 'class': 'th' }, _('Protocol')),
					E('th', { 'class': 'th vpn-col-hide-mobile' }, _('Routing')),
					E('th', { 'class': 'th' }, _('Assigned IP')),
					E('th', { 'class': 'th' }, _('Speed (Rate)')),
					E('th', { 'class': 'th' }, _('Total Traffic')),
					E('th', { 'class': 'th vpn-col-hide-mobile' }, _('Uptime')),
					E('th', { 'class': 'th', 'style': 'text-align: right;' }, _('Actions'))
				])
			]),
			E('tbody', { 'id': 'vpn_tunnels_tbody' }, [
				E('tr', { 'id': 'vpn_empty_row', 'style': 'display: none;' }, [
					E('td', { 'colspan': '8', 'style': 'text-align: center; padding: 14px; color: var(--text-color-medium, #94a3b8); font-size: 11.5px;' }, _('No active VPN connections.'))
				])
			])
		]);

		tunnelsCard.appendChild(table);
		container.appendChild(tunnelsCard);

		// Protocol Cards Grid
		var grid = E('div', { 'class': 'vpn-proto-grid' });

		protocols.forEach(function(p) {
			var card = E('div', { 'class': 'vpn-proto-card' }, [
				E('div', {}, [
					// Card Header
					E('div', { 'style': 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;' }, [
						E('div', { 'style': 'display: flex; align-items: center; gap: 6px;' }, [
							E('span', { 'style': 'font-size: 13.5px; font-weight: 600; color: var(--proton-fg, #f5f7fa);' }, p.name),
							E('span', { 'style': 'font-size: 9.5px; padding: 1px 5px; border-radius: 3px; background: rgba(255,255,255,0.05); color: var(--text-color-medium, #94a3b8); border: 1px solid rgba(255,255,255,0.08); font-family: monospace;' }, p.port)
						]),
						E('span', { 'style': 'font-size: 10px; color: ' + (p.installed ? '#10b981' : '#94a3b8') + '; display: flex; align-items: center; gap: 4px;' }, [
							E('span', { 'style': 'width: 5px; height: 5px; border-radius: 50%; background: currentColor;' + (p.installed ? ' box-shadow: 0 0 4px #10b981;' : '') }),
							p.status
						])
					]),
					// Description
					E('p', { 'style': 'margin: 0 0 10px 0; font-size: 11.5px; color: var(--text-color-medium, #94a3b8); line-height: 1.4;' }, p.desc),
					// Minimalist specs badges (no accordion)
					E('div', { 'style': 'display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 12px;' }, [
						E('span', { 'style': 'font-size: 9.5px; padding: 1px 5px; border-radius: 3px; background: rgba(56, 189, 248, 0.08); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.2);' }, p.tag),
						E('span', { 'style': 'font-size: 9.5px; padding: 1px 5px; border-radius: 3px; background: rgba(255,255,255,0.03); color: var(--text-color-medium, #94a3b8); border: 1px solid rgba(255,255,255,0.06);' }, p.crypto),
						E('span', { 'style': 'font-size: 9.5px; padding: 1px 5px; border-radius: 3px; background: rgba(255,255,255,0.03); color: var(--text-color-medium, #94a3b8); border: 1px solid rgba(255,255,255,0.06);' }, p.layer)
					])
				]),
				// Card Footer Action
				E('div', { 'style': 'display: flex; justify-content: flex-end; margin-top: 4px;' }, [
					p.installed ? E('button', {
						'class': 'cbi-button cbi-button-action',
						'style': 'font-size: 11px; font-weight: 600; padding: 4px 12px; border-radius: 4px; width: 100%; justify-content: center; display: flex; align-items: center; gap: 4px;',
						'click': function() { self.openQuickSetupModal(p.id, p.name); }
					}, _('⚡ Quick Setup')) : E('a', {
						'class': 'cbi-button cbi-button-neutral',
						'style': 'font-size: 11px; font-weight: 500; padding: 4px 12px; border-radius: 4px; width: 100%; justify-content: center; display: flex; align-items: center; gap: 4px; text-decoration: none;',
						'href': L.url('admin/system/package-manager') + '?query=openvpn-openssl'
					}, _('📦 Install openvpn'))
				])
			]);
			grid.appendChild(card);
		});

		container.appendChild(grid);

		// Initial populate
		self.updateTableRows(ifaces, devStatsText);

		// Realtime polling every 2 seconds
		poll.add(function() {
			return Promise.all([
				callNetworkDump(),
				L.resolveDefault(fs.read_direct('/proc/net/dev'), '')
			]).then(function(res) {
				self.updateTableRows(res[0], res[1]);
			});
		}, 2);

		return container;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
