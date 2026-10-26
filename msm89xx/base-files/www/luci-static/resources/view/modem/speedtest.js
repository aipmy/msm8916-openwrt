'use strict';
'require dom';
'require rpc';
'require ui';
'require view';

/*
	Qualcomm Snapdragon 410 (MSM8916) 4G LTE Speedtest, Jitter & Latency Analyzer
	Proton2025 Professional Dark Glass Theme
	
	Execution Sequence:
	1. Phase 1/3: Ping Latency (Min/Avg/Max) & RFC 3550 Jitter (10 Probes)
	2. Phase 2/3: 4G LTE Download Speedtest (Chunked Streaming, Live Dial & Curve)
	3. Phase 3/3: 4G LTE Upload Speedtest (1:1 Equal Payload, XHR OnProgress Streaming & Curve)
	4. Full Dual-Timeline Waveform: Both Download & Upload curves displayed from start to finish!
*/

var callGetSignal = rpc.declare({
	object: 'luci.proton-system',
	method: 'getSignalDetails',
	expect: { '': {} }
});

var callGetSpeedtestHistory = rpc.declare({
	object: 'luci.proton-system',
	method: 'getSpeedtestHistory',
	expect: { '': [] }
});

var callClearHistory = rpc.declare({
	object: 'luci.proton-system',
	method: 'clearSpeedtestHistory',
	expect: { '': {} }
});

var GATEWAYS = [
	{
		id: 'cloudflare',
		name: 'Cloudflare Anycast (Jakarta / Singapore Edge CDN)',
		location: 'Jakarta / SG Anycast',
		pingUrl: 'https://speed.cloudflare.com/__down?bytes=0',
		downUrl: 'https://speed.cloudflare.com/__down?bytes=',
		upUrl: 'https://speed.cloudflare.com/__up'
	},
	{
		id: 'google',
		name: 'Google Edge Gateway (Jakarta CDN)',
		location: 'Jakarta, ID',
		pingUrl: 'https://www.google.com/generate_204',
		downUrl: 'https://speed.cloudflare.com/__down?bytes=',
		upUrl: 'https://speed.cloudflare.com/__up'
	},
	{
		id: 'singapore',
		name: 'Singapore International Hub (Singtel / Clouvider)',
		location: 'Singapore, SG',
		pingUrl: 'https://sg.speedtest.clouvider.net/backend/empty.php',
		downUrl: 'https://sg.speedtest.clouvider.net/backend/garbage.php?ckSize=',
		upUrl: 'https://speed.cloudflare.com/__up'
	},
	{
		id: 'custom',
		name: 'Custom Gateway (User Defined URL / Server)',
		location: 'Custom Target',
		pingUrl: '',
		downUrl: '',
		upUrl: ''
	}
];

function createMetricCard(title, valId, subId, badgeId, defaultVal, defaultSub, accentColor) {
	return E('div', {
		'class': 'cbi-section rf-cockpit-card',
		'style': 'margin: 0; padding: 14px 16px; display: flex; flex-direction: column; justify-content: space-between; position: relative; overflow: hidden; border-radius: 8px;'
	}, [
		E('div', { 'style': 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;' }, [
			E('span', { 'style': 'font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-color-medium); font-weight: 600;' }, title),
			E('span', {
				'id': badgeId,
				'class': 'badge',
				'style': 'font-size: 10px; padding: 1px 6px; border-radius: 4px; background: rgba(255,255,255,0.06);'
			}, '--')
		]),
		E('div', {
			'id': valId,
			'style': 'font-size: 22px; font-weight: 800; font-family: monospace; color: ' + (accentColor || 'var(--text-color-high)') + '; line-height: 1.2; margin: 4px 0;'
		}, defaultVal || '--'),
		E('div', {
			'id': subId,
			'style': 'font-size: 11px; color: var(--text-color-medium); font-family: monospace; opacity: 0.85;'
		}, defaultSub || '--')
	]);
}

function createDialGaugeSvg(type, dialId, valueId, peakId, stateBadgeId, maxVal, unit, color) {
	var strokeColor = color || '#38bdf8';
	return E('div', {
		'style': 'display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; width: 100%; min-width: 200px;'
	}, [
		E('div', { 'style': 'position: relative; width: 180px; height: 180px;' }, [
			dom.create('svg', {
				'viewBox': '0 0 100 100',
				'style': 'width: 100%; height: 100%; transform: rotate(160deg); overflow: visible;'
			}, [
				// Track arc
				dom.create('circle', {
					'cx': '50', 'cy': '50', 'r': '40',
					'fill': 'none',
					'stroke': 'rgba(255, 255, 255, 0.08)',
					'stroke-width': '7',
					'stroke-dasharray': '170 300',
					'stroke-linecap': 'round'
				}),
				// Active value arc
				dom.create('circle', {
					'id': dialId,
					'cx': '50', 'cy': '50', 'r': '40',
					'fill': 'none',
					'stroke': strokeColor,
					'stroke-width': '7.5',
					'stroke-dasharray': '0 300',
					'stroke-linecap': 'round',
					'style': 'transition: stroke-dasharray 0.15s ease-out, stroke 0.3s ease; filter: drop-shadow(0 0 6px ' + strokeColor + 'aa);'
				})
			]),
			// Inner Text Overlay
			E('div', {
				'style': 'position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none;'
			}, [
				E('div', { 'style': 'font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: var(--text-color-medium); margin-bottom: 2px;' }, type),
				E('div', {
					'id': valueId,
					'style': 'font-size: 28px; font-weight: 800; font-family: monospace; color: #fff; line-height: 1;'
				}, '0.00'),
				E('div', { 'style': 'font-size: 11px; font-weight: 600; color: ' + strokeColor + '; margin-top: 4px;' }, unit)
			])
		]),
		E('div', {
			'style': 'display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 11px; color: var(--text-color-medium); font-family: monospace; margin-top: -6px;'
		}, [
			E('div', { 'style': 'display: flex; gap: 12px;' }, [
				E('span', {}, 'Peak: <strong id="' + peakId + '" style="color:#fff;">0.00</strong> ' + unit),
				E('span', {}, 'Max: ' + maxVal + ' ' + unit)
			]),
			E('span', {
				'id': stateBadgeId,
				'class': 'badge',
				'style': 'font-size: 10px; padding: 2px 8px; border-radius: 4px; background: rgba(255,255,255,0.06); margin-top: 2px;'
			}, 'Idle')
		])
	]);
}

return view.extend({
	isRunning: false,
	activeXhr: null,
	activeAbortController: null,
	peakDownload: 0,
	peakUpload: 0,
	downloadPoints: [],
	uploadPoints: [],
	maxPointsPerPhase: 30,
	localHistory: [],

	load: function() {
		return Promise.all([
			callGetSignal(),
			callGetSpeedtestHistory()
		]);
	},

	updateDial: function(dialId, val, maxVal) {
		var el = document.getElementById(dialId);
		if (!el) return;
		var num = parseFloat(val) || 0;
		var pct = Math.max(0, Math.min(100, (num / maxVal) * 100));
		var maxDash = 170; // 220 deg arc
		var currentDash = (pct / 100) * maxDash;
		el.setAttribute('stroke-dasharray', currentDash.toFixed(1) + ' 300');
	},

	drawWaveform: function() {
		var cvs = document.getElementById('st-waveform-canvas');
		if (!cvs || !cvs.getContext) return;
		var ctx = cvs.getContext('2d');
		var w = cvs.width = cvs.offsetWidth;
		var h = cvs.height = cvs.offsetHeight;
		ctx.clearRect(0, 0, w, h);

		var midX = w / 2;

		// 1. Grid Lines & Mbps Scale
		var allValues = this.downloadPoints.concat(this.uploadPoints);
		var maxVal = Math.max(10, Math.max.apply(null, allValues.length ? allValues : [10]));
		// Round up maxVal to multiple of 10
		var gridMax = Math.ceil(maxVal / 10) * 10;

		ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
		ctx.lineWidth = 1;
		ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
		ctx.font = '9px monospace';

		var steps = 4;
		for (var s = 0; s <= steps; s++) {
			var y = h - 20 - (s / steps) * (h - 35);
			ctx.beginPath();
			ctx.moveTo(0, y);
			ctx.lineTo(w, y);
			ctx.stroke();

			var labelMbps = Math.round((s / steps) * gridMax);
			ctx.fillText(labelMbps + ' Mbps', 6, y - 3);
		}

		// 2. Middle Phase Divider: [ DOWNLOAD (Left) | UPLOAD (Right) ]
		ctx.setLineDash([4, 4]);
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
		ctx.beginPath();
		ctx.moveTo(midX, 10);
		ctx.lineTo(midX, h - 15);
		ctx.stroke();
		ctx.setLineDash([]);

		ctx.fillStyle = '#38bdf8';
		ctx.fillText(_('DOWNLOAD STREAM (1:1 Payload)'), 60, h - 4);
		ctx.fillStyle = '#34d399';
		ctx.fillText(_('UPLOAD STREAM (1:1 Payload)'), midX + 20, h - 4);

		// 3. Draw Download Curve (Left Half: 0 to midX)
		if (this.downloadPoints.length >= 2) {
			var dlStep = (midX - 10) / (this.maxPointsPerPhase - 1);

			// Fill Path
			ctx.beginPath();
			ctx.moveTo(0, h - 20);
			for (var i = 0; i < this.downloadPoints.length; i++) {
				var dv = this.downloadPoints[i];
				var dNorm = dv / gridMax;
				var dpy = h - 20 - (dNorm * (h - 35));
				var dpx = i * dlStep;
				ctx.lineTo(dpx, dpy);
			}
			ctx.lineTo((this.downloadPoints.length - 1) * dlStep, h - 20);
			ctx.closePath();
			ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
			ctx.fill();

			// Line Path
			ctx.beginPath();
			for (var di = 0; di < this.downloadPoints.length; di++) {
				var dval = this.downloadPoints[di];
				var dn = dval / gridMax;
				var dy = h - 20 - (dn * (h - 35));
				var dx = di * dlStep;
				if (di === 0) ctx.moveTo(dx, dy);
				else ctx.lineTo(dx, dy);
			}
			ctx.strokeStyle = '#38bdf8';
			ctx.lineWidth = 2.5;
			ctx.stroke();
		}

		// 4. Draw Upload Curve (Right Half: midX to w)
		if (this.uploadPoints.length >= 2) {
			var ulStep = (w - midX - 10) / (this.maxPointsPerPhase - 1);

			// Fill Path
			ctx.beginPath();
			ctx.moveTo(midX, h - 20);
			for (var j = 0; j < this.uploadPoints.length; j++) {
				var uv = this.uploadPoints[j];
				var uNorm = uv / gridMax;
				var upy = h - 20 - (uNorm * (h - 35));
				var upx = midX + j * ulStep;
				ctx.lineTo(upx, upy);
			}
			ctx.lineTo(midX + (this.uploadPoints.length - 1) * ulStep, h - 20);
			ctx.closePath();
			ctx.fillStyle = 'rgba(52, 211, 153, 0.12)';
			ctx.fill();

			// Line Path
			ctx.beginPath();
			for (var uj = 0; uj < this.uploadPoints.length; uj++) {
				var uval = this.uploadPoints[uj];
				var un = uval / gridMax;
				var uy = h - 20 - (un * (h - 35));
				var ux = midX + uj * ulStep;
				if (uj === 0) ctx.moveTo(ux, uy);
				else ctx.lineTo(ux, uy);
			}
			ctx.strokeStyle = '#34d399';
			ctx.lineWidth = 2.5;
			ctx.stroke();
		}
	},

	renderHistoryTable: function(historyList) {
		var tbody = document.getElementById('speedtest-history-body');
		if (!tbody) return;
		dom.content(tbody, []);

		var list = historyList || this.localHistory;
		if (!list || list.length === 0) {
			tbody.appendChild(E('tr', {}, [
				E('td', { 'colspan': 8, 'style': 'text-align: center; color: var(--text-color-medium); padding: 14px; font-style: italic;' }, 
					_('No speedtest history records yet. Click "START SPEEDTEST" above to run an analysis.')
				)
			]));
			return;
		}

		list.forEach(function(row) {
			tbody.appendChild(E('tr', {}, [
				E('td', { 'style': 'font-family: monospace; font-size: 11px;' }, row.timestamp || '--'),
				E('td', { 'style': 'font-weight: 600;' }, [
					E('div', {}, row.server || '--'),
					E('div', { 'style': 'font-size: 10px; color: var(--text-color-medium);' }, row.location || row.target || '')
				]),
				E('td', { 'style': 'font-family: monospace; color: #38bdf8;' }, row.band || 'LTE'),
				E('td', { 'style': 'font-family: monospace; font-weight: 600;' }, (row.ping_avg ? row.ping_avg + ' ms' : '--')),
				E('td', { 'style': 'font-family: monospace;' }, (row.jitter ? row.jitter + ' ms' : '--')),
				E('td', { 'style': 'font-family: monospace; color: ' + (row.packet_loss > 0 ? '#ef4444' : '#10b981') + ';' }, (row.packet_loss != null ? row.packet_loss + '%' : '0%')),
				E('td', { 'style': 'font-family: monospace; font-weight: 700; color: #38bdf8; font-size: 12.5px;' }, (row.download_mbps ? row.download_mbps + ' Mbps' : '--')),
				E('td', { 'style': 'font-family: monospace; font-weight: 700; color: #34d399; font-size: 12.5px;' }, (row.upload_mbps ? row.upload_mbps + ' Mbps' : '--'))
			]));
		});
	},

	updateProgress: function(pct, label, stageColor) {
		var elLabel = document.getElementById('st-step-label');
		var elPct = document.getElementById('st-progress-pct');
		var elBar = document.getElementById('st-progress-bar');
		if (elLabel) elLabel.textContent = label;
		if (elPct) elPct.textContent = Math.round(pct) + '%';
		if (elBar) {
			elBar.style.width = Math.round(pct) + '%';
			if (stageColor) elBar.style.background = stageColor;
		}
	},

	setGaugeState: function(type, text, color, bg) {
		var el = document.getElementById(type === 'download' ? 'st-dl-state-badge' : 'st-ul-state-badge');
		if (!el) return;
		el.textContent = text;
		el.style.color = color || 'var(--text-color-high)';
		el.style.background = bg || 'rgba(255,255,255,0.06)';
		el.style.border = color ? '1px solid ' + color + '44' : 'none';
	},

	runSpeedtest: async function(gwConfig, sizeConfig) {
		var self = this;
		this.isRunning = true;
		this.activeAbortController = new AbortController();
		var signal = this.activeAbortController.signal;

		var btnStart = document.getElementById('btn-start-speedtest');
		var btnStop = document.getElementById('btn-stop-speedtest');
		if (btnStart) { btnStart.disabled = true; btnStart.style.opacity = '0.5'; }
		if (btnStop) btnStop.style.display = 'inline-flex';

		this.peakDownload = 0;
		this.peakUpload = 0;
		this.downloadPoints = [];
		this.uploadPoints = [];
		this.drawWaveform();

		this.setGaugeState('download', 'Waiting...', '#94a3b8');
		this.setGaugeState('upload', 'Waiting...', '#94a3b8');

		// Query Radio Cell status
		var rfInfo = { band: 'LTE', rsrp: '--', sinr: '--', op: 'Indosat' };
		try {
			var sigData = await callGetSignal();
			if (sigData && sigData.serving) {
				rfInfo.band = sigData.serving.band || 'LTE';
				rfInfo.rsrp = sigData.serving.rsrp || '--';
				rfInfo.sinr = sigData.signal ? sigData.signal.snr : '--';
				rfInfo.op = sigData.operator ? sigData.operator.name : 'Indosat';
			}
		} catch(e) {}

		var elRadioVal = document.getElementById('st-radio-val');
		var elRadioSub = document.getElementById('st-radio-sub');
		var elRadioBadge = document.getElementById('st-radio-badge');
		if (elRadioVal) elRadioVal.textContent = rfInfo.band + (rfInfo.rsrp !== '--' ? ' (' + rfInfo.rsrp + ' dBm)' : '');
		if (elRadioSub) elRadioSub.textContent = rfInfo.op + ' | ' + gwConfig.name;
		if (elRadioBadge) { elRadioBadge.textContent = gwConfig.location; elRadioBadge.style.color = '#38bdf8'; }

		// ==========================================
		// PHASE 1/3: PING LATENCY & RFC 3550 JITTER
		// ==========================================
		this.updateProgress(10, _('[Phase 1/3] Measuring Ping Latency & Jitter (10 Probes)...'), '#94a3b8');
		var pingTimes = [];
		var drops = 0;
		var pingUrl = gwConfig.pingUrl || 'https://speed.cloudflare.com/__down?bytes=0';

		for (var p = 0; p < 10; p++) {
			if (signal.aborted) return;
			var t0 = performance.now();
			try {
				var probeUrl = pingUrl + (pingUrl.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now() + '_' + p;
				await fetch(probeUrl, { method: 'HEAD', cache: 'no-store', signal: signal, mode: 'cors' });
				var dt = performance.now() - t0;
				pingTimes.push(dt);
			} catch(err) {
				if (err.name === 'AbortError') return;
				drops++;
			}
			self.updateProgress(10 + p * 1.5, _('[Phase 1/3] Measuring Latency Probe ') + (p + 1) + '/10...', '#94a3b8');
		}

		var minPing = 0, avgPing = 0, maxPing = 0, jitter = 0, lossPct = 0;
		if (pingTimes.length > 0) {
			minPing = Math.min.apply(null, pingTimes);
			maxPing = Math.max.apply(null, pingTimes);
			avgPing = pingTimes.reduce(function(a, b) { return a + b; }, 0) / pingTimes.length;

			var diffs = [];
			for (var d = 1; d < pingTimes.length; d++) {
				diffs.push(Math.abs(pingTimes[d] - pingTimes[d - 1]));
			}
			if (diffs.length > 0) {
				jitter = diffs.reduce(function(a, b) { return a + b; }, 0) / diffs.length;
			}
		}
		lossPct = Math.round((drops / 10) * 100);

		// Update Ping & Jitter Cards
		var elPingVal = document.getElementById('st-ping-val');
		var elPingSub = document.getElementById('st-ping-sub');
		var elPingBadge = document.getElementById('st-ping-badge');
		if (elPingVal) elPingVal.textContent = avgPing.toFixed(1) + ' ms';
		if (elPingSub) elPingSub.textContent = 'Min: ' + minPing.toFixed(1) + ' | Max: ' + maxPing.toFixed(1) + ' ms';
		if (elPingBadge) {
			if (avgPing < 50) { elPingBadge.textContent = 'Low Latency'; elPingBadge.style.color = '#10b981'; }
			else if (avgPing < 95) { elPingBadge.textContent = 'Normal'; elPingBadge.style.color = '#38bdf8'; }
			else { elPingBadge.textContent = 'High'; elPingBadge.style.color = '#f59e0b'; }
		}

		var elJitterVal = document.getElementById('st-jitter-val');
		var elJitterBadge = document.getElementById('st-jitter-badge');
		if (elJitterVal) elJitterVal.textContent = jitter.toFixed(1) + ' ms';
		if (elJitterBadge) {
			if (jitter < 8) { elJitterBadge.textContent = 'Ultra Stable'; elJitterBadge.style.color = '#10b981'; }
			else if (jitter < 25) { elJitterBadge.textContent = 'Good'; elJitterBadge.style.color = '#38bdf8'; }
			else { elJitterBadge.textContent = 'High Jitter'; elJitterBadge.style.color = '#ef4444'; }
		}

		var elLossVal = document.getElementById('st-loss-val');
		var elLossSub = document.getElementById('st-loss-sub');
		var elLossBadge = document.getElementById('st-loss-badge');
		if (elLossVal) elLossVal.textContent = lossPct + '%';
		if (elLossSub) elLossSub.textContent = (lossPct === 0 ? '100% Packets Received' : 'Packet Drops Observed');
		if (elLossBadge) {
			elLossBadge.textContent = (lossPct === 0 ? 'Zero Loss' : 'Lossy');
			elLossBadge.style.color = (lossPct === 0 ? '#10b981' : '#ef4444');
		}

		// ==========================================
		// PHASE 2/3: 4G LTE DOWNLOAD SPEEDTEST (FIRST)
		// ==========================================
		var payloadMb = (sizeConfig.bytes / 1000000).toFixed(0);
		this.setGaugeState('download', 'Testing Stream...', '#38bdf8', 'rgba(56,189,248,0.15)');
		this.setGaugeState('upload', 'Waiting Phase 3...', '#94a3b8');

		var downBytesTarget = sizeConfig.bytes;
		var downUrl = gwConfig.downUrl + downBytesTarget + '&t=' + Date.now();
		var finalDlMbps = 0;

		try {
			var dlStart = performance.now();
			var dlResp = await fetch(downUrl, { signal: signal, cache: 'no-store', mode: 'cors' });
			var reader = dlResp.body ? dlResp.body.getReader() : null;
			var receivedBytes = 0;

			if (reader) {
				while (true) {
					if (signal.aborted) return;
					var resChunk = await reader.read();
					if (resChunk.done) break;
					receivedBytes += resChunk.value.byteLength;

					var now = performance.now();
					var elapsedSec = (now - dlStart) / 1000.0;
					if (elapsedSec > 0.08) {
						var instantMbps = (receivedBytes * 8) / (elapsedSec * 1000000.0);
						if (instantMbps > self.peakDownload) self.peakDownload = instantMbps;

						var elDl = document.getElementById('st-dl-val');
						if (elDl) elDl.textContent = instantMbps.toFixed(2);
						var elDlPeak = document.getElementById('st-dl-peak');
						if (elDlPeak) elDlPeak.textContent = self.peakDownload.toFixed(2);

						self.updateDial('st-dl-dial', instantMbps, 100);

						self.downloadPoints.push(instantMbps);
						if (self.downloadPoints.length > self.maxPointsPerPhase) self.downloadPoints.shift();
						self.drawWaveform();

						var dlPct = 25 + Math.min(35, (receivedBytes / downBytesTarget) * 35);
						self.updateProgress(dlPct, _('[Phase 2/3] Downloading: ') + (receivedBytes / 1048576).toFixed(1) + ' / ' + payloadMb + ' MB (' + instantMbps.toFixed(2) + ' Mbps)', '#38bdf8');
					}
				}
				var totalDlSec = (performance.now() - dlStart) / 1000.0;
				finalDlMbps = (receivedBytes * 8) / (totalDlSec * 1000000.0);
			}
		} catch(err) {
			if (err.name === 'AbortError') return;
		}

		var elDlFinal = document.getElementById('st-dl-val');
		if (elDlFinal && finalDlMbps > 0) elDlFinal.textContent = finalDlMbps.toFixed(2);
		this.setGaugeState('download', 'Completed (Peak ' + this.peakDownload.toFixed(1) + 'M)', '#10b981', 'rgba(16,185,129,0.15)');

		// ==========================================
		// PHASE 3/3: 4G LTE UPLOAD SPEEDTEST (1:1 EQUAL PAYLOAD)
		// ==========================================
		this.setGaugeState('upload', 'Testing Stream...', '#34d399', 'rgba(52,211,153,0.15)');
		this.updateProgress(62, _('[Phase 3/3] Preparing 1:1 Upload Payload (' + payloadMb + ' MB)...'), '#34d399');

		var upBytesTarget = sizeConfig.bytes; // EXACT 1:1 RATIO WITH DOWNLOAD!
		var upPayload = new Uint8Array(upBytesTarget);
		for (var k = 0; k < upBytesTarget; k += 8) {
			upPayload[k] = (k & 0xff);
		}

		var upUrl = gwConfig.upUrl || 'https://speed.cloudflare.com/__up';
		var finalUlMbps = 0;

		await new Promise(function(resolveUp) {
			var xhr = new XMLHttpRequest();
			self.activeXhr = xhr;
			var ulStart = performance.now();

			xhr.upload.onprogress = function(e) {
				if (signal.aborted) {
					xhr.abort();
					return resolveUp();
				}
				var now = performance.now();
				var elapsedSec = (now - ulStart) / 1000.0;
				if (elapsedSec > 0.08 && e.loaded > 0) {
					var instantMbps = (e.loaded * 8) / (elapsedSec * 1000000.0);
					if (instantMbps > self.peakUpload) self.peakUpload = instantMbps;

					var elUl = document.getElementById('st-ul-val');
					if (elUl) elUl.textContent = instantMbps.toFixed(2);
					var elUlPeak = document.getElementById('st-ul-peak');
					if (elUlPeak) elUlPeak.textContent = self.peakUpload.toFixed(2);

					self.updateDial('st-ul-dial', instantMbps, 50);

					self.uploadPoints.push(instantMbps);
					if (self.uploadPoints.length > self.maxPointsPerPhase) self.uploadPoints.shift();
					self.drawWaveform();

					var ulPct = 62 + Math.min(36, (e.loaded / upBytesTarget) * 36);
					self.updateProgress(ulPct, _('[Phase 3/3] Uploading (1:1): ') + (e.loaded / 1048576).toFixed(1) + ' / ' + payloadMb + ' MB (' + instantMbps.toFixed(2) + ' Mbps)', '#34d399');
				}
			};

			xhr.onload = function() {
				var totalUlSec = (performance.now() - ulStart) / 1000.0;
				if (totalUlSec > 0.05) {
					finalUlMbps = (upBytesTarget * 8) / (totalUlSec * 1000000.0);
				}
				resolveUp();
			};

			xhr.onerror = function() {
				resolveUp();
			};

			xhr.open('POST', upUrl, true);
			xhr.send(upPayload);
		});

		var elUlFinal = document.getElementById('st-ul-val');
		if (elUlFinal && finalUlMbps > 0) elUlFinal.textContent = finalUlMbps.toFixed(2);
		this.setGaugeState('upload', 'Completed (Peak ' + this.peakUpload.toFixed(1) + 'M)', '#10b981', 'rgba(16,185,129,0.15)');

		// Redraw final full waveform with both curves intact!
		this.drawWaveform();

		// ==========================================
		// PHASE 4: FINAL COMPLETION & LOGGING
		// ==========================================
		this.updateProgress(100, _('Benchmark Completed: DL ') + finalDlMbps.toFixed(1) + ' Mbps | UL ' + finalUlMbps.toFixed(1) + ' Mbps', 'linear-gradient(90deg, #38bdf8, #34d399)');

		var nowD = new Date();
		var ts = nowD.getFullYear() + '-' + 
			String(nowD.getMonth() + 1).padStart(2, '0') + '-' + 
			String(nowD.getDate()).padStart(2, '0') + ' ' + 
			String(nowD.getHours()).padStart(2, '0') + ':' + 
			String(nowD.getMinutes()).padStart(2, '0') + ':' + 
			String(nowD.getSeconds()).padStart(2, '0');

		var record = {
			timestamp: ts,
			server: gwConfig.name,
			location: gwConfig.location,
			band: rfInfo.band,
			ping_avg: avgPing > 0 ? avgPing.toFixed(1) : '--',
			jitter: jitter > 0 ? jitter.toFixed(1) : '--',
			packet_loss: lossPct,
			download_mbps: finalDlMbps > 0 ? finalDlMbps.toFixed(2) : '--',
			upload_mbps: finalUlMbps > 0 ? finalUlMbps.toFixed(2) : '--'
		};

		this.localHistory.unshift(record);
		if (this.localHistory.length > 15) this.localHistory.pop();
		try {
			localStorage.setItem('modem_speedtest_history', JSON.stringify(this.localHistory));
		} catch(e) {}
		this.renderHistoryTable(this.localHistory);

		this.stopSpeedtest();
	},

	stopSpeedtest: function() {
		if (this.activeAbortController) {
			this.activeAbortController.abort();
			this.activeAbortController = null;
		}
		if (this.activeXhr) {
			this.activeXhr.abort();
			this.activeXhr = null;
		}
		this.isRunning = false;
		var btnStart = document.getElementById('btn-start-speedtest');
		var btnStop = document.getElementById('btn-stop-speedtest');
		if (btnStart) { btnStart.disabled = false; btnStart.style.opacity = '1'; }
		if (btnStop) btnStop.style.display = 'none';
	},

	render: function(loadData) {
		var self = this;
		var initialSig = (loadData && loadData[0]) ? loadData[0] : null;
		var initialHist = (loadData && loadData[1]) ? loadData[1] : [];
		this.localHistory = initialHist || [];

		try {
			var cachedLocal = JSON.parse(localStorage.getItem('modem_speedtest_history') || '[]');
			if (cachedLocal && cachedLocal.length > 0) {
				this.localHistory = cachedLocal;
			}
		} catch(e) {}

		// Gateway Dropdown
		var gwSelect = E('select', {
			'id': 'st-gateway-select',
			'class': 'cbi-input-select',
			'style': 'padding: 6px 12px; font-size: 13px; border-radius: 6px; width: 100%; max-width: 400px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-color-medium);',
			'change': function(ev) {
				var customBox = document.getElementById('st-custom-gw-box');
				if (customBox) {
					customBox.style.display = (ev.target.value === 'custom') ? 'grid' : 'none';
				}
			}
		});

		GATEWAYS.forEach(function(g) {
			gwSelect.appendChild(E('option', { 'value': g.id }, g.name));
		});

		// Test Size Dropdown (Strict 1:1 Payload ratio)
		var sizeSelect = E('select', {
			'id': 'st-size-select',
			'class': 'cbi-input-select',
			'style': 'padding: 6px 12px; font-size: 13px; border-radius: 6px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-color-medium);'
		}, [
			E('option', { 'value': 'fast' }, _('Fast Probe: 5 MB DL & 5 MB UL (1:1 Ratio)')),
			E('option', { 'value': 'standard', 'selected': 'selected' }, _('Standard Benchmark: 10 MB DL & 10 MB UL (1:1 Ratio)')),
			E('option', { 'value': 'deep' }, _('Stress Test: 25 MB DL & 25 MB UL (1:1 Ratio)'))
		]);

		// Custom Gateway Fields
		var customGwBox = E('div', {
			'id': 'st-custom-gw-box',
			'style': 'display: none; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; margin-top: 10px; width: 100%;'
		}, [
			E('input', {
				'id': 'st-custom-ping',
				'type': 'text',
				'class': 'cbi-input-text',
				'placeholder': 'Ping URL (e.g. https://server/ping)',
				'style': 'font-size: 12px; padding: 6px 10px;'
			}),
			E('input', {
				'id': 'st-custom-down',
				'type': 'text',
				'class': 'cbi-input-text',
				'placeholder': 'Download URL (e.g. https://server/file.bin)',
				'style': 'font-size: 12px; padding: 6px 10px;'
			}),
			E('input', {
				'id': 'st-custom-up',
				'type': 'text',
				'class': 'cbi-input-text',
				'placeholder': 'Upload URL (e.g. https://server/upload)',
				'style': 'font-size: 12px; padding: 6px 10px;'
			})
		]);

		// Start & Stop Buttons
		var btnStart = E('button', {
			'id': 'btn-start-speedtest',
			'class': 'cbi-button cbi-button-action',
			'style': 'font-size: 13.5px; font-weight: 800; padding: 9px 26px; border-radius: 6px; cursor: pointer; letter-spacing: 0.5px; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); box-shadow: 0 4px 14px rgba(59, 130, 246, 0.4); border: none; display: inline-flex; align-items: center; gap: 8px;',
			'click': function(ev) {
				ev.preventDefault();
				var gwId = document.getElementById('st-gateway-select')?.value || 'cloudflare';
				var szId = document.getElementById('st-size-select')?.value || 'standard';

				var gw = GATEWAYS.find(function(g) { return g.id === gwId; }) || GATEWAYS[0];
				if (gwId === 'custom') {
					gw = {
						id: 'custom',
						name: 'Custom Server',
						location: 'Custom Target',
						pingUrl: document.getElementById('st-custom-ping')?.value || '',
						downUrl: document.getElementById('st-custom-down')?.value || '',
						upUrl: document.getElementById('st-custom-up')?.value || ''
					};
				}

				// Strict 1:1 Payload Sizes
				var sizeConfig = { bytes: 10000000 }; // 10MB DL / 10MB UL
				if (szId === 'fast') sizeConfig.bytes = 5000000; // 5MB DL / 5MB UL
				else if (szId === 'deep') sizeConfig.bytes = 25000000; // 25MB DL / 25MB UL

				self.runSpeedtest(gw, sizeConfig);
			}
		}, [
			dom.create('span', {}, '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>'),
			_('START SPEEDTEST')
		]);

		var btnStop = E('button', {
			'id': 'btn-stop-speedtest',
			'class': 'cbi-button cbi-button-reset',
			'style': 'display: none; font-size: 13px; font-weight: 700; padding: 9px 18px; border-radius: 6px; cursor: pointer; background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.4);',
			'click': function(ev) {
				ev.preventDefault();
				self.stopSpeedtest();
				self.updateProgress(0, _('Benchmark Stopped by User'), '#ef4444');
				self.setGaugeState('download', 'Stopped', '#ef4444');
				self.setGaugeState('upload', 'Stopped', '#ef4444');
			}
		}, _('Cancel'));

		var btnClearHist = E('button', {
			'class': 'cbi-button cbi-button-neutral',
			'style': 'font-size: 11px; padding: 4px 10px; border-radius: 4px; cursor: pointer;',
			'click': function(ev) {
				ev.preventDefault();
				if (confirm(_('Clear all speedtest history records?'))) {
					self.localHistory = [];
					try {
						localStorage.removeItem('modem_speedtest_history');
					} catch(e) {}
					self.renderHistoryTable([]);
					callClearHistory();
				}
			}
		}, _('Clear History'));

		// Main Layout Structure
		var viewRoot = E('div', { 'class': 'cbi-map', 'style': 'padding-bottom: 30px;' }, [
			// 1. Header Toolbar
			E('div', {
				'style': 'display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; border-bottom: 1px solid var(--border-color-medium); padding-bottom: 12px;'
			}, [
				E('div', {}, [
					E('h2', { 'style': 'margin: 0 0 4px; font-size: 18px; font-weight: bold;' }, _('4G LTE Gateway Speedtest & Latency Analyzer')),
					E('div', { 'style': 'font-size: 12px; color: var(--text-color-medium);' }, 
						_('Strict 1:1 Download & Upload payload benchmarking, ping latency, jitter variance, and Qualcomm radio telemetry.')
					)
				]),
				E('div', { 'style': 'display: flex; align-items: center; gap: 8px;' }, [
					E('span', {
						'class': 'badge',
						'style': 'font-size: 11px; padding: 4px 10px; border-radius: 4px; background: rgba(56,189,248,0.15); color: #38bdf8; border: 1px solid rgba(56,189,248,0.3); font-family: monospace;'
					}, 'Interface: wwan0 (4G LTE)')
				])
			]),

			// 2. Gateway Selector & Action Card
			E('div', {
				'class': 'cbi-section rf-cockpit-card',
				'style': 'margin-bottom: 16px; padding: 16px 20px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color-medium); border-radius: 8px;'
			}, [
				E('div', { 'style': 'display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 14px;' }, [
					E('div', { 'style': 'flex: 1; min-width: 280px;' }, [
						E('label', { 'style': 'display: block; font-weight: 700; font-size: 13px; margin-bottom: 6px;' }, _('Select Benchmark Gateway / Test Server:')),
						gwSelect,
						customGwBox
					]),
					E('div', { 'style': 'min-width: 240px;' }, [
						E('label', { 'style': 'display: block; font-weight: 700; font-size: 13px; margin-bottom: 6px;' }, _('Test Payload (1:1 Ratio):')),
						sizeSelect
					]),
					E('div', { 'style': 'display: flex; align-items: center; gap: 10px;' }, [
						btnStart,
						btnStop
					])
				]),

				// Progress Strip
				E('div', { 'style': 'margin-top: 16px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.06);' }, [
					E('div', { 'style': 'display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px;' }, [
						E('span', { 'id': 'st-step-label', 'style': 'font-weight: 600; color: #38bdf8;' }, _('Ready to Benchmark (Download first, then 1:1 Upload)')),
						E('span', { 'id': 'st-progress-pct', 'style': 'font-family: monospace; font-weight: bold;' }, '0%')
					]),
					E('div', { 'style': 'width: 100%; height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden;' }, [
						E('div', {
							'id': 'st-progress-bar',
							'style': 'width: 0%; height: 100%; background: #38bdf8; border-radius: 3px; transition: width 0.25s ease;'
						})
					])
				])
			]),

			// 3. Hero Speedometer Gauges (Download & Upload)
			E('div', {
				'class': 'rf-cockpit-grid',
				'style': 'display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; margin-bottom: 16px;'
			}, [
				// Download Gauge Card
				E('div', {
					'class': 'cbi-section rf-cockpit-card',
					'style': 'margin: 0; padding: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: radial-gradient(circle at center, rgba(56,189,248,0.06) 0%, rgba(255,255,255,0.01) 70%); border: 1px solid var(--border-color-medium); border-radius: 8px;'
				}, [
					createDialGaugeSvg(_('Download Speed'), 'st-dl-dial', 'st-dl-val', 'st-dl-peak', 'st-dl-state-badge', 100, 'Mbps', '#38bdf8')
				]),

				// Upload Gauge Card
				E('div', {
					'class': 'cbi-section rf-cockpit-card',
					'style': 'margin: 0; padding: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: radial-gradient(circle at center, rgba(52,211,153,0.06) 0%, rgba(255,255,255,0.01) 70%); border: 1px solid var(--border-color-medium); border-radius: 8px;'
				}, [
					createDialGaugeSvg(_('Upload Speed'), 'st-ul-dial', 'st-ul-val', 'st-ul-peak', 'st-ul-state-badge', 50, 'Mbps', '#34d399')
				])
			]),

			// 4. Detailed Diagnostic Metric Cards (Ping, Jitter, Packet Loss, Radio Band)
			E('div', {
				'class': 'rf-cockpit-grid',
				'style': 'display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 16px;'
			}, [
				createMetricCard(_('Latency (Ping)'), 'st-ping-val', 'st-ping-sub', 'st-ping-badge', '--', 'Min: -- | Max: -- ms', '#38bdf8'),
				createMetricCard(_('Jitter Variance'), 'st-jitter-val', 'st-jitter-sub', 'st-jitter-badge', '--', 'RFC 3550 Variance', '#a78bfa'),
				createMetricCard(_('Packet Loss'), 'st-loss-val', 'st-loss-sub', 'st-loss-badge', '0%', '100% Packets Received', '#10b981'),
				createMetricCard(_('Serving Radio & Tower'), 'st-radio-val', 'st-radio-sub', 'st-radio-badge', (initialSig && initialSig.serving ? initialSig.serving.band : 'LTE'), 'Cloudflare Anycast', '#f59e0b')
			]),

			// 5. Dual Full-Timeline Waveform Canvas (Both curves visible from start to finish!)
			E('div', {
				'class': 'cbi-section rf-cockpit-card',
				'style': 'margin-bottom: 16px; padding: 16px 20px; border: 1px solid var(--border-color-medium); border-radius: 8px;'
			}, [
				E('div', { 'style': 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;' }, [
					E('h3', { 'style': 'margin: 0; font-size: 14px; font-weight: bold;' }, _('Live Bandwidth Stream Waveform (Full 1:1 Timeline)')),
					E('div', { 'style': 'display: flex; gap: 14px; font-size: 11px;' }, [
						E('span', { 'style': 'color: #38bdf8; font-weight: 600;' }, '● 1. Download Stream (Left)'),
						E('span', { 'style': 'color: #34d399; font-weight: 600;' }, '● 2. Upload Stream (Right)')
					])
				]),
				E('div', {
					'style': 'width: 100%; height: 160px; background: rgba(0,0,0,0.28); border: 1px solid var(--border-color-medium); border-radius: 6px; overflow: hidden;'
				}, [
					E('canvas', { 'id': 'st-waveform-canvas', 'style': 'width: 100%; height: 100%; display: block;' })
				])
			]),

			// 6. Speedtest History Table
			E('div', {
				'class': 'cbi-section rf-cockpit-card',
				'style': 'margin: 0; padding: 16px 20px; border: 1px solid var(--border-color-medium); border-radius: 8px;'
			}, [
				E('div', { 'style': 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;' }, [
					E('h3', { 'style': 'margin: 0; font-size: 14px; font-weight: bold;' }, _('Speedtest Analysis History Log')),
					btnClearHist
				]),
				E('table', { 'class': 'table', 'style': 'margin: 0; font-size: 12px;' }, [
					E('thead', {}, [
						E('tr', {}, [
							E('th', {}, _('Timestamp')),
							E('th', {}, _('Gateway / Server')),
							E('th', {}, _('Band')),
							E('th', {}, _('Ping (Avg)')),
							E('th', {}, _('Jitter')),
							E('th', {}, _('Loss')),
							E('th', {}, _('Download')),
							E('th', {}, _('Upload'))
						])
					]),
					E('tbody', { 'id': 'speedtest-history-body' })
				])
			])
		]);

		setTimeout(function() {
			if (self.localHistory) self.renderHistoryTable(self.localHistory);
		}, 80);

		return viewRoot;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
