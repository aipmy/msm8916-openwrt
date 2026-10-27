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

return view.extend({
	load: function() {
		return Promise.all([
			callNetworkDump(),
			callServiceList(),
			uci.load('network'),
			uci.load('firewall').catch(function() { return null; })
		]);
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
				badge: 'Fast & Modern (Recommended)',
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
				port: 'TCP 443 (HTTPS)',
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
			}
		];

		var container = E('div', { 'class': 'cbi-map' });

		// Header Hero Card
		container.appendChild(E('div', {
			'style': 'background: linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%); border: 1px solid var(--proton-border, rgba(255,255,255,0.08)); border-radius: 12px; padding: 22px 24px; margin-bottom: 24px; box-shadow: 0 4px 16px rgba(0,0,0,0.2);'
		}, [
			E('div', { 'style': 'display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;' }, [
				E('div', {}, [
					E('div', { 'style': 'display: flex; align-items: center; gap: 10px; margin-bottom: 6px;' }, [
						E('h2', { 'style': 'margin: 0; font-size: 20px; font-weight: 700; color: #fff;' }, _('VPN Client Center')),
						E('span', { 'style': 'font-size: 11px; font-weight: bold; padding: 2px 8px; border-radius: 10px; background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);' }, _('Plug & Play Ready'))
					]),
					E('p', { 'style': 'margin: 0; font-size: 13px; color: var(--text-color-medium, #94a3b8); max-width: 780px; line-height: 1.5;' }, 
						_('Configure high-speed secure VPN client tunnels directly from this dashboard. Click "Quick Setup" on any protocol to connect in seconds, automatically creating uplink routes and firewall security zones.')
					)
				]),
				E('div', { 'style': 'display: flex; gap: 10px; flex-wrap: wrap;' }, [
					E('a', {
						'class': 'cbi-button cbi-button-neutral',
						'href': L.url('admin/status/wireguard'),
						'style': 'font-size: 12px; padding: 7px 14px; border-radius: 6px;'
					}, _('WireGuard Status')),
					E('a', {
						'class': 'cbi-button cbi-button-neutral',
						'href': L.url('admin/network/network'),
						'style': 'font-size: 12px; padding: 7px 14px; border-radius: 6px;'
					}, _('All Interfaces'))
				])
			])
		]));

		// Active VPN Tunnels Section (Top Priority for End-Users)
		var tunnelsCard = E('div', {
			'style': 'background: var(--proton-card-bg, rgba(255,255,255,0.03)); border: 1px solid var(--proton-border, rgba(255,255,255,0.08)); border-radius: 10px; padding: 18px 20px; margin-bottom: 24px;'
		});

		tunnelsCard.appendChild(E('div', { 'style': 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;' }, [
			E('div', {}, [
				E('h3', { 'style': 'margin: 0 0 4px 0; font-size: 15px; font-weight: 600;' }, _('Active VPN Tunnels')),
				E('p', { 'style': 'margin: 0; font-size: 12px; color: var(--text-color-medium, #94a3b8);' }, _('Connected VPN uplinks routing your network traffic.'))
			])
		]));

		if (vpnIfaces.length === 0) {
			tunnelsCard.appendChild(E('div', {
				'style': 'padding: 24px; text-align: center; color: var(--text-color-medium, #94a3b8); font-size: 13px; background: rgba(0,0,0,0.1); border-radius: 6px; border: 1px dashed var(--proton-border, rgba(255,255,255,0.1));'
			}, [
				E('p', { 'style': 'margin: 0 0 6px 0; font-weight: 600;' }, _('No active VPN connections right now.')),
				E('p', { 'style': 'margin: 0; font-size: 12px;' }, _('Choose a protocol below and click "Quick Setup" to connect.'))
			]));
		} else {
			var table = E('table', { 'class': 'table', 'style': 'width: 100%; border-collapse: collapse; font-size: 12px;' }, [
				E('tr', { 'class': 'tr table-titles', 'style': 'border-bottom: 1px solid var(--proton-border, rgba(255,255,255,0.1));' }, [
					E('th', { 'class': 'th' }, _('Interface')),
					E('th', { 'class': 'th' }, _('Protocol')),
					E('th', { 'class': 'th' }, _('Device')),
					E('th', { 'class': 'th' }, _('Assigned IP')),
					E('th', { 'class': 'th' }, _('Uptime')),
					E('th', { 'class': 'th', 'style': 'text-align: right;' }, _('Actions'))
				])
			]);

			vpnIfaces.forEach(function(ifc) {
				var isUp = !!ifc.up;
				var row = E('tr', { 'class': 'tr', 'style': 'border-bottom: 1px solid rgba(255,255,255,0.04);' }, [
					E('td', { 'class': 'td', 'style': 'font-weight: 600;' }, [
						E('span', { 'style': 'display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; background: ' + (isUp ? '#10b981' : '#ef4444') + ';' }),
						ifc.interface
					]),
					E('td', { 'class': 'td', 'style': 'text-transform: uppercase;' }, ifc.proto || '-'),
					E('td', { 'class': 'td', 'style': 'font-family: monospace;' }, ifc.l3_device || ifc.device || '-'),
					E('td', { 'class': 'td', 'style': 'font-family: monospace;' }, (ifc['ipv4-address'] && ifc['ipv4-address'][0]) ? ifc['ipv4-address'][0].address : '-'),
					E('td', { 'class': 'td' }, ifc.uptime ? '%t'.format(ifc.uptime) : '-'),
					E('td', { 'class': 'td', 'style': 'text-align: right;' }, [
						E('a', {
							'class': 'cbi-button cbi-button-neutral',
							'href': L.url('admin/network/network'),
							'style': 'font-size: 11px; padding: 3px 8px; border-radius: 4px;'
						}, _('Settings'))
					])
				]);
				table.appendChild(row);
			});

			tunnelsCard.appendChild(table);
		}

		container.appendChild(tunnelsCard);

		// Protocol Cards Grid
		var grid = E('div', {
			'style': 'display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 16px; margin-bottom: 24px;'
		});

		protocols.forEach(function(p) {
			var card = E('div', {
				'style': 'background: var(--proton-card-bg, rgba(255,255,255,0.03)); border: 1px solid var(--proton-border, rgba(255,255,255,0.08)); border-radius: 10px; padding: 18px 20px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 2px 8px rgba(0,0,0,0.15);'
			}, [
				E('div', {}, [
					E('div', { 'style': 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;' }, [
						E('div', { 'style': 'display: flex; align-items: center; gap: 8px;' }, [
							E('h3', { 'style': 'margin: 0; font-size: 16px; font-weight: 600; color: var(--proton-fg, #f5f7fa);' }, p.name),
							E('span', { 'style': 'font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 4px; background: ' + p.badgeColor + '22; color: ' + p.badgeColor + '; border: 1px solid ' + p.badgeColor + '44;' }, p.badge)
						]),
						E('span', { 'style': 'font-size: 11px; font-weight: 600; color: ' + p.statusColor + '; display: flex; align-items: center; gap: 5px;' }, [
							E('span', { 'style': 'width: 6px; height: 6px; border-radius: 50%; background: ' + p.statusColor + ';' }),
							p.status
						])
					]),
					E('p', { 'style': 'margin: 0 0 14px 0; font-size: 12px; color: var(--text-color-medium, #94a3b8); line-height: 1.4;' }, p.desc),
					
					// Accordion for Technical Specs
					E('details', { 'style': 'margin-bottom: 14px; font-size: 11px; cursor: pointer;' }, [
						E('summary', { 'style': 'color: var(--proton-accent, #38bdf8); font-weight: 500; outline: none; margin-bottom: 6px;' }, _('View Technical Specs')),
						E('div', { 'style': 'background: rgba(0,0,0,0.2); border-radius: 6px; padding: 8px 12px; display: flex; flex-direction: column; gap: 4px; margin-top: 4px;' }, [
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
				E('div', { 'style': 'display: flex; gap: 8px; justify-content: flex-end;' }, [
					E('button', {
						'class': 'cbi-button cbi-button-action',
						'style': 'font-size: 12px; font-weight: 600; padding: 6px 14px; border-radius: 5px;',
						'click': function() { self.openQuickSetupModal(p.id, p.name); }
					}, _('⚡ Quick Setup'))
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
