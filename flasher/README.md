<div align="center">

<img src="docs/img/uz801-modem.png" alt="UZ801 v3.2 — 4G LTE USB dongle" width="440">

# OpenWrt-Liberty for UZ801 v3.2

**Custom, fully LuCI-managed OpenWrt firmware for the UZ801 v3.2 4G LTE dongle** — a
pocket-sized travel router and anti-censorship appliance. Every feature is
configurable from the web interface; no command line is needed for day-to-day use.

[![OpenWrt](https://img.shields.io/badge/OpenWrt-25.12.5-00B5E2?logo=openwrt&logoColor=white)](https://openwrt.org/)
[![Kernel](https://img.shields.io/badge/kernel-6.12-orange)](https://www.kernel.org/)
[![SoC](https://img.shields.io/badge/SoC-MSM8916%20%C2%B7%20aarch64-lightgrey)](https://en.wikipedia.org/wiki/Qualcomm_Snapdragon)
[![Firmware](https://img.shields.io/badge/firmware-ready--to--flash-brightgreen)](firmware)
[![Host](https://img.shields.io/badge/host-macOS%20%7C%20Linux%20%7C%20Windows-informational)](#host)

**English** · [Русский](docs/README.ru.md)

</div>

---

This repository contains the ready-to-flash firmware image and the scripts that back up,
flash, and restore a dongle.

| | |
|---|---|
| **Base** | OpenWrt 25.12.5 (kernel 6.12), branded `OpenWrt-Liberty` |
| **Target** | `msm89xx / msm8916`, `aarch64`, device profile `yiming-uz801v3` |
| **Hardware** | Qualcomm MSM8916 (Snapdragon 410), 384 MB RAM, 4 GB eMMC, board `FY_UZ801_V3.2` |
| **Ready to flash** | the image ships in [`firmware/`](firmware) — cloning the repository is enough |
| **Management** | LuCI at `http://192.168.1.1` over the USB gadget |

## Table of contents

- [Quick start](#quick-start)
- [Features](#features)
  - [Liberty application guides](docs/liberty/README.md)
- [Repository layout](#repository-layout)
- [Command summary](#command-summary)
- [Requirements](#requirements)
  - [Host](#host)
  - [Software — automatic installation](#software--automatic-installation)
  - [USB access to the EDL device (per operating system)](#usb-access-to-the-edl-device-per-operating-system)
  - [Hardware](#hardware)
- [Entering EDL mode](#entering-edl-mode)
- [Procedure A — Install OpenWrt-Liberty on a factory dongle](#procedure-a--install-openwrt-liberty-on-a-factory-dongle)
- [Procedure B — Restore factory firmware](#procedure-b--restore-factory-firmware)
- [Firmware image files](#firmware-image-files)
- [Troubleshooting](#troubleshooting)
- [Hardware notes and limitations](#hardware-notes-and-limitations)
- [Credits](#credits)

---

## Quick start

**A ready-to-flash firmware image is committed to this repository, in
[`firmware/`](firmware).** Cloning the repository is therefore all that is needed to
provision a dongle.

```sh
git clone <this-repository>
cd <repository-root>

./backup-stock.sh       # 1. back up the factory firmware  (dongle in EDL)
./flash-firmware.sh     # 2. flash the prebuilt image      (dongle in EDL)
```

That is the whole procedure. `flash-firmware.sh` reads the images straight from
`firmware/`; any tool it needs (`edl`, `python3`, `adb`) is downloaded into `temp/`
automatically on first run.

| | |
|---|---|
| **Shipped image** | `openwrt-liberty-25.12.5-msm89xx-msm8916-yiming-uz801v3` (~78 MB total, 7 files) |
| **Same image for every unit** | per-unit data (IMEI, radio calibration) is read from the dongle itself during flashing, never from the image |
| **Package list** | see the `*.manifest` file in [`firmware/`](firmware) — every package and version in the image |

Full step-by-step instructions, including how to put the dongle into EDL mode, are in
[Procedure A](#procedure-a--install-openwrt-liberty-on-a-factory-dongle).

---

## Features

### Liberty — a dedicated menu section

All anti-censorship, VPN and proxy applications are grouped under a single top-level
**Liberty** menu in LuCI, sorted alphabetically. Applications that are not installed are
skipped automatically.

| Application | Purpose |
|---|---|
| **AmneziaWG** | obfuscated WireGuard (DPI-resistant); the kernel module matches the exact kernel vermagic of this firmware |
| **OpenVPN** | classic VPN client / server |
| **PassWall** | LuCI front end for xray-core — VLESS + Reality + XHTTP and other modern transports |
| **Tailscale** | zero-configuration mesh VPN |
| **WireGuard** | standard WireGuard |
| **Zapret** | DPI circumvention without a proxy server |

**[→ Setup guides for every Liberty application](docs/liberty/README.md)** — one guide per
application, with screenshots taken from a running dongle: how to configure it, how to send
all traffic through it, and how to make sure nothing leaks when it goes down.

### Modem

- **Services → SMS** — the modem's mailbox: Inbox / Outbox / Drafts folders, a
  conversation view, an on-device archive that is not bound by the SIM's own message
  storage, and USSD sessions for balance and package queries. Everything goes through
  ModemManager, so no dedicated AT serial port is needed.
- **ModemManager** with QMI, MBIM, QRTR and netifd integration.

### Networking and monitoring

| Package | Purpose |
|---|---|
| **vnstat2** | long-term traffic statistics per interface |
| **nlbwmon** | per-host bandwidth accounting |
| **https-dns-proxy** | DNS over HTTPS |
| **SQM** | queue management / bufferbloat control |
| **adblock-fast** | advertisement blocking (ad blocking only — not censorship circumvention) |
| **watchcat** | connectivity watchdog and scheduled reboots |
| **usb-gadget** | NCM / RNDIS / mass storage / ACM serial modes, configurable from LuCI |
| **zram-swap** | compressed swap in RAM (the device has 384 MB) |

---

## Repository layout

```
firmware/                     ready-to-flash image — flash straight from a clone
docs/                         documentation assets and the Russian README

backup-stock.sh               full EDL backup of a factory dongle
flash-firmware.sh             flash firmware/ onto the dongle via EDL
restore-stock.sh              roll a dongle back to factory from a backup
```

Nothing is written outside the repository directory.

---

## Command summary

```sh
cd <repository-root>

# Factory dongle -> OpenWrt-Liberty (the image in firmware/ is used):
[EDL]  ./backup-stock.sh      # 1. back up factory firmware
[EDL]  ./flash-firmware.sh    # 2. flash

# Restore factory firmware:
[EDL]  ./restore-stock.sh     # roll back from backup
```

`[EDL]` denotes that the dongle must be placed in EDL mode (D+/GND bridge during
insertion) before the command is run.

---

## Requirements

This section and the two procedures below describe the complete process of provisioning
a UZ801 v3.2 dongle: backing up its factory firmware, installing the custom
OpenWrt-Liberty firmware, and restoring the factory firmware when required. The
procedure is performed with three scripts and requires no programming.

All UZ801 v3.2 units share the same firmware image. Per-unit data (IMEI, radio
calibration) is never contained in the image; it is preserved from the unit's own
partitions during flashing.

### Host

The scripts are POSIX shell scripts and run on **macOS, Linux, or Windows**. On Windows,
run them from a POSIX environment — **MSYS2**, **Git Bash**, or **WSL**. Check out this
repository; its directory is referred to below as the *repository root*.

### Software — automatic installation

The flashing scripts install anything they are missing **into the project's `temp/`
directory** on first run. Nothing is written anywhere else on the machine, and `temp/` is
git-ignored; delete it at any time to reclaim the space (it is rebuilt on demand).

| Tool | Purpose | If missing |
|------|---------|-----------|
| `bash` | runs the scripts | install manually (MSYS2 / Git Bash / WSL on Windows) |
| `git`, `curl` | fetch the tools below | install manually (usually already present) |
| `python3` | runtime for `edl` | a standalone Python is downloaded into `temp/python` |
| `edl` | the EDL flashing tool | installed into `temp/edl`; set `EDL_BIN` to reuse an existing install |
| `adb` | auto-enter EDL from stock; reformat userdata/cache on restore | Android platform-tools are downloaded into `temp/platform-tools` |
| `libusb` | native USB backend for `edl` | install via the package manager only if edl reports no USB backend (macOS: `brew install libusb`; Linux: `apt install libusb-1.0-0`) |

On a fresh machine you typically only need `bash`, `git`, `curl` and (on Windows) the USB
driver below — everything else is fetched into `temp/` on first run.

### USB access to the EDL device (per operating system)

- **macOS** — works as-is; no driver required.
- **Linux** — install `usbutils` (for `lsusb`). Grant access to the EDL device
  (`05c6:9008`) and to adb by running the flashing scripts with `sudo`, or by adding a
  udev rule:
  ```
  # /etc/udev/rules.d/51-edl.rules
  SUBSYSTEM=="usb", ATTR{idVendor}=="05c6", ATTR{idProduct}=="9008", MODE="0660", GROUP="plugdev"
  ```
  then `sudo udevadm control --reload && sudo udevadm trigger`.
- **Windows** — the EDL device needs the **WinUSB / libusb** driver: run
  [Zadig](https://zadig.akeo.ie/), select the `QHSUSB__BULK` (9008) device, and install
  the **WinUSB** (or libusb-win32) driver over it. Install the Google USB driver for adb.
  Run the scripts from MSYS2 / Git Bash / WSL.

### Hardware

- A UZ801 v3.2 dongle.
- A thin metal tool (tweezers, a straightened paperclip, or a knife blade) to briefly
  bridge two connector contacts (see [Entering EDL mode](#entering-edl-mode)).

Change into the repository root once per terminal session; all commands below run from
there:

```sh
cd <repository-root>
```

---

## Entering EDL mode

Flashing and restoring require the dongle to be in **EDL** (Emergency Download) mode, in
which it enumerates on USB as `05c6:9008` (QHSUSB__BULK). EDL is entered by momentarily
bridging the **D+** and **GND** pins of the dongle's USB plug while the plug is inserted
into the host.

<div align="center">
<img src="docs/img/edl-bridge.png" alt="Bridge pin 3 (D+) to pin 4 (GND) on the dongle's USB plug to enter EDL mode" width="820">
</div>

The dongle terminates in a **USB Type-A male plug**. As the diagram shows, its four
contacts have two distinct ends:

- the **mating contacts** — the four flat gold pads that enter the USB port;
- the **solder tails** — the same four pins where they leave the connector and are
  soldered to the dongle's circuit board.

Pin assignment (USB Type-A standard):

| Pin | Signal | Position |
|-----|--------|----------|
| 1 | +5V (VBUS) | outer |
| 2 | D− | inner |
| 3 | **D+** | inner |
| 4 | **GND** | outer |

To enter EDL, bridge **pin 3 (D+)** to the adjacent **pin 4 (GND)** — the inner contact
and the outer contact next to it, at one end of the connector.

> **Identifying the correct end.** The two data lines (D−, D+) are the inner pair; +5V and
> GND are the outer pair. You must bridge D+ to the GND that is next to it, i.e. one end
> pair (pins 3+4) rather than the other (pins 1+2). Make sure of the pair before touching
> the contacts — bridging the wrong one shorts the +5V rail.

### Procedure

1. Remove the dongle from the host.
2. Position the metal tool so it bridges **pin 3 (D+) and pin 4 (GND)** simultaneously.
3. Holding the bridge in place, insert the dongle into a USB port.
4. After approximately two seconds, remove the tool.

Confirm entry by checking that the host shows a `9008` device. If it does not, remove the
dongle and repeat. **Do not maintain the bridge for more than three to four seconds.**

---

## Procedure A — Install OpenWrt-Liberty on a factory dongle

Perform the steps in order.

### Step 1 — Back up the factory firmware

> **This backup is the only path back to factory firmware. Do not skip it.** It also
> holds the unit's own IMEI and radio calibration data — keep the resulting directory
> safe.

1. Put the dongle into EDL mode.
2. Run:
   ```sh
   ./backup-stock.sh
   ```
   The script reads every partition into `backup/stock-<timestamp>/` (several minutes)
   and reports `Backup complete` on success.

### Step 2 — Flash

1. Put the dongle into EDL mode again (it leaves EDL after the backup).
2. Run:
   ```sh
   ./flash-firmware.sh
   ```
3. Confirm with `y` when prompted. The script backs up the unit's radio partitions
   (preserving its IMEI), writes the image, and reboots the dongle.

The installed image is **clean**: no user settings (Wi-Fi, network, passwords) are baked
in. Those live in the overlay, which is erased during flashing, so the dongle boots with
OpenWrt defaults.

### Step 3 — Verify

The dongle boots automatically. After approximately one minute, open a browser to:

```
http://192.168.1.1
```

Log in as `root` with an empty password. This is the OpenWrt-Liberty interface.

---

## Procedure B — Restore factory firmware

1. Put the dongle into EDL mode.
2. Run (the script uses the most recent backup in `backup/` by default):
   ```sh
   ./restore-stock.sh
   ```
   To select a specific backup:
   ```sh
   ./restore-stock.sh backup/stock-20260722-190000
   ```
3. Confirm with `y`. The script writes the factory partitions, reformats the service
   partitions (userdata, cache), and reboots.
4. After approximately one minute the dongle raises the factory Wi-Fi network
   `4G-UFI-FE9` (WPA2 password `1234567890`); its web interface is at
   `http://192.168.100.1`.

---

## Firmware image files

The image in `firmware/` consists of the following files:

| File | Purpose |
|---|---|
| `*-squashfs-sysupgrade.bin` | sysupgrade image (upgrade from a running OpenWrt) |
| `*-squashfs-system.img` | root filesystem, written by `flash-firmware.sh` |
| `*-squashfs-boot.img` | boot partition image |
| `*-squashfs-gpt_both0.bin` | partition table |
| `*-firmware.zip` | Qualcomm firmware blobs (aboot, hyp, rpm, sbl1, tz) |
| `*-flash.sh` | upstream OpenWrt EDL flashing script; `flash-firmware.sh` is used instead |
| `*.manifest` | every package and version contained in the image |

---

## Troubleshooting

| Symptom | Action |
|---------|--------|
| Script reports `no device`, or hangs waiting | The dongle is not in EDL. Remove it and repeat the EDL entry procedure. |
| Dongle unresponsive in EDL | Remove and reinsert it (with the D+/GND bridge if EDL is needed). Power is reset only by physically reconnecting. |
| After restore, the dongle cycles and does not boot | The service partitions were not reformatted. Re-run `./restore-stock.sh`. |
| Modem status pages are empty right after boot | ModemManager needs 20–50 seconds to enumerate the modem after start. Wait, then reload the page. |

Every run of `backup-stock.sh`, `flash-firmware.sh` and `restore-stock.sh` is also
written to `logs/<script>-<timestamp>.log` (git-ignored) for later inspection.

---

## Hardware notes and limitations

- **Single 2.4 GHz Wi-Fi radio (WCNSS).** `iw` reports *"interface combinations are not
  supported"*, so only one Wi-Fi role can be active at a time. Wi-Fi repeater mode
  (AP + STA simultaneously) and 802.11s mesh are therefore **not possible on this
  hardware**. Wi-Fi-as-WAN (STA) works on its own, alongside the 4G modem — which uplink
  is used is chosen deliberately (interface `metric`), not by an automatic failover
  daemon.
- **Management runs over the USB gadget** (`usb0` → `br-lan` → `192.168.1.1`), never over
  Wi-Fi — so Wi-Fi experiments and reconfiguration cannot cut off access to the device.
- **Per-unit data is preserved.** Flashing backs up and restores the radio partitions
  (`fsc`, `fsg`, `modemst1`, `modemst2`, `modem`, `persist`, `sec`), so the unit keeps its
  own IMEI and calibration.
- **Specifications:** MSM8916 quad-core Cortex-A53, 384 MB RAM, 4 GB eMMC.
- After a factory restore the first boot takes about a minute; the factory Wi-Fi access
  point appears roughly 20 seconds after the system is up.

---

## Credits

This firmware is based on the work of:

- [openwrt/openwrt](https://git.openwrt.org/openwrt/openwrt.git) — the OpenWrt project.
- [hkfuertes/msm8916-openwrt](https://github.com/hkfuertes/msm8916-openwrt) — MSM8916
  target support and USB gadget integration.
- [bkerler/edl](https://github.com/bkerler/edl) — Qualcomm EDL flashing tool.
- [Openwrt-Passwall/openwrt-passwall](https://github.com/Openwrt-Passwall/openwrt-passwall),
  [remittor/zapret-openwrt](https://github.com/remittor/zapret-openwrt),
  [Slava-Shchipunov/awg-openwrt](https://github.com/Slava-Shchipunov/awg-openwrt) — feeds
  providing the Liberty applications.
