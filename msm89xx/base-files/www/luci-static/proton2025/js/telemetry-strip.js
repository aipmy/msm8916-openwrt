(function() {
	'use strict';

	var pollTimer = null;
	var isUpdating = false;

	function getRpcMethod() {
		if (window.L && L.rpc) {
			if (!getRpcMethod._fn) {
				getRpcMethod._fn = L.rpc.declare({
					object: 'luci.proton-system',
					method: 'getTelemetry'
				});
			}
			return getRpcMethod._fn;
		}
		return null;
	}

	function fetchDirect() {
		// Fallback via ubus HTTP call if L.rpc not loaded yet
		return new Promise(function(resolve, reject) {
			var xhr = new XMLHttpRequest();
			xhr.open('POST', '/ubus', true);
			xhr.setRequestHeader('Content-Type', 'application/json');
			xhr.timeout = 2500;
			xhr.onload = function() {
				if (xhr.status === 200) {
					try {
						var res = JSON.parse(xhr.responseText);
						if (res && res.result && res.result[1]) resolve(res.result[1]);
						else resolve(null);
					} catch(e) { resolve(null); }
				} else { resolve(null); }
			};
			xhr.onerror = function() { resolve(null); };
			xhr.ontimeout = function() { resolve(null); };

			var sid = '00000000000000000000000000000000';
			if (window.L && L.env && L.env.ubus_token) sid = L.env.ubus_token;
			else if (document.cookie) {
				var m = document.cookie.match(/sysauth(?:_[a-z]+)?=([a-f0-9]+)/);
				if (m) sid = m[1];
			}

			xhr.send(JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'call',
				params: [sid, 'luci.proton-system', 'getTelemetry', {}]
			}));
		});
	}

	function updateTelemetry() {
		if (isUpdating) return;
		if (document.visibilityState === 'hidden') return;

		var rpc = getRpcMethod();
		var promise = rpc ? rpc() : fetchDirect();

		isUpdating = true;
		promise.then(function(data) {
			isUpdating = false;
			if (!data) return;
			renderTelemetry(data);
		}).catch(function(err) {
			isUpdating = false;
		});
	}

	function renderTelemetry(d) {
		// Cache immediately in sessionStorage for instant hydration on page changes
		try {
			sessionStorage.setItem('proton_telemetry', JSON.stringify(d));
		} catch(e) {}

		// 1. Signal Stairs & Operator
		var elStairs = document.getElementById('telem-signal-stairs');
		var elOp = document.getElementById('telem-operator');
		var elRat = document.getElementById('telem-rat');
		var elSig = document.getElementById('telem-signal-pct');
		var elSigBox = document.getElementById('telem-signal-box');

		if (elStairs) elStairs.setAttribute('data-bars', d.bars != null ? d.bars : 0);
		if (elOp) elOp.textContent = d.operator || 'Searching';
		if (elRat) elRat.textContent = d.band || d.rat || 'LTE';
		if (elSig) elSig.textContent = (d.signal != null ? d.signal : 0) + '%';
		if (elSigBox) {
			if (d.band && d.rsrp) {
				elSigBox.title = 'Band: ' + d.band + ' | EARFCN: ' + (d.earfcn || '') + ' | PCI: ' + (d.pci || '') + ' | RSRP: ' + d.rsrp + ' dBm | RSRQ: ' + (d.rsrq || '') + ' dB | RSSI: ' + (d.rssi || '') + ' dBm | SINR: ' + (d.snr || '') + ' dB';
			} else {
				elSigBox.title = 'Cellular: ' + (d.operator || '') + ' (' + (d.state || '') + ')\nSignal: ' + (d.signal || 0) + '%';
			}
		}

		// 2. Temperature
		var elTemp = document.getElementById('telem-temp');
		if (elTemp && d.temp) {
			var val = parseFloat(d.temp);
			elTemp.textContent = d.temp + '°C';
			elTemp.className = 'telem-val telem-temp-val ' + (val < 58 ? 'telem-temp-cool' : (val < 72 ? 'telem-temp-warm' : 'telem-temp-hot'));
		}

		// 3. CPU Usage
		var elCpu = document.getElementById('telem-cpu');
		if (elCpu && d.cpu_pct != null) {
			elCpu.textContent = d.cpu_pct + '%';
			var cval = parseInt(d.cpu_pct, 10);
			elCpu.style.color = cval > 85 ? '#f87171' : (cval > 65 ? '#fb923c' : '');
		}

		// 4. RAM Usage
		var elRam = document.getElementById('telem-ram');
		var elRamBox = document.getElementById('telem-ram-box');
		if (elRam && d.ram_pct != null) {
			elRam.textContent = d.ram_pct + '%';
			if (elRamBox && d.ram_used && d.ram_total) {
				elRamBox.title = 'RAM Usage: ' + d.ram_pct + '% (' + d.ram_used + ' / ' + d.ram_total + ' MB)';
			}
		}

		// 5. Clients
		var elClients = document.getElementById('telem-clients');
		var elClientsBox = document.getElementById('telem-clients-box');
		if (elClients && d.clients != null) {
			var c = parseInt(d.clients, 10);
			elClients.textContent = c;
			if (elClientsBox) {
				elClientsBox.title = 'Connected Clients: ' + c + ' device(s)';
			}
		}
	}

	function start() {
		var bar = document.getElementById('proton-telemetry-strip');
		if (!bar) return;

		// Initial immediate update
		updateTelemetry();

		// Interval poll every 2.5 seconds
		if (pollTimer) clearInterval(pollTimer);
		pollTimer = setInterval(updateTelemetry, 2500);

		// Resume immediately when user focuses back on the tab
		document.addEventListener('visibilitychange', function() {
			if (document.visibilityState === 'visible') {
				updateTelemetry();
			}
		});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', start);
	} else {
		start();
	}
})();