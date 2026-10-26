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
			uci.load('openvpn').catch(function() { return null; })
		]);
	},

	render: function(data) {
		var ifaces = data[0] || [];
		var services = data[1] || {};
		var openvpnLoaded = !!data[3];

		// Detect active VPN interfaces
		var vpnIfaces = ifaces.filter(function(ifc) {
			var p = ifc.proto || '';
			var n = ifc.interface || '';
			return (p === 'pptp' || p === 'l2tp' || p === 'sstp' || p === 'wireguard' || p === 'openvpn' || n.indexOf('vpn') >= 0);
		});

		var isOpenvpnRunning = services.openvpn && services.openvpn.instances && Object.keys(services.openvpn.instances).length > 0;
		var isSwanctlRunning = services.swanctl && services.swanctl.instances && Object.keys(services.swanctl.instances).length > 0;

		var protocols = [
			{
				id: 'openvpn',
				name: 'OpenVPN Client',
				badge: 'SSL/TLS Tunnel',
				badgeColor: '#3b82f6',
				desc: _('Industry-standard SSL/TLS VPN client supporting AES-256-GCM, TLS-Crypt, and single-file .ovpn profiles.'),
				port: 'UDP 1194 / TCP 443',
				crypto: 'AES-GCM, ChaCha20-Poly1305',
				layer: 'Layer 3 (TUN) / Layer 2 (TAP)',
				status: isOpenvpnRunning ? _('Active / Running') : _('Ready (Service Installed)'),
				statusColor: isOpenvpnRunning ? '#10b981' : '#64748b',
				primaryBtn: {
					label: _('OpenVPN Manager'),
					url: L.url('admin/vpn/openvpn'),
					class: 'cbi-button cbi-button-action'
				}
			},
			{
				id: 'ipsec',
				name: 'strongSwan IPsec / IKEv2',
				badge: 'IKEv1 / IKEv2',
				badgeColor: '#8b5cf6',
				desc: _('Enterprise-grade IPsec client compatible with Cisco ASA, MikroTik RouterOS, FortiGate, and pfSense/OPNsense gateways.'),
				port: 'UDP 500 / UDP 4500 (NAT-T)',
				crypto: 'AES-256-GCM, SHA2-384, DH Group 14/19',
				layer: 'Layer 3 ESP IPsec Tunnel',
				status: isSwanctlRunning ? _('Active / Running') : _('Ready (swanctl Installed)'),
				statusColor: isSwanctlRunning ? '#10b981' : '#64748b',
				primaryBtn: {
					label: _('IPsec / swanctl Manager'),
					url: L.url('admin/vpn/strongswan-swanctl'),
					class: 'cbi-button cbi-button-action'
				}
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
				status: _('Kernel & Proto Ready'),
				statusColor: '#10b981',
				primaryBtn: {
					label: _('Create SSTP Interface'),
					url: L.url('admin/network/network'),
					class: 'cbi-button cbi-button-neutral'
				}
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
				status: _('xl2tpd Daemon Ready'),
				statusColor: '#10b981',
				primaryBtn: {
					label: _('Create L2TP Interface'),
					url: L.url('admin/network/network'),
					class: 'cbi-button cbi-button-neutral'
				}
			},
			{
				id: 'pptp',
				name: 'PPTP Client',
				badge: 'Point-to-Point',
				badgeColor: '#f59e0b',
				desc: _('Lightweight Point-to-Point Tunneling Protocol client for high-throughput connectivity on low-overhead mobile links and legacy appliances.'),
				port: 'TCP 1723 + IP GRE (Proto 47)',
				crypto: 'MPPE 128-bit + MS-CHAPv2',
				layer: 'Layer 3 GRE / PPP',
				status: _('kmod-pptp Ready'),
				statusColor: '#10b981',
				primaryBtn: {
					label: _('Create PPTP Interface'),
					url: L.url('admin/network/network'),
					class: 'cbi-button cbi-button-neutral'
				}
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
						E('span', { 'style': 'font-size: 22px;' }, '🛡️'),
						E('h2', { 'style': 'margin: 0; font-size: 20px; font-weight: 700; color: var(--proton-fg, #f5f7fa);' }, _('Travel VPN Client Gateway')),
						E('span', { 'style': 'font-size: 11px; font-weight: bold; padding: 2px 8px; border-radius: 10px; background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);' }, _('5 Protocols Ready'))
					]),
					E('p', { 'style': 'margin: 0; font-size: 13px; color: var(--text-color-medium, #94a3b8); max-width: 780px; line-height: 1.5;' }, 
						_('Equipped with 5 enterprise and stealth VPN client suites (OpenVPN, strongSwan IPsec, L2TP, PPTP, and SSTP). Configure client tunnels below to protect mobile internet browsing, encrypt public Wi-Fi traffic, and connect directly to private corporate or home networks.')
					)
				]),
				E('div', { 'style': 'display: flex; gap: 10px; flex-wrap: wrap;' }, [
					E('a', {
						'class': 'cbi-button cbi-button-action',
						'href': L.url('admin/network/network'),
						'style': 'font-size: 12px; font-weight: 600; padding: 7px 16px; border-radius: 6px;'
					}, _('+ Add VPN Interface')),
					E('a', {
						'class': 'cbi-button cbi-button-neutral',
						'href': L.url('admin/status/overview'),
						'style': 'font-size: 12px; padding: 7px 14px; border-radius: 6px;'
					}, _('Network Overview'))
				])
			])
		]));

		// Protocol Cards Grid (Responsive 2 columns)
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
					E('div', { 'style': 'background: rgba(0,0,0,0.15); border-radius: 6px; padding: 8px 12px; margin-bottom: 16px; font-size: 11px; display: flex; flex-direction: column; gap: 4px;' }, [
						E('div', { 'style': 'display: flex; justify-content: space-between;' }, [
							E('span', { 'style': 'color: var(--text-color-medium, #94a3b8);' }, _('Ports:')),
							E('span', { 'style': 'font-family: monospace; font-weight: 600;' }, p.port)
						]),
						E('div', { 'style': 'display: flex; justify-content: space-between;' }, [
							E('span', { 'style': 'color: var(--text-color-medium, #94a3b8);' }, _('Encapsulation:')),
							E('span', { 'style': 'font-weight: 500;' }, p.layer)
						]),
						E('div', { 'style': 'display: flex; justify-content: space-between;' }, [
							E('span', { 'style': 'color: var(--text-color-medium, #94a3b8);' }, _('Crypto Ciphers:')),
							E('span', { 'style': 'font-weight: 500;' }, p.crypto)
						])
					])
				]),
				E('div', { 'style': 'display: flex; gap: 8px; justify-content: flex-end;' }, [
					E('a', {
						'class': p.primaryBtn.class,
						'href': p.primaryBtn.url,
						'style': 'font-size: 12px; font-weight: 600; padding: 6px 14px; border-radius: 5px; text-decoration: none;'
					}, p.primaryBtn.label)
				])
			]);
			grid.appendChild(card);
		});

		container.appendChild(grid);

		// Active VPN Tunnels Section
		var tunnelsCard = E('div', {
			'style': 'background: var(--proton-card-bg, rgba(255,255,255,0.03)); border: 1px solid var(--proton-border, rgba(255,255,255,0.08)); border-radius: 10px; padding: 18px 20px;'
		});

		tunnelsCard.appendChild(E('div', { 'style': 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;' }, [
			E('div', {}, [
				E('h3', { 'style': 'margin: 0 0 4px 0; font-size: 15px; font-weight: 600;' }, _('Active VPN Interfaces & Tunnels')),
				E('p', { 'style': 'margin: 0; font-size: 12px; color: var(--text-color-medium, #94a3b8);' }, _('Network interfaces currently designated for VPN tunnels and secure uplink routing.'))
			]),
			E('a', {
				'class': 'cbi-button cbi-button-action',
				'href': L.url('admin/network/network'),
				'style': 'font-size: 12px; padding: 6px 14px; border-radius: 5px;'
			}, _('Configure in Interfaces'))
		]));

		if (vpnIfaces.length === 0) {
			tunnelsCard.appendChild(E('div', {
				'style': 'padding: 24px; text-align: center; color: var(--text-color-medium, #94a3b8); font-size: 13px; background: rgba(0,0,0,0.1); border-radius: 6px; border: 1px dashed var(--proton-border, rgba(255,255,255,0.1));'
			}, [
				E('p', { 'style': 'margin: 0 0 6px 0; font-weight: 600;' }, _('No active VPN client interfaces configured yet.')),
				E('p', { 'style': 'margin: 0; font-size: 12px;' }, _('Upload an .ovpn file in OpenVPN Manager or create a new interface with protocol PPTP, L2TP, or SSTP under Network > Interfaces.'))
			]));
		} else {
			var table = E('table', { 'class': 'table', 'style': 'width: 100%; border-collapse: collapse; font-size: 12px;' }, [
				E('tr', { 'class': 'tr table-titles', 'style': 'border-bottom: 1px solid var(--proton-border, rgba(255,255,255,0.1));' }, [
					E('th', { 'class': 'th' }, _('Interface')),
					E('th', { 'class': 'th' }, _('Protocol')),
					E('th', { 'class': 'th' }, _('Device')),
					E('th', { 'class': 'th' }, _('IP Address')),
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
						}, _('Edit'))
					])
				]);
				table.appendChild(row);
			});

			tunnelsCard.appendChild(table);
		}

		container.appendChild(tunnelsCard);

		return container;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
