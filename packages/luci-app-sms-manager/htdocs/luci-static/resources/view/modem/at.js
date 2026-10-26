'use strict';
'require dom';
'require fs';
'require ui';
'require view';

/*
	Direct AT Command Console for Qualcomm MSM8916 Modem
*/

return view.extend({
	handleCommand: function() {
		let input = document.getElementById('at-command-input');
		let cmd = input ? input.value.trim() : '';
		if (!cmd) {
			ui.addNotification(null, E('p', _('Please enter an AT command')), 'error');
			return;
		}

		let btn = document.getElementById('btn-send-at');
		let outputBox = document.getElementById('at-output');
		if (btn) btn.disabled = true;

		fs.exec('/usr/bin/mmcli', ['-m', '0', '--command=' + cmd]).then(function(res) {
			if (outputBox) {
				outputBox.style.display = 'block';
				let txt = res.stdout || res.stderr || '';
				let m = txt.match(/response:\s*'([\s\S]*)'/);
				if (m) {
					txt = m[1].replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
				}
				outputBox.textContent = txt || _('(OK / Empty response)');
			}
		}).catch(function(err) {
			if (outputBox) {
				outputBox.style.display = 'block';
				outputBox.textContent = _('Error: ') + err.message;
			}
		}).finally(function() {
			if (btn) btn.disabled = false;
		});
	},

	setQuickCmd: function(cmd) {
		let input = document.getElementById('at-command-input');
		if (input) {
			input.value = cmd;
			input.focus();
		}
	},

	handleClear: function() {
		let input = document.getElementById('at-command-input');
		let outputBox = document.getElementById('at-output');
		if (input) input.value = '';
		if (outputBox) {
			outputBox.textContent = '';
			outputBox.style.display = 'none';
		}
	},

	render: function() {
		let self = this;

		let quickCommands = [
			{ label: 'ATI (Device Info)', cmd: 'ATI' },
			{ label: 'AT+CSQ (Signal)', cmd: 'AT+CSQ' },
			{ label: 'AT+COPS? (Operator)', cmd: 'AT+COPS?' },
			{ label: 'AT+CPMS? (SMS Storage)', cmd: 'AT+CPMS?' },
			{ label: 'AT+CSCA? (SMS Center)', cmd: 'AT+CSCA?' },
			{ label: 'AT$QCRSRP (RSRP/RSRQ)', cmd: 'AT$QCRSRP' },
			{ label: 'AT+CGSMS? (SMS Domain)', cmd: 'AT+CGSMS?' }
		];

		let quickButtons = E('div', {
			'style': 'display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0;'
		});

		quickCommands.forEach(function(item) {
			quickButtons.appendChild(
				E('button', {
					'class': 'cbi-button cbi-button-neutral',
					'style': 'font-size: 12px; padding: 4px 10px;',
					'click': function(ev) {
						ev.preventDefault();
						self.setQuickCmd(item.cmd);
					}
				}, item.label)
			);
		});

		return E([], [
			E('h2', _('AT Commands Console')),
			E('div', { 'class': 'cbi-map-descr' }, 
				_('Send direct Hayes AT commands to the Qualcomm baseband modem.')
			),

			E('div', { 'class': 'cbi-section' }, [
				E('div', { 'style': 'margin-bottom: 8px; font-weight: bold;' }, _('Quick Commands:')),
				quickButtons,

				E('div', { 'style': 'display: flex; gap: 10px; margin-top: 15px;' }, [
					E('input', {
						'type': 'text',
						'id': 'at-command-input',
						'class': 'cbi-input-text',
						'placeholder': 'ATI, AT+CSQ, AT+COPS?...',
						'style': 'flex: 1; font-family: monospace; font-size: 15px;',
						'keydown': function(ev) {
							if (ev.keyCode === 13) {
								ev.preventDefault();
								self.handleCommand();
							}
						}
					}),
					E('button', {
						'id': 'btn-send-at',
						'class': 'cbi-button cbi-button-action important',
						'click': function(ev) {
							ev.preventDefault();
							self.handleCommand();
						}
					}, _('Send')),
					E('button', {
						'class': 'cbi-button cbi-button-neutral',
						'click': function(ev) {
							ev.preventDefault();
							self.handleClear();
						}
					}, _('Clear'))
				]),

				E('div', { 'style': 'margin-top: 20px;' }, [
					E('div', { 'style': 'font-weight: bold; margin-bottom: 6px;' }, _('Modem Response:')),
					E('pre', {
						'id': 'at-output',
						'style': 'display: none; padding: 12px; background: var(--background-color-high, #1e1e1e); color: var(--text-color-high, #00ff66); font-family: monospace; font-size: 14px; border-radius: 6px; border: 1px solid var(--border-color-medium); max-height: 350px; overflow-y: auto; white-space: pre-wrap;'
					})
				])
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
