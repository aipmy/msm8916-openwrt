'use strict';
'require view';
'require dom';
'require ui';
'require uci';
'require network';
'require rpc';

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

var callInterfaceUp = rpc.declare({
	object: 'network.interface',
	method: 'up',
	params: [ 'interface' ]
});

var callInterfaceDown = rpc.declare({
	object: 'network.interface',
	method: 'down',
	params: [ 'interface' ]
});

return view.extend({
	load: function() {
		return Promise.all([
			callNetworkDump(),
			callServiceList(),
			uci.load('network'),
			uci.load('firewall').catch(function() { return null; })
		]);
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
			_('Are you sure you want to restart VPN interface "%s"? Connection traffic will momentarily reset.').format(ifname),
			_('Restart Now'),
			false,
			function() {
				ui.showModal(null, [ E('p', { 'class': 'spinning' }, _('Restarting interface %s…').format(ifname)) ]);
				callInterfaceDown({ interface: ifname }).then(function() {
					return new Promise(function(resolve) { setTimeout(resolve, 1500); });
				}).then(function() {
					return callInterfaceUp({ interface: ifname });
				}).then(function() {
					ui.hideModal();
					ui.addNotification(null, E('p', _('Interface "%s" successfully restarted.').format(ifname)), 'info');
					setTimeout(function() { window.location.reload(); }, 1200);
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
			? _('Do you want to stop/disconnect VPN interface "%s"?').format(ifname)
			: _('Do you want to start/reconnect VPN interface "%s"?').format(ifname);
		var confirmBtn = currentlyUp ? _('Stop') : _('Start');

		this.confirmAction(
			actionTitle,
			actionMsg,
			confirmBtn,
			currentlyUp,
			function() {
				ui.showModal(null, [ E('p', { 'class': 'spinning' }, (currentlyUp ? _('Stopping %s…') : _('Starting %s…')).format(ifname)) ]);
				var p = currentlyUp ? callInterfaceDown({ interface: ifname }) : callInterfaceUp({ interface: ifname });
				p.then(function() {
					ui.hideModal();
					ui.addNotification(null, E('p', (currentlyUp ? _('Interface "%s" stopped.') : _('Interface "%s" started.')).format(ifname)), 'info');
					setTimeout(function() { window.location.reload(); }, 1200);
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
			_('Are you sure you want to permanently delete VPN interface "%s"? All configuration and WAN firewall rules for this tunnel will be removed.').format(ifname),
			_('Delete Permanently'),
			true,
			function() {
				ui.showModal(null, [ E('p', { 'class': 'spinning' }, _('Deleting interface %s…').format(ifname)) ]);
				callInterfaceDown({ interface: ifname }).catch(function() { return null; }).then(function() {
					try {
						uci.delete('network', ifname);

						if (proto === 'wireguard') {
							uci.sections('network', 'wireguard_' + ifname, function(s) {
								uci.delete('network', s['.name']);
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

						return uci.save().then(function() {
							return uci.apply();
						}).then(function() {
							ui.hideModal();
							ui.addNotification(null, E('p', _('Interface "%s" permanently deleted.').format(ifname)), 'info');
							setTimeout(function() { window.location.reload(); }, 1000);
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
						'placeholder': isWireGuard ? '49.50.10.155:13231' : '49.50.10.155',
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
		var modal = ui.showModal(_('MikroTik Client Setup: ') + protoTitle, [
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

						// Read all form inputs before closing/replacing modal DOM
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
							// In LuCI uci.js, a new named section must be created via uci.add(conf, type, name)
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

							uci.save().then(function() {
								return uci.apply();
							}).then(function() {
								ui.hideModal();
								ui.addNotification(null, E('p', _('VPN interface "%s" successfully created!').format(ifname)), 'info');
								window.location.reload();
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

	render: function(data) {
		var ifaces = data[0] || [];
		var self = this;

		// Detect active VPN interfaces
		var vpnIfaces = ifaces.filter(function(ifc) {
			var p = ifc.proto || '';
			var n = ifc.interface || '';
			return (p === 'wireguard' || p === 'pptp' || p === 'l2tp' || p === 'sstp' || p === 'openvpn' || n.indexOf('vpn') >= 0);
		});

		var protocols = [
			{
				id: 'wireguard',
				name: 'WireGuard',
				badge: 'Fast & Modern',
				badgeColor: '#10b981',
				desc: _('Next-generation, ultra-fast VPN with state-of-the-art cryptography (ChaCha20, Curve25519). Native kernel acceleration with lowest battery and memory overhead.'),
				port: 'UDP 51820',
				crypto: 'ChaCha20-Poly1305, Curve25519',
				layer: 'Layer 3 Kernel Crypto',
				status: _('Kernel Accelerated'),
				statusColor: '#10b981',
				easySetup: true
			},
			{
				id: 'sstp',
				name: 'SSTP Client',
				badge: 'Stealth HTTPS 443',
				badgeColor: '#ec4899',
				desc: _('Secure Socket Tunneling Protocol encapsulated inside HTTPS port 443. Best protocol for traveling and bypassing strict hotel/airport DPI firewalls.'),
				port: 'TCP 443 / 4430',
				crypto: 'TLS 1.2 / 1.3 + MS-CHAPv2',
				layer: 'Layer 3 PPP Tunnel',
				status: _('Ready to Connect'),
				statusColor: '#10b981',
				easySetup: true
			},
			{
				id: 'l2tp',
				name: 'L2TP Client',
				badge: 'Layer 2 Tunneling',
				badgeColor: '#06b6d4',
				desc: _('Native Layer 2 Tunneling Protocol client via xl2tpd daemon. Widely used for branch office interconnects and travel gateway routers.'),
				port: 'UDP 1701',
				crypto: 'PPP Encapsulation / CHAP',
				layer: 'Layer 2 over UDP',
				status: _('Ready to Connect'),
				statusColor: '#10b981',
				easySetup: true
			},
			{
				id: 'pptp',
				name: 'PPTP Client',
				badge: 'Point-to-Point',
				badgeColor: '#f59e0b',
				desc: _('Lightweight Point-to-Point Tunneling Protocol client for high-throughput connectivity on low-overhead mobile links and legacy appliances.'),
				port: 'TCP 1723 + IP GRE',
				crypto: 'MPPE 128-bit + MS-CHAPv2',
				layer: 'Layer 3 GRE / PPP',
				status: _('Ready to Connect'),
				statusColor: '#10b981',
				easySetup: true
			},
			{
				id: 'openvpn',
				name: 'OpenVPN',
				badge: 'Enterprise Standard',
				badgeColor: '#8b5cf6',
				desc: _('Highly configurable SSL/TLS VPN with support for custom profiles, certificates, and UDP/TCP fallbacks.'),
				port: 'UDP/TCP 1194',
				crypto: 'AES-256-GCM / TLS',
				layer: 'Layer 3 TUN / TAP',
				status: _('Installed'),
				statusColor: '#8b5cf6',
				easySetup: false
			}
		];

		var container = E('div', { 'class': 'cbi-map vpn-dashboard-container' });

		// Scoped style for compact mobile layout and icon buttons
		container.appendChild(E('style', {}, [
			'.vpn-action-btn {',
			'  display: inline-flex; align-items: center; justify-content: center;',
			'  width: 30px; height: 30px; padding: 0; margin-left: 4px; border-radius: 6px;',
			'  border: 1px solid var(--proton-border, rgba(255,255,255,0.1));',
			'  background: var(--proton-bg-hover, rgba(255,255,255,0.05));',
			'  color: var(--proton-fg, #e2e8f0); cursor: pointer; transition: all 0.15s ease;',
			'}',
			'.vpn-action-btn:hover { background: rgba(255,255,255,0.15); border-color: rgba(255,255,255,0.3); }',
			'.vpn-action-btn.btn-restart:hover { background: rgba(56, 189, 248, 0.2); border-color: #38bdf8; color: #38bdf8; }',
			'.vpn-action-btn.btn-toggle:hover { background: rgba(245, 158, 11, 0.2); border-color: #f59e0b; color: #f59e0b; }',
			'.vpn-action-btn.btn-delete:hover { background: rgba(239, 68, 68, 0.2); border-color: #ef4444; color: #ef4444; }',
			'.vpn-hero-card {',
			'  background: linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%);',
			'  border: 1px solid var(--proton-border, rgba(255,255,255,0.08)); border-radius: 12px;',
			'  padding: 18px 22px; margin-bottom: 16px; box-shadow: 0 4px 16px rgba(0,0,0,0.2);',
			'}',
			'.vpn-section-card {',
			'  background: var(--proton-card-bg, rgba(255,255,255,0.03));',
			'  border: 1px solid var(--proton-border, rgba(255,255,255,0.08));',
			'  border-radius: 10px; padding: 16px 18px; margin-bottom: 16px;',
			'}',
			'.vpn-proto-grid {',
			'  display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));',
			'  gap: 12px; margin-bottom: 16px;',
			'}',
			'.vpn-proto-card {',
			'  background: var(--proton-card-bg, rgba(255,255,255,0.03));',
			'  border: 1px solid var(--proton-border, rgba(255,255,255,0.08));',
			'  border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column;',
			'  justify-content: space-between; box-shadow: 0 2px 8px rgba(0,0,0,0.15);',
			'}',
			'@media (max-width: 768px) {',
			'  .vpn-hero-card { padding: 12px 14px !important; margin-bottom: 10px !important; }',
			'  .vpn-hero-card h2 { font-size: 17px !important; }',
			'  .vpn-hero-card p { font-size: 11.5px !important; line-height: 1.4 !important; }',
			'  .vpn-section-card { padding: 12px 12px !important; margin-bottom: 10px !important; }',
			'  .vpn-proto-grid { grid-template-columns: 1fr !important; gap: 10px !important; margin-bottom: 10px !important; }',
			'  .vpn-proto-card { padding: 12px 12px !important; }',
			'  .vpn-col-hide-mobile { display: none !important; }',
			'  .vpn-table th, .vpn-table td { padding: 6px 4px !important; font-size: 11px !important; }',
			'  .vpn-action-btn { width: 26px !important; height: 26px !important; margin-left: 2px !important; }',
			'}'
		]));

		// Header Hero Card
		container.appendChild(E('div', { 'class': 'vpn-hero-card' }, [
			E('div', { 'style': 'display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;' }, [
				E('div', {}, [
					E('div', { 'style': 'display: flex; align-items: center; gap: 8px; margin-bottom: 4px;' }, [
						E('h2', { 'style': 'margin: 0; font-size: 19px; font-weight: 700; color: #fff;' }, _('VPN Client Center')),
						E('span', { 'style': 'font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 8px; background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);' }, _('Plug & Play'))
					]),
					E('p', { 'style': 'margin: 0; font-size: 12.5px; color: var(--text-color-medium, #94a3b8); max-width: 760px; line-height: 1.45;' }, 
						_('Quickly dial out and manage VPN tunnels to your MikroTik or remote VPN servers.')
					)
				]),
				E('div', { 'style': 'display: flex; gap: 8px; flex-wrap: wrap;' }, [
					E('a', {
						'class': 'cbi-button cbi-button-neutral',
						'href': L.url('admin/status/wireguard'),
						'style': 'font-size: 11px; padding: 5px 10px; border-radius: 5px;'
					}, _('WireGuard Status')),
					E('a', {
						'class': 'cbi-button cbi-button-neutral',
						'href': L.url('admin/network/network'),
						'style': 'font-size: 11px; padding: 5px 10px; border-radius: 5px;'
					}, _('Interfaces'))
				])
			])
		]));

		// Active VPN Tunnels Section
		var tunnelsCard = E('div', { 'class': 'vpn-section-card' });

		tunnelsCard.appendChild(E('div', { 'style': 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;' }, [
			E('div', {}, [
				E('h3', { 'style': 'margin: 0 0 2px 0; font-size: 14.5px; font-weight: 600;' }, _('Active VPN Tunnels')),
				E('p', { 'style': 'margin: 0; font-size: 11.5px; color: var(--text-color-medium, #94a3b8);' }, _('Connected VPN uplinks routing network traffic.'))
			])
		]));

		if (vpnIfaces.length === 0) {
			tunnelsCard.appendChild(E('div', {
				'style': 'padding: 16px; text-align: center; color: var(--text-color-medium, #94a3b8); font-size: 12px; background: rgba(0,0,0,0.1); border-radius: 6px; border: 1px dashed var(--proton-border, rgba(255,255,255,0.1));'
			}, [
				E('p', { 'style': 'margin: 0 0 4px 0; font-weight: 600;' }, _('No active VPN connections.')),
				E('p', { 'style': 'margin: 0; font-size: 11px;' }, _('Choose a protocol below and click "Quick Setup" to connect.'))
			]));
		} else {
			var table = E('table', { 'class': 'table vpn-table', 'style': 'width: 100%; border-collapse: collapse; font-size: 12px;' }, [
				E('tr', { 'class': 'tr table-titles', 'style': 'border-bottom: 1px solid var(--proton-border, rgba(255,255,255,0.1));' }, [
					E('th', { 'class': 'th' }, _('Interface')),
					E('th', { 'class': 'th' }, _('Protocol')),
					E('th', { 'class': 'th vpn-col-hide-mobile' }, _('Device')),
					E('th', { 'class': 'th' }, _('Assigned IP')),
					E('th', { 'class': 'th vpn-col-hide-mobile' }, _('Uptime')),
					E('th', { 'class': 'th', 'style': 'text-align: right;' }, _('Actions'))
				])
			]);

			vpnIfaces.forEach(function(ifc) {
				var isUp = !!ifc.up;
				var assignedIp = '-';
				if (ifc['ipv4-address'] && ifc['ipv4-address'].length && ifc['ipv4-address'][0].address) {
					assignedIp = ifc['ipv4-address'][0].address;
				}

				var row = E('tr', { 'class': 'tr', 'style': 'border-bottom: 1px solid rgba(255,255,255,0.04);' }, [
					E('td', { 'class': 'td', 'style': 'font-weight: 600;' }, [
						E('span', { 'style': 'display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 5px; background: ' + (isUp ? '#10b981' : '#ef4444') + ';' }),
						ifc.interface
					]),
					E('td', { 'class': 'td', 'style': 'text-transform: uppercase;' }, ifc.proto || '-'),
					E('td', { 'class': 'td vpn-col-hide-mobile', 'style': 'font-family: monospace;' }, ifc.l3_device || ifc.device || '-'),
					E('td', { 'class': 'td', 'style': 'font-family: monospace; color: ' + (assignedIp !== '-' ? '#38bdf8' : 'inherit') + ';' }, assignedIp),
					E('td', { 'class': 'td vpn-col-hide-mobile' }, ifc.uptime ? '%t'.format(ifc.uptime) : '-'),
					E('td', { 'class': 'td', 'style': 'text-align: right; white-space: nowrap;' }, [
						// Restart Button (🔄)
						E('button', {
							'class': 'vpn-action-btn btn-restart',
							'title': _('Restart interface'),
							'click': function() { self.restartInterface(ifc.interface); }
						}, [
							E('svg', { 'width': '13', 'height': '13', 'viewBox': '0 0 24 24', 'fill': 'none', 'stroke': 'currentColor', 'stroke-width': '2.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
								E('path', { 'd': 'M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.19' })
							])
						]),
						// Toggle / Stop / Start Button (⏸️ / ▶️)
						E('button', {
							'class': 'vpn-action-btn btn-toggle',
							'title': isUp ? _('Stop interface') : _('Start interface'),
							'click': function() { self.toggleInterface(ifc.interface, isUp); }
						}, [
							isUp ? E('svg', { 'width': '13', 'height': '13', 'viewBox': '0 0 24 24', 'fill': 'none', 'stroke': 'currentColor', 'stroke-width': '2.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
								E('rect', { 'x': '6', 'y': '4', 'width': '4', 'height': '16' }),
								E('rect', { 'x': '14', 'y': '4', 'width': '4', 'height': '16' })
							]) : E('svg', { 'width': '13', 'height': '13', 'viewBox': '0 0 24 24', 'fill': 'none', 'stroke': 'currentColor', 'stroke-width': '2.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
								E('polygon', { 'points': '5 3 19 12 5 21 5 3' })
							])
						]),
						// Settings Button (⚙️)
						E('a', {
							'class': 'vpn-action-btn',
							'title': _('Interface settings'),
							'href': L.url('admin/network/network')
						}, [
							E('svg', { 'width': '13', 'height': '13', 'viewBox': '0 0 24 24', 'fill': 'none', 'stroke': 'currentColor', 'stroke-width': '2.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
								E('circle', { 'cx': '12', 'cy': '12', 'r': '3' }),
								E('path', { 'd': 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z' })
							])
						]),
						// Delete Button (🗑️)
						E('button', {
							'class': 'vpn-action-btn btn-delete',
							'title': _('Delete interface'),
							'click': function() { self.deleteInterface(ifc.interface, ifc.proto); }
						}, [
							E('svg', { 'width': '13', 'height': '13', 'viewBox': '0 0 24 24', 'fill': 'none', 'stroke': 'currentColor', 'stroke-width': '2.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
								E('polyline', { 'points': '3 6 5 6 21 6' }),
								E('path', { 'd': 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }),
								E('line', { 'x1': '10', 'y1': '11', 'x2': '10', 'y2': '17' }),
								E('line', { 'x1': '14', 'y1': '11', 'x2': '14', 'y2': '17' })
							])
						])
					])
				]);
				table.appendChild(row);
			});

			tunnelsCard.appendChild(table);
		}

		container.appendChild(tunnelsCard);

		// Protocol Cards Grid
		var grid = E('div', { 'class': 'vpn-proto-grid' });

		protocols.forEach(function(p) {
			var card = E('div', { 'class': 'vpn-proto-card' }, [
				E('div', {}, [
					E('div', { 'style': 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;' }, [
						E('div', { 'style': 'display: flex; align-items: center; gap: 6px;' }, [
							E('h3', { 'style': 'margin: 0; font-size: 15px; font-weight: 600; color: var(--proton-fg, #f5f7fa);' }, p.name),
							E('span', { 'style': 'font-size: 9.5px; font-weight: 600; padding: 1px 5px; border-radius: 4px; background: ' + p.badgeColor + '22; color: ' + p.badgeColor + '; border: 1px solid ' + p.badgeColor + '44;' }, p.badge)
						]),
						E('span', { 'style': 'font-size: 10.5px; font-weight: 600; color: ' + p.statusColor + '; display: flex; align-items: center; gap: 4px;' }, [
							E('span', { 'style': 'width: 5px; height: 5px; border-radius: 50%; background: ' + p.statusColor + ';' }),
							p.status
						])
					]),
					E('p', { 'style': 'margin: 0 0 10px 0; font-size: 11.5px; color: var(--text-color-medium, #94a3b8); line-height: 1.4;' }, p.desc),
					
					// Accordion for Technical Specs
					E('details', { 'style': 'margin-bottom: 10px; font-size: 10.5px; cursor: pointer;' }, [
						E('summary', { 'style': 'color: var(--proton-accent, #38bdf8); font-weight: 500; outline: none; margin-bottom: 4px;' }, _('View Technical Specs')),
						E('div', { 'style': 'background: rgba(0,0,0,0.2); border-radius: 6px; padding: 6px 10px; display: flex; flex-direction: column; gap: 3px; margin-top: 4px;' }, [
							E('div', { 'style': 'display: flex; justify-content: space-between;' }, [
								E('span', { 'style': 'color: var(--text-color-medium, #94a3b8);' }, _('Port:')),
								E('span', { 'style': 'font-family: monospace; font-weight: 600;' }, p.port)
							]),
							E('div', { 'style': 'display: flex; justify-content: space-between;' }, [
								E('span', { 'style': 'color: var(--text-color-medium, #94a3b8);' }, _('Encapsulation:')),
								E('span', { 'style': 'font-weight: 500;' }, p.layer)
							]),
							E('div', { 'style': 'display: flex; justify-content: space-between;' }, [
								E('span', { 'style': 'color: var(--text-color-medium, #94a3b8);' }, _('Cryptography:')),
								E('span', { 'style': 'font-weight: 500;' }, p.crypto)
							])
						])
					])
				]),
				E('div', { 'style': 'display: flex; gap: 6px; justify-content: flex-end; margin-top: 8px;' }, [
					p.easySetup ? E('button', {
						'class': 'cbi-button cbi-button-action',
						'style': 'font-size: 11.5px; font-weight: 600; padding: 5px 12px; border-radius: 5px;',
						'click': function() { self.openQuickSetupModal(p.id, p.name); }
					}, _('⚡ Quick Setup')) : E('a', {
						'class': 'cbi-button cbi-button-neutral',
						'style': 'font-size: 11.5px; font-weight: 500; padding: 5px 12px; border-radius: 5px;',
						'href': L.url('admin/vpn/openvpn')
					}, _('Manage OpenVPN'))
				])
			]);
			grid.appendChild(card);
		});

		container.appendChild(grid);
		return container;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
