'use strict';
'require dom';
'require rpc';
'require ui';
'require view';

/*
	Qualcomm MSM8916 Cellular RF Cockpit, Deep Diagnostics & LTE Band Locking
	Proton2025 Professional Dark Theme
	Layout Hierarchy:
	1. Top Header & Toolbar (Vector Refresh & Live Sync)
	2. Row 1: Serving Cell & Tower (Left) & Compact 5-Gauge Signal Meter (Right)
	3. Row 2: Carrier Session (Left) & Hardware Profile (Right)
	4. Row 3: LTE Band Locking Controls
	5. Row 4: Advanced RF Diagnostics (Waveform Canvas & Neighboring Towers)
*/

var callGetSignal = rpc.declare({
	object: 'luci.proton-system',
	method: 'getSignalDetails',
	expect: { '': {} }
});

var callSetBandLock = rpc.declare({
	object: 'luci.proton-system',
	method: 'setBandLock',
	params: [ 'bands' ],
	expect: { '': {} }
});

var ALL_BANDS = [
	{ id: 'eutran-1', name: 'LTE Band 1 (2100 MHz)', telco: 'Indosat, Telkomsel, XL', type: 'FDD' },
	{ id: 'eutran-3', name: 'LTE Band 3 (1800 MHz)', telco: 'Indosat, Telkomsel, XL, Smartfren', type: 'FDD' },
	{ id: 'eutran-5', name: 'LTE Band 5 (850 MHz)', telco: 'Smartfren', type: 'FDD' },
	{ id: 'eutran-7', name: 'LTE Band 7 (2600 MHz)', telco: 'International / Roaming', type: 'FDD' },
	{ id: 'eutran-8', name: 'LTE Band 8 (900 MHz)', telco: 'Indosat, Telkomsel, XL', type: 'FDD' },
	{ id: 'eutran-20', name: 'LTE Band 20 (800 MHz)', telco: 'International / Rural', type: 'FDD' },
	{ id: 'eutran-38', name: 'LTE Band 38 (2600 MHz)', telco: 'TDD Network', type: 'TDD' },
	{ id: 'eutran-40', name: 'LTE Band 40 (2300 MHz)', telco: 'Telkomsel, Smartfren', type: 'TDD' },
	{ id: 'eutran-41', name: 'LTE Band 41 (2500 MHz)', telco: 'TDD Network', type: 'TDD' },
	{ id: 'utran-1', name: 'WCDMA 2100 MHz', telco: '3G Fallback', type: '3G' },
	{ id: 'utran-8', name: 'WCDMA 900 MHz', telco: '3G Fallback', type: '3G' }
];

function createInfoRow(label, valId, defaultVal, isMonospace, color, isLast) {
	return E('div', {
		'class': 'rf-info-row',
		'style': 'display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: ' + (isLast ? 'none' : '1px solid rgba(255,255,255,0.05)') + '; font-size: 12px;'
	}, [
		E('span', { 'style': 'color: var(--text-color-medium);' }, label),
		E('span', {
			'id': valId,
			'style': 'font-weight: 600;' + (isMonospace ? ' font-family: monospace;' : '') + (color ? ' color: ' + color + ';' : '')
		}, defaultVal || '--')
	]);
}

function createGaugeRow(label, desc, valId, badgeId, barId, minLabel, maxLabel, isLast) {
	return E('div', {
		'class': 'rf-gauge-item',
		'style': 'padding: 6px 0; ' + (isLast ? '' : 'border-bottom: 1px solid rgba(255,255,255,0.05);')
	}, [
		E('div', { 'style': 'display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 3px;' }, [
			E('div', { 'style': 'display: flex; align-items: baseline; gap: 6px;' }, [
				E('span', { 'style': 'font-weight: 700; font-size: 12px; color: var(--text-color-high);' }, label),
				E('span', { 'style': 'font-size: 10px; color: var(--text-color-medium);' }, '(' + desc + ')')
			]),
			E('div', { 'style': 'display: flex; align-items: center; gap: 8px;' }, [
				E('span', { 'id': valId, 'style': 'font-family: monospace; font-size: 13px; font-weight: bold;' }, '--'),
				E('span', { 'id': badgeId, 'class': 'badge', 'style': 'font-size: 10px; padding: 1px 6px; border-radius: 4px;' }, '--')
			])
		]),
		E('div', {
			'style': 'width: 100%; height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden; position: relative; margin: 3px 0 2px;'
		}, [
			E('div', {
				'id': barId,
				'style': 'width: 5%; min-width: 4px; height: 100%; border-radius: 3px; background: #3b82f6; transition: width 0.4s ease, background-color 0.4s ease;'
			})
		]),
		E('div', { 'style': 'display: flex; justify-content: space-between; font-size: 9px; color: var(--text-color-medium); font-family: monospace; opacity: 0.85;' }, [
			E('span', {}, minLabel),
			E('span', {}, maxLabel)
		])
	]);
}

function getSignalGrade(type, val) {
	var n = parseFloat(val);
	if (isNaN(n)) return { label: '--', color: '#64748b', pct: 0 };

	if (type === 'rsrp') {
		// LTE RSRP: -140 (0%) to -60 dBm (100%)
		var pct = Math.max(5, Math.min(100, Math.round(((n + 140) / 80) * 100)));
		if (n >= -85) return { label: _('Excellent'), color: '#10b981', pct: pct };
		if (n >= -95) return { label: _('Good'), color: '#38bdf8', pct: pct };
		if (n >= -105) return { label: _('Fair'), color: '#f59e0b', pct: pct };
		if (n >= -115) return { label: _('Poor'), color: '#f97316', pct: pct };
		return { label: _('Very Poor'), color: '#ef4444', pct: pct };
	} else if (type === 'sinr') {
		// LTE SINR: -15 (0%) to +25 dB (100%)
		var pct = Math.max(5, Math.min(100, Math.round(((n + 15) / 40) * 100)));
		if (n >= 15) return { label: _('Excellent'), color: '#10b981', pct: pct };
		if (n >= 7) return { label: _('Good'), color: '#38bdf8', pct: pct };
		if (n >= 0) return { label: _('Fair'), color: '#f59e0b', pct: pct };
		return { label: _('High Noise'), color: '#ef4444', pct: pct };
	} else if (type === 'rsrq') {
		// LTE RSRQ: -20 (0%) to -3 dB (100%)
		var pct = Math.max(5, Math.min(100, Math.round(((n + 20) / 17) * 100)));
		if (n >= -8) return { label: _('Excellent'), color: '#10b981', pct: pct };
		if (n >= -12) return { label: _('Good'), color: '#38bdf8', pct: pct };
		if (n >= -16) return { label: _('Fair'), color: '#f59e0b', pct: pct };
		return { label: _('Poor'), color: '#ef4444', pct: pct };
	} else if (type === 'rssi') {
		// LTE RSSI: -110 (0%) to -50 dBm (100%)
		var pct = Math.max(5, Math.min(100, Math.round(((n + 110) / 60) * 100)));
		if (n >= -65) return { label: _('Strong'), color: '#10b981', pct: pct };
		if (n >= -75) return { label: _('Normal'), color: '#38bdf8', pct: pct };
		if (n >= -85) return { label: _('Moderate'), color: '#f59e0b', pct: pct };
		return { label: _('Weak'), color: '#ef4444', pct: pct };
	} else if (type === 'csq') {
		// CSQ: 0 to 31
		var pct = Math.max(5, Math.min(100, Math.round((n / 31) * 100)));
		if (n >= 25) return { label: _('Maximum'), color: '#10b981', pct: pct };
		if (n >= 18) return { label: _('Good'), color: '#38bdf8', pct: pct };
		if (n >= 12) return { label: _('Fair'), color: '#f59e0b', pct: pct };
		return { label: _('Low'), color: '#ef4444', pct: pct };
	}
	return { label: '--', color: '#64748b', pct: 0 };
}

return view.extend({
	pollTimer: null,
	pollInterval: 3000,
	isPolling: false,
	historyRSRP: [],
	historySINR: [],
	maxHistoryPoints: 20,

	load: function() {
		return callGetSignal();
	},

	showPushToast: function(type, message, details) {
		var existing = document.getElementById('rf-floating-toast');
		if (existing && existing.parentNode) {
			existing.parentNode.removeChild(existing);
		}

		var bgColor = '#1e293b';
		var borderColor = '#38bdf8';
		var icon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>';

		if (type === 'success') {
			bgColor = '#064e3b';
			borderColor = '#10b981';
			icon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
		} else if (type === 'error') {
			bgColor = '#450a0a';
			borderColor = '#ef4444';
			icon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
		} else if (type === 'loading') {
			bgColor = '#0f172a';
			borderColor = '#60a5fa';
			icon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spinning"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>';
		}

		var toast = E('div', {
			'id': 'rf-floating-toast',
			'style': 'position: fixed; top: 76px; left: 50%; transform: translateX(-50%); z-index: 999999; display: flex; align-items: center; gap: 12px; background: ' + bgColor + '; border: 1.5px solid ' + borderColor + '; padding: 12px 20px; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.6); max-width: 90vw; min-width: 300px; color: #fff; font-family: inherit; transition: opacity 0.3s ease, transform 0.3s ease; animation: rfToastIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);'
		}, [
			E('div', { 'style': 'display: flex; align-items: center; justify-content: center;' }, [
				dom.create('span', {}, icon)
			]),
			E('div', { 'style': 'flex: 1; font-size: 13px; line-height: 1.4;' }, [
				E('div', { 'style': 'font-weight: bold; font-size: 13.5px;' }, message),
				details ? E('div', { 'style': 'font-size: 11.5px; opacity: 0.85; margin-top: 2px;' }, details) : ''
			]),
			E('button', {
				'style': 'background: transparent; border: none; color: rgba(255,255,255,0.6); cursor: pointer; font-size: 16px; padding: 0 4px; line-height: 1;',
				'click': function() {
					if (toast.parentNode) toast.parentNode.removeChild(toast);
				}
			}, '×')
		]);

		document.body.appendChild(toast);

		if (type !== 'loading') {
			setTimeout(function() {
				if (toast && toast.parentNode) {
					toast.style.opacity = '0';
					toast.style.transform = 'translateX(-50%) translateY(-10px)';
					setTimeout(function() {
						if (toast.parentNode) toast.parentNode.removeChild(toast);
					}, 300);
				}
			}, 4000);
		}
	},

	updateGauge: function(type, val, valId, badgeId, barId, unit) {
		var elVal = document.getElementById(valId);
		var elBadge = document.getElementById(badgeId);
		var elBar = document.getElementById(barId);
		if (!elVal || !elBadge || !elBar) return;

		var num = parseFloat(val);
		if (isNaN(num) || val === '--') {
			elVal.textContent = '--';
			elBadge.textContent = '--';
			elBadge.style.color = '#64748b';
			elBadge.style.background = 'rgba(100,116,139,0.1)';
			elBar.style.width = '0%';
			return;
		}

		var grade = getSignalGrade(type, num);
		elVal.textContent = (type === 'csq' ? val + '/31' : val + (unit ? ' ' + unit : ''));
		elBadge.textContent = grade.label;
		elBadge.style.color = grade.color;
		elBadge.style.background = grade.color + '22';
		elBadge.style.border = '1px solid ' + grade.color + '55';
		elBar.style.width = grade.pct + '%';
		elBar.style.backgroundColor = grade.color;
	},

	updateLiveMetrics: function(data) {
		if (!data) return;
		var s = data.serving || {};
		var sig = data.signal || {};
		var op = data.operator || {};
		var b = data.bearer || {};
		var hw = data.hardware || {};

		// 1. Serving Cell & BTS Tower
		var elBandBadge = document.getElementById('rf-band-badge');
		if (elBandBadge) elBandBadge.textContent = s.band || 'LTE';

		var elBandName = document.getElementById('rf-band-name');
		if (elBandName) elBandName.textContent = s.band_name || '4G LTE';

		var elDuplex = document.getElementById('rf-duplex-badge');
		if (elDuplex) elDuplex.textContent = s.duplex || 'LTE';

		var elDl = document.getElementById('rf-freq-dl');
		if (elDl) elDl.textContent = s.dl || '--';

		var elUl = document.getElementById('rf-freq-ul');
		if (elUl) elUl.textContent = s.ul || '--';

		var elEarfcn = document.getElementById('rf-earfcn');
		if (elEarfcn) elEarfcn.textContent = s.earfcn || '--';

		var elOp = document.getElementById('rf-operator');
		if (elOp) elOp.textContent = (op.name ? op.name + ' (' + (op.code || '51001') + ')' : 'Indosat Ooredoo (51001)');

		var elEnb = document.getElementById('rf-enb-val');
		if (elEnb) elEnb.textContent = s.enb || '--';

		var elSector = document.getElementById('rf-sector-val');
		if (elSector) elSector.textContent = s.sector || '--';

		var elPci = document.getElementById('rf-pci-val');
		if (elPci) elPci.textContent = s.pci || '--';

		var elCid = document.getElementById('rf-cid-val');
		if (elCid) elCid.textContent = (s.cell_id_hex && s.cell_id_hex !== '--') ? s.cell_id_hex + ' (' + s.cell_id_dec + ')' : '--';

		var elTac = document.getElementById('rf-tac-val');
		if (elTac) elTac.textContent = (s.tac_hex && s.tac_hex !== '--') ? s.tac_hex + ' (' + s.tac_dec + ')' : '--';

		// 2. Radio Signal Quality Gauges (5 Metrik Padat)
		this.updateGauge('rsrp', sig.rsrp, 'rf-rsrp-val', 'rf-rsrp-badge', 'rf-rsrp-bar', 'dBm');
		this.updateGauge('sinr', sig.snr, 'rf-sinr-val', 'rf-sinr-badge', 'rf-sinr-bar', 'dB');
		this.updateGauge('rsrq', sig.rsrq, 'rf-rsrq-val', 'rf-rsrq-badge', 'rf-rsrq-bar', 'dB');
		this.updateGauge('rssi', sig.rssi, 'rf-rssi-val', 'rf-rssi-badge', 'rf-rssi-bar', 'dBm');
		this.updateGauge('csq', sig.csq, 'rf-csq-val', 'rf-csq-badge', 'rf-csq-bar', null);

		// 3. Carrier Data Session
		var elIp = document.getElementById('rf-ip-val');
		if (elIp) elIp.textContent = b.ip || '--';

		var elGw = document.getElementById('rf-gw-val');
		if (elGw) elGw.textContent = b.gateway || '--';

		var elDns = document.getElementById('rf-dns-val');
		if (elDns) elDns.textContent = (b.dns && b.dns.length) ? b.dns.join(', ') : '--';

		var elApn = document.getElementById('rf-apn-val');
		if (elApn) elApn.textContent = (b.apn || 'internet') + ' (MTU: ' + (b.mtu || '1500') + ')';

		var elUptime = document.getElementById('rf-uptime-val');
		if (elUptime) elUptime.textContent = b.uptime || '00d 00h:00m:00s';

		var elTraffic = document.getElementById('rf-traffic-val');
		if (elTraffic) elTraffic.textContent = 'RX: ' + (b.rx || '0 B') + '  |  TX: ' + (b.tx || '0 B');

		// 4. Hardware & SIM Profile
		var elImei = document.getElementById('rf-imei-val');
		if (elImei) elImei.textContent = hw.imei || '--';

		var elImsi = document.getElementById('rf-imsi-val');
		if (elImsi) elImsi.textContent = hw.imsi || '--';

		var elIccid = document.getElementById('rf-iccid-val');
		if (elIccid) elIccid.textContent = hw.iccid || '--';

		var elFw = document.getElementById('rf-fw-val');
		if (elFw) elFw.textContent = hw.revision || '--';

		// 5. Active Locked Band Status Badge
		var elLockBadge = document.getElementById('rf-locked-status-badge');
		if (elLockBadge) {
			var cbands = data.current_bands || [];
			if (cbands.length === 0 && data.persisted_bands && data.persisted_bands !== 'all') {
				cbands = data.persisted_bands.split('|');
			}

			if (cbands.length === 1) {
				var matched = ALL_BANDS.find(function(b) { return b.id === cbands[0]; });
				elLockBadge.textContent = _('Locked: ') + (matched ? matched.name : cbands[0]);
				elLockBadge.style.color = '#38bdf8';
				elLockBadge.style.background = 'rgba(56,189,248,0.15)';
				elLockBadge.style.border = '1px solid rgba(56,189,248,0.4)';
			} else if (cbands.length > 1 && cbands.length < ALL_BANDS.length) {
				elLockBadge.textContent = _('Locked: Multi-Band (' + cbands.length + ' bands)');
				elLockBadge.style.color = '#a78bfa';
				elLockBadge.style.background = 'rgba(167,139,250,0.15)';
				elLockBadge.style.border = '1px solid rgba(167,139,250,0.4)';
			} else {
				elLockBadge.textContent = _('Mode: Auto (All Bands)');
				elLockBadge.style.color = '#10b981';
				elLockBadge.style.background = 'rgba(16,185,129,0.15)';
				elLockBadge.style.border = '1px solid rgba(16,185,129,0.4)';
			}
		}

		// 6. Waveform Canvas
		var rsrpNum = parseFloat(sig.rsrp);
		var sinrNum = parseFloat(sig.snr);
		if (!isNaN(rsrpNum)) {
			this.historyRSRP.push(rsrpNum);
			if (this.historyRSRP.length > this.maxHistoryPoints) this.historyRSRP.shift();
		}
		if (!isNaN(sinrNum)) {
			this.historySINR.push(sinrNum);
			if (this.historySINR.length > this.maxHistoryPoints) this.historySINR.shift();
		}
		this.drawWaveform();

		// 7. Neighbor Cells Table
		var nbBody = document.getElementById('rf-neighbors-body');
		if (nbBody) {
			dom.content(nbBody, []);
			if (data.neighbors && data.neighbors.length > 0) {
				data.neighbors.forEach(function(n) {
					nbBody.appendChild(E('tr', {}, [
						E('td', { 'style': 'font-weight: bold;' }, n.band || 'LTE'),
						E('td', { 'style': 'font-family: monospace;' }, n.earfcn || '--'),
						E('td', { 'style': 'font-family: monospace;' }, n.pci || '--'),
						E('td', { 'style': 'font-family: monospace; font-weight: 600;' }, n.rsrp ? n.rsrp + ' dBm' : '--'),
						E('td', { 'style': 'font-family: monospace;' }, n.rsrq ? n.rsrq + ' dB' : '--'),
						E('td', { 'style': 'font-family: monospace; color: ' + (n.delta && n.delta.indexOf('+') >= 0 ? '#10b981' : '#f59e0b') + ';' }, n.delta || '--')
					]));
				});
			} else {
				nbBody.appendChild(E('tr', {}, [
					E('td', { 'colspan': 6, 'style': 'text-align: center; color: var(--text-color-medium); font-style: italic; padding: 12px;' }, 
						_('No neighboring LTE carrier cells detected in current radio sector.')
					)
				]));
			}
		}
	},

	drawWaveform: function() {
		var cvs = document.getElementById('rf-waveform-canvas');
		if (!cvs || !cvs.getContext) return;
		var ctx = cvs.getContext('2d');
		var w = cvs.width = cvs.offsetWidth;
		var h = cvs.height = cvs.offsetHeight;
		ctx.clearRect(0, 0, w, h);

		// Grid lines
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
		ctx.lineWidth = 1;
		for (var y = 20; y < h; y += 30) {
			ctx.beginPath();
			ctx.moveTo(0, y);
			ctx.lineTo(w, y);
			ctx.stroke();
		}

		if (this.historyRSRP.length < 2) return;

		var step = w / (this.maxHistoryPoints - 1);

		// RSRP: -140 to -60 dBm
		ctx.strokeStyle = '#38bdf8';
		ctx.lineWidth = 2;
		ctx.beginPath();
		for (var i = 0; i < this.historyRSRP.length; i++) {
			var val = this.historyRSRP[i];
			var norm = (val - (-140)) / 80;
			var py = h - (norm * (h - 20) + 10);
			var px = i * step;
			if (i === 0) ctx.moveTo(px, py);
			else ctx.lineTo(px, py);
		}
		ctx.stroke();

		// SINR: -15 to +25 dB
		if (this.historySINR.length >= 2) {
			ctx.strokeStyle = '#34d399';
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			for (var j = 0; j < this.historySINR.length; j++) {
				var sval = this.historySINR[j];
				var snorm = (sval - (-15)) / 40;
				var spy = h - (snorm * (h - 20) + 10);
				var spx = j * step;
				if (j === 0) ctx.moveTo(spx, spy);
				else ctx.lineTo(spx, spy);
			}
			ctx.stroke();
		}
	},

	applyBandSelection: function(bandString) {
		var self = this;
		this.showPushToast('loading', _('Applying LTE Band Lock...'), _('Instructing Qualcomm baseband to re-attach to selected carriers.'));

		callSetBandLock(bandString).then(function(res) {
			if (res && res.success) {
				self.showPushToast('success', _('Band Lock Applied Successfully!'), _('Active Carrier: ') + res.bands);
				// Poll immediately after 1s
				setTimeout(function() {
					callGetSignal().then(function(d) {
						self.updateLiveMetrics(d);
					});
				}, 1200);
			} else {
				var errMsg = (res && res.output) ? res.output : _('Baseband rejected band configuration.');
				self.showPushToast('error', _('Failed to Apply Band Lock'), errMsg);
			}
		}).catch(function(err) {
			self.showPushToast('error', _('RPC Communication Error'), err.message || err);
		});
	},

	startPolling: function(intervalMs) {
		var self = this;
		if (this.pollTimer) clearInterval(this.pollTimer);
		this.pollInterval = intervalMs;
		this.isPolling = false;

		var elBadge = document.getElementById('rf-poll-badge');
		if (elBadge) {
			if (intervalMs > 0) {
				elBadge.innerHTML = '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#10b981;margin-right:6px;box-shadow:0 0 6px #10b981;"></span>' + _('Live Sync: ') + (intervalMs / 1000) + 's';
				elBadge.style.color = 'var(--text-color-medium)';
			} else {
				elBadge.innerHTML = '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#64748b;margin-right:6px;"></span>' + _('Paused');
				elBadge.style.color = '#94a3b8';
			}
		}

		if (intervalMs > 0) {
			this.pollTimer = setInterval(function() {
				if (self.isPolling) return;
				self.isPolling = true;
				callGetSignal().then(function(d) {
					self.updateLiveMetrics(d);
				}).catch(function() {}).finally(function() {
					self.isPolling = false;
				});
			}, intervalMs);
		}
	},

	render: function(initialData) {
		var self = this;
		var currBands = (initialData && initialData.current_bands && initialData.current_bands.length > 0)
			? initialData.current_bands
			: ((initialData && initialData.persisted_bands && initialData.persisted_bands !== 'all') ? initialData.persisted_bands.split('|') : []);

		this.startPolling(3000);

		// Presets Buttons
		var presets = [
			{ label: 'Auto (All Bands)', bands: 'all' },
			{ label: 'Lock B1 (2100 MHz)', bands: 'eutran-1' },
			{ label: 'Lock B3 (1800 MHz)', bands: 'eutran-3' },
			{ label: 'Lock B8 (900 MHz)', bands: 'eutran-8' },
			{ label: 'Lock B40 (2300 MHz)', bands: 'eutran-40' },
			{ label: 'Lock B1 + B3', bands: 'eutran-1|eutran-3' },
			{ label: 'Lock B3 + B8', bands: 'eutran-3|eutran-8' }
		];

		var presetButtons = E('div', {
			'style': 'display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0;'
		});

		presets.forEach(function(item) {
			presetButtons.appendChild(
				E('button', {
					'class': 'cbi-button cbi-button-neutral',
					'style': 'font-size: 12px; padding: 6px 14px; border-radius: 6px; cursor: pointer; transition: all 0.2s;',
					'click': function(ev) {
						ev.preventDefault();
						var targetBands = (item.bands === 'all' || item.bands === 'AUTO')
							? ALL_BANDS.map(function(b) { return b.id; })
							: item.bands.split('|');
						ALL_BANDS.forEach(function(b) {
							var cb = document.getElementById('cb-band-' + b.id);
							if (cb) cb.checked = (targetBands.indexOf(b.id) >= 0);
						});
					}
				}, item.label)
			);
		});

		// Checkbox Grid
		var bandGrid = E('div', {
			'style': 'display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; margin-top: 15px;'
		});

		ALL_BANDS.forEach(function(b) {
			var isChecked = false;
			if (currBands.length === 0 || currBands.length === ALL_BANDS.length) {
				isChecked = true;
			} else {
				isChecked = (currBands.indexOf(b.id) >= 0);
			}

			var cb = E('input', {
				'type': 'checkbox',
				'id': 'cb-band-' + b.id,
				'value': b.id,
				'style': 'margin-top: 2px;'
			});
			cb.checked = isChecked;

			bandGrid.appendChild(
				E('label', {
					'class': 'cbi-checkbox',
					'style': 'display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color-medium); border-radius: 6px; cursor: pointer;'
				}, [
					cb,
					E('div', {}, [
						E('div', { 'style': 'font-weight: bold; font-size: 13px; display: flex; align-items: center; gap: 6px;' }, [
							E('span', {}, b.name),
							E('span', { 'class': 'badge', 'style': 'font-size: 10px; padding: 1px 5px; background: rgba(255,255,255,0.06); border-radius: 3px;' }, b.type)
						]),
						E('div', { 'style': 'font-size: 11px; color: var(--text-color-medium); margin-top: 2px;' }, b.telco)
					])
				])
			);
		});

		// Action Buttons
		var actionButtons = E('div', {
			'style': 'display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px;'
		}, [
			E('button', {
				'class': 'cbi-button cbi-button-action',
				'style': 'font-size: 13.5px; font-weight: bold; padding: 9px 26px; border-radius: 6px; cursor: pointer; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: #fff; box-shadow: 0 4px 14px rgba(59, 130, 246, 0.4); border: none;',
				'click': function(ev) {
					ev.preventDefault();
					var selected = [];
					ALL_BANDS.forEach(function(b) {
						var cb = document.getElementById('cb-band-' + b.id);
						if (cb && cb.checked) selected.push(b.id);
					});
					if (selected.length === 0) {
						self.showPushToast('error', _('Selection Error'), _('Please select at least one LTE carrier band before applying.'));
						return;
					}
					var bandStr = (selected.length === ALL_BANDS.length) ? 'all' : selected.join('|');
					self.applyBandSelection(bandStr);
				}
			}, _('Apply Band Lock')),

			E('button', {
				'class': 'cbi-button cbi-button-neutral',
				'style': 'font-size: 13px; padding: 9px 18px; border-radius: 6px; cursor: pointer;',
				'click': function(ev) {
					ev.preventDefault();
					ALL_BANDS.forEach(function(b) {
						var cb = document.getElementById('cb-band-' + b.id);
						if (cb) cb.checked = true;
					});
				}
			}, _('Select All (Auto Bands)'))
		]);

		// Main View Layout
		var viewRoot = E('div', { 'class': 'cbi-map', 'style': 'padding-bottom: 30px;' }, [
			// 1. Header & Live Diagnostics Toolbar
			E('div', {
				'style': 'display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; border-bottom: 1px solid var(--border-color-medium); padding-bottom: 12px;'
			}, [
				E('div', {}, [
					E('h2', { 'style': 'margin: 0 0 4px; font-size: 18px; font-weight: bold;' }, _('Cellular RF Diagnostics & LTE Band Lock')),
					E('div', { 'style': 'font-size: 12px; color: var(--text-color-medium);' }, 
						_('Real-time Qualcomm Snapdragon 410 LTE Radio telemetry, Carrier Session, and Frequency Lock.')
					)
				]),
				E('div', { 'style': 'display: flex; align-items: center; gap: 8px;' }, [
					E('span', {
						'id': 'rf-poll-badge',
						'style': 'font-size: 11px; display: inline-flex; align-items: center; color: var(--text-color-medium); user-select: none; margin-right: 4px;'
					}, [
						E('span', { 'style': 'display:inline-block;width:6px;height:6px;border-radius:50%;background:#10b981;margin-right:6px;box-shadow:0 0 6px #10b981;' }),
						_('Live Sync: 3s')
					]),
					E('select', {
						'class': 'cbi-input-select',
						'style': 'font-size: 11px; padding: 3px 8px; height: 26px; border-radius: 4px;',
						'change': function(ev) {
							self.startPolling(parseInt(ev.target.value));
						}
					}, [
						E('option', { 'value': '1000' }, '1s'),
						E('option', { 'value': '2000' }, '2s'),
						E('option', { 'value': '3000', 'selected': 'selected' }, '3s'),
						E('option', { 'value': '5000' }, '5s'),
						E('option', { 'value': '0' }, _('Pause'))
					]),
					E('button', {
						'class': 'cbi-button cbi-button-neutral',
						'title': _('Refresh Data Now'),
						'style': 'padding: 4px 8px; height: 26px; display: inline-flex; align-items: center; justify-content: center;',
						'click': function(ev) {
							ev.preventDefault();
							callGetSignal().then(function(d) {
								self.updateLiveMetrics(d);
							});
						}
					}, [
						dom.create('span', { 'style': 'display: inline-flex; align-items: center;' },
							'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>'
						)
					])
				])
			]),

			// 2. Row 1: Serving Cell & BTS Tower (Left) & Compact 5-Gauge Signal Meter (Right)
			E('div', {
				'class': 'rf-cockpit-grid',
				'style': 'display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 14px; margin-bottom: 14px;'
			}, [
				// Column A: Serving Cell & BTS Tower
				E('div', { 'class': 'cbi-section rf-cockpit-card', 'style': 'margin: 0; padding: 14px 18px;' }, [
					E('div', { 'style': 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;' }, [
						E('h3', { 'style': 'margin: 0; font-size: 14px;' }, _('Serving Cell & BTS Tower')),
						E('span', { 'id': 'rf-duplex-badge', 'class': 'badge', 'style': 'font-size: 11px; font-weight: bold; padding: 2px 8px; border-radius: 4px; background: rgba(56,189,248,0.15); color: #38bdf8; border: 1px solid rgba(56,189,248,0.3);' }, 'FDD')
					]),
					// Hero Band Display
					E('div', { 'style': 'display: flex; align-items: center; gap: 10px; margin: 4px 0 10px; padding: 8px 12px; background: rgba(56,189,248,0.06); border: 1px solid rgba(56,189,248,0.2); border-radius: 6px;' }, [
						E('span', { 'id': 'rf-band-badge', 'style': 'font-size: 16px; font-weight: 800; font-family: monospace; color: #38bdf8;' }, 'B3'),
						E('span', { 'id': 'rf-band-name', 'style': 'font-size: 12px; font-weight: 600;' }, 'Band 3 (1800 MHz DCS - FDD)')
					]),
					E('div', { 'style': 'display: flex; flex-direction: column;' }, [
						createInfoRow(_('Downlink (DL)'), 'rf-freq-dl', '--', true, '#34d399'),
						createInfoRow(_('Uplink (UL)'), 'rf-freq-ul', '--', true),
						createInfoRow(_('Channel (EARFCN)'), 'rf-earfcn', '--', true),
						createInfoRow(_('Operator (PLMN)'), 'rf-operator', 'Indosat Ooredoo (51001)', false),
						createInfoRow(_('Macro eNodeB ID'), 'rf-enb-val', '--', true, '#38bdf8'),
						createInfoRow(_('Sector ID'), 'rf-sector-val', '--', true),
						createInfoRow(_('Physical CI (PCI)'), 'rf-pci-val', '--', true, '#34d399'),
						createInfoRow(_('Cell ID (CID)'), 'rf-cid-val', '--', true),
						createInfoRow(_('Tracking Area (TAC)'), 'rf-tac-val', '--', true, null, true)
					])
				]),

				// Column B: Compact 5-Gauge Signal Quality Meter
				E('div', { 'class': 'cbi-section rf-cockpit-card', 'style': 'margin: 0; padding: 14px 18px;' }, [
					E('div', { 'style': 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;' }, [
						E('h3', { 'style': 'margin: 0; font-size: 14px;' }, _('Radio Signal Quality Gauges')),
						E('span', { 'style': 'font-size: 11px; color: var(--text-color-medium);' }, _('3GPP Standards'))
					]),
					E('div', { 'style': 'display: flex; flex-direction: column;' }, [
						createGaugeRow(_('RSRP'), _('Power'), 'rf-rsrp-val', 'rf-rsrp-badge', 'rf-rsrp-bar', _('Min: -140 dBm'), _('Max: -60 dBm')),
						createGaugeRow(_('SINR / SNR'), _('Signal-to-Noise'), 'rf-sinr-val', 'rf-sinr-badge', 'rf-sinr-bar', _('Min: -15 dB'), _('Max: +25 dB')),
						createGaugeRow(_('RSRQ'), _('Quality'), 'rf-rsrq-val', 'rf-rsrq-badge', 'rf-rsrq-bar', _('Min: -20 dB'), _('Max: -3 dB')),
						createGaugeRow(_('RSSI'), _('Carrier Power'), 'rf-rssi-val', 'rf-rssi-badge', 'rf-rssi-bar', _('Min: -110 dBm'), _('Max: -50 dBm')),
						createGaugeRow(_('Signal Level'), _('CSQ Scale'), 'rf-csq-val', 'rf-csq-badge', 'rf-csq-bar', _('Min: 0'), _('Max: 31'), true)
					])
				])
			]),

			// 3. Row 2: Carrier Session (Left) & Hardware Profile (Right)
			E('div', {
				'class': 'rf-cockpit-grid',
				'style': 'display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 14px; margin-bottom: 14px;'
			}, [
				// Column A: Layer 3 Carrier Session
				E('div', { 'class': 'cbi-section rf-cockpit-card', 'style': 'margin: 0; padding: 14px 18px;' }, [
					E('h3', { 'style': 'margin: 0 0 10px; font-size: 14px;' }, _('Carrier Data Session (Layer 3 WWAN)')),
					E('div', { 'style': 'display: flex; flex-direction: column;' }, [
						createInfoRow(_('WAN IP Address'), 'rf-ip-val', '--', true, '#38bdf8'),
						createInfoRow(_('Gateway'), 'rf-gw-val', '--', true),
						createInfoRow(_('DNS Servers'), 'rf-dns-val', '--', true),
						createInfoRow(_('APN Profile'), 'rf-apn-val', '--', false),
						createInfoRow(_('Session Uptime'), 'rf-uptime-val', '00d 00h:00m:00s', true, '#34d399'),
						createInfoRow(_('Data Traffic (RX / TX)'), 'rf-traffic-val', 'RX: 0 B  |  TX: 0 B', true, null, true)
					])
				]),

				// Column B: Modem Hardware & SIM Profile
				E('div', { 'class': 'cbi-section rf-cockpit-card', 'style': 'margin: 0; padding: 14px 18px;' }, [
					E('h3', { 'style': 'margin: 0 0 10px; font-size: 14px;' }, _('Modem Hardware & SIM Profile')),
					E('div', { 'style': 'display: flex; flex-direction: column;' }, [
						createInfoRow(_('Chipset Model'), 'rf-hw-model', 'Qualcomm Snapdragon 410 (MSM8916)', false),
						createInfoRow(_('Modem IMEI'), 'rf-imei-val', '--', true),
						createInfoRow(_('SIM IMSI'), 'rf-imsi-val', '--', true),
						createInfoRow(_('SIM ICCID'), 'rf-iccid-val', '--', true),
						createInfoRow(_('Baseband Firmware'), 'rf-fw-val', '--', true),
						createInfoRow(_('Watchdog Engine'), 'rf-watchdog-val', 'Remoteproc SSR Protected (0 Failures)', false, '#34d399', true)
					])
				])
			]),

			// 4. Row 3: LTE Band Locking Controls
			E('div', { 'class': 'cbi-section rf-cockpit-card', 'style': 'margin-bottom: 14px; padding: 16px 18px;' }, [
				E('div', { 'style': 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;' }, [
					E('h3', { 'style': 'margin: 0; font-size: 14px;' }, _('Qualcomm LTE Band Locking Control')),
					E('span', { 'id': 'rf-locked-status-badge', 'class': 'badge', 'style': 'font-size: 11px; padding: 2px 8px; border-radius: 4px;' }, '--')
				]),
				E('div', { 'class': 'cbi-map-descr', 'style': 'margin-bottom: 10px;' }, 
					_('Choose a quick preset or select carrier bands manually below, then click "Apply Band Lock" to activate the frequency.')
				),
				E('div', { 'style': 'font-weight: bold; font-size: 12px; margin-top: 10px;' }, _('Quick Presets (Click to select, then click Apply):')),
				presetButtons,
				E('div', { 'style': 'font-weight: bold; font-size: 12px; margin-top: 15px;' }, _('Select Bands manually:')),
				bandGrid,
				actionButtons
			]),

			// 5. Row 4: Advanced RF Diagnostics (Waveform Canvas & Neighboring Towers)
			E('div', {
				'class': 'rf-cockpit-grid',
				'style': 'display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 14px;'
			}, [
				// Waveform Canvas
				E('div', { 'class': 'cbi-section rf-cockpit-card', 'style': 'margin: 0; padding: 14px 18px;' }, [
					E('div', { 'style': 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;' }, [
						E('h3', { 'style': 'margin: 0; font-size: 14px;' }, _('Live RF Signal Waveform History')),
						E('div', { 'style': 'font-size: 10px; display: flex; gap: 8px;' }, [
							E('span', { 'style': 'color: #38bdf8;' }, '● RSRP (dBm)'),
							E('span', { 'style': 'color: #34d399;' }, '● SINR (dB)')
						])
					]),
					E('div', {
						'style': 'width: 100%; height: 160px; background: rgba(0,0,0,0.25); border: 1px solid var(--border-color-medium); border-radius: 6px; overflow: hidden; position: relative;'
					}, [
						E('canvas', { 'id': 'rf-waveform-canvas', 'style': 'width: 100%; height: 100%; display: block;' })
					])
				]),

				// Neighboring Towers Table
				E('div', { 'class': 'cbi-section rf-cockpit-card', 'style': 'margin: 0; padding: 14px 18px;' }, [
					E('h3', { 'style': 'margin: 0 0 10px; font-size: 14px;' }, _('Neighboring Cell Towers Radar (Nearby BTS)')),
					E('table', { 'class': 'table', 'style': 'margin: 0; font-size: 11px;' }, [
						E('thead', {}, [
							E('tr', {}, [
								E('th', {}, _('Band')),
								E('th', {}, _('EARFCN')),
								E('th', {}, _('PCI')),
								E('th', {}, _('RSRP')),
								E('th', {}, _('RSRQ')),
								E('th', {}, _('Delta'))
							])
						]),
						E('tbody', { 'id': 'rf-neighbors-body' }, [
							E('tr', {}, [
								E('td', { 'colspan': 6, 'style': 'text-align: center; color: var(--text-color-medium); padding: 12px;' }, 
									_('Scanning radio environment...')
								)
							])
						])
					])
				])
			])
		]);

		setTimeout(function() {
			self.updateLiveMetrics(initialData);
		}, 60);

		return viewRoot;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
