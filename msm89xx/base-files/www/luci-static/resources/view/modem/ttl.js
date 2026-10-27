'use strict';
'require view';
'require rpc';
'require ui';

/*
	Fix TTL / Hop Limit Management Interface
	Designed for Qualcomm Snapdragon 410 (MSM8916) LTE Modems
	Bypasses cellular hotspot / tethering restrictions by normalizing outbound packet TTLs.
*/

var callGetTTL = rpc.declare({
	object: 'luci.proton-system',
	method: 'getTTL',
	expect: { '': {} }
});

var callSetTTL = rpc.declare({
	object: 'luci.proton-system',
	method: 'setTTL',
	params: [ 'enabled', 'value' ],
	expect: { '': {} }
});

return view.extend({
	load: function() {
		return callGetTTL();
	},

	render: function(data) {
		var isEnabled = data && data.enabled ? true : false;
		var ttlVal = data && data.value ? data.value : 64;

		var viewRoot = E('div', { 'class': 'cbi-map', 'style': 'padding-bottom: 30px;' }, [
			E('h2', { 'style': 'margin-bottom: 6px; font-weight: 700;' }, _('Fix TTL & Hotspot Bypass')),
			E('div', { 'class': 'cbi-map-descr', 'style': 'margin-bottom: 24px; color: var(--proton-muted);' }, 
				_('Configure Time-To-Live (TTL) and Hop Limit (IPv6) rewriting on outbound traffic. This masks tethered/hotspot client packets so cellular carriers recognize all traffic as direct modem device traffic.')
			),

			E('div', { 'class': 'cbi-section', 'style': 'background: var(--proton-card-bg, rgba(255,255,255,0.03)); border: 1px solid var(--proton-border); border-radius: var(--proton-radius); padding: 22px; margin-bottom: 20px;' }, [
				E('div', { 'class': 'cbi-value', 'style': 'display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--proton-border); padding-bottom: 16px; margin-bottom: 16px;' }, [
					E('div', {}, [
						E('div', { 'style': 'font-weight: 600; font-size: 1rem; color: var(--proton-fg);' }, _('Enable TTL Spoofing / Fix')),
						E('div', { 'style': 'font-size: 0.85rem; color: var(--proton-muted);' }, _('Enforces a fixed TTL value on the forward chain across all client connections.'))
					]),
					E('input', {
						'type': 'checkbox',
						'id': 'ttl-enable-switch',
						'checked': isEnabled ? 'checked' : null,
						'change': function(ev) {
							var wrap = document.getElementById('ttl-value-section');
							if (wrap) wrap.style.opacity = ev.target.checked ? '1' : '0.5';
						}
					})
				]),

				E('div', { 'id': 'ttl-value-section', 'style': 'opacity: ' + (isEnabled ? '1' : '0.5') + '; transition: opacity .2s;' }, [
					E('div', { 'class': 'cbi-value', 'style': 'border-bottom: 1px solid var(--proton-border); padding-bottom: 16px; margin-bottom: 16px;' }, [
						E('label', { 'class': 'cbi-value-title', 'style': 'font-weight: 600; color: var(--proton-fg);' }, _('Target TTL Value:')),
						E('div', { 'class': 'cbi-value-field' }, [
							E('input', {
								'type': 'number',
								'id': 'ttl-input-val',
								'class': 'cbi-input-text',
								'value': ttlVal,
								'min': '1',
								'max': '255',
								'style': 'width: 140px; padding: 8px 12px; border-radius: var(--proton-radius-sm);'
							}),
							E('div', { 'class': 'cbi-value-description', 'style': 'margin-top: 6px; font-size: 0.82rem; color: var(--proton-muted);' }, [
								_('Common presets: '),
								E('a', {
									'href': '#',
									'style': 'color: var(--proton-accent); margin-right: 12px; font-weight: 600;',
									'click': function(ev) {
										ev.preventDefault();
										document.getElementById('ttl-input-val').value = '64';
									}
								}, '64 (Android / iOS / Linux Standard)'),
								E('a', {
									'href': '#',
									'style': 'color: var(--proton-accent); font-weight: 600;',
									'click': function(ev) {
										ev.preventDefault();
										document.getElementById('ttl-input-val').value = '65';
									}
								}, '65 (Windows / Multi-Hop Bypass)')
							])
						])
					]),

					E('div', { 'style': 'margin-top: 14px; padding: 14px; background: rgba(56, 189, 248, 0.08); border-left: 4px solid var(--proton-accent, #38bdf8); border-radius: var(--proton-radius-sm); font-size: 0.85rem;' }, [
						E('strong', { 'style': 'color: var(--proton-accent); display: block; margin-bottom: 4px;' }, _('How this works:')),
						_('When mobile phones, Windows laptops, or Smart TVs share this modem\'s connection, each hop naturally decrements the packet TTL by 1. Indonesian carriers (Telkomsel, Indosat, XL, Smartfren) inspect this to deduct quota from your hotspot allotment. Locking TTL to 64 forces all forwarded packets to match phone-native traffic.')
					])
				]),

				E('div', { 'style': 'margin-top: 24px; display: flex; justify-content: flex-end;' }, [
					E('button', {
						'class': 'cbi-button cbi-button-action',
						'style': 'padding: 9px 24px; font-weight: 600; border-radius: var(--proton-radius-sm);',
						'click': function() {
							var sw = document.getElementById('ttl-enable-switch');
							var inp = document.getElementById('ttl-input-val');
							var en = sw ? sw.checked : false;
							var val = inp ? parseInt(inp.value, 10) : 64;

							ui.showIndicator('ttl-apply', _('Applying TTL Rules...'));
							callSetTTL(en, val).then(function(res) {
								ui.hideIndicator('ttl-apply');
								if (res && res.success) {
									ui.addNotification(null, E('p', {}, _('TTL configuration updated successfully (TTL: %d, Status: %s).').format(res.value, res.enabled ? 'Enabled' : 'Disabled')), 'success');
								} else {
									ui.addNotification(null, E('p', {}, _('Failed to update TTL rules.')), 'danger');
								}
							}).catch(function(err) {
								ui.hideIndicator('ttl-apply');
								ui.addNotification(null, E('p', {}, err.message || _('Error communicating with system service.')), 'danger');
							});
						}
					}, _('Save & Apply Rules'))
				])
			])
		]);

		return viewRoot;
	}
});
