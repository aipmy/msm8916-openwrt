#!/usr/bin/env bash
# ===========================================================================
# restore-stock.sh — Roll a dongle back to its STOCK firmware from a backup.
#
# Writes every backed-up partition to its ABSOLUTE start sector via `edl ws`
# (NOT `edl w`/`wl` by label — those map names to the CURRENT, i.e. OpenWrt,
# GPT and would write to the wrong offsets). Then formats userdata + cache,
# which the backup does NOT contain: without this stock can't mount /data and
# crash-loops on the boot animation (EXT4-fs "Can't find ext4 filesystem").
#
# Usage: ./restore-stock.sh [backup_dir]
#   backup_dir defaults to the newest backup/stock-* directory.
# Any missing tool (edl, python, adb) is installed into ./temp automatically.
# ===========================================================================
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p logs   # tee this run to ./logs/<script>-<timestamp>.log and the terminal
trap '' HUP PIPE
exec > >(tee -a "logs/$(basename "$0" .sh)-$(date +%Y%m%d-%H%M%S).log") 2>&1

# ===== self-contained tooling — everything installs into ./temp (gitignored) =====
TEMP_DIR="$PWD/temp"
c_g=$'\033[1;32m'; c_y=$'\033[1;33m'; c_r=$'\033[1;31m'; c_0=$'\033[0m'
log()  { printf '%s[*]%s %s\n' "$c_g" "$c_0" "$*"; }
warn() { printf '%s[!]%s %s\n' "$c_y" "$c_0" "$*"; }
die()  { printf '%s[-]%s %s\n' "$c_r" "$c_0" "$*" >&2; exit 1; }
hms()  { printf '%dh %02dm %02ds' $(($1/3600)) $(($1%3600/60)) $(($1%60)); }   # seconds -> H M S
PY=""; ADB=""; EDL="${EDL_BIN:-}"

# python3: system one, else a standalone build downloaded into ./temp/python
ensure_python() {
    command -v python3 >/dev/null 2>&1 && { PY=python3; return; }
    [[ -x "$TEMP_DIR/python/bin/python3" ]] && { PY="$TEMP_DIR/python/bin/python3"; return; }
    local t=20241016 v=3.12.7 triple
    case "$(uname -s)-$(uname -m)" in
        Darwin-arm64)  triple=aarch64-apple-darwin ;;
        Darwin-x86_64) triple=x86_64-apple-darwin ;;
        Linux-x86_64)  triple=x86_64-unknown-linux-gnu ;;
        Linux-aarch64) triple=aarch64-unknown-linux-gnu ;;
        *) die "no python3 and no standalone build for this platform — install python3" ;;
    esac
    log "python3 not found — downloading a standalone Python into ./temp/python"
    mkdir -p "$TEMP_DIR/python"
    curl -fsSL "https://github.com/astral-sh/python-build-standalone/releases/download/$t/cpython-$v+$t-$triple-install_only.tar.gz" \
        | tar -xz -C "$TEMP_DIR/python" --strip-components=1 || die "python download failed"
    PY="$TEMP_DIR/python/bin/python3"
}

# adb: system one, else Google platform-tools downloaded into ./temp
ensure_adb() {
    command -v adb >/dev/null 2>&1 && { ADB=adb; return; }
    [[ -x "$TEMP_DIR/platform-tools/adb" ]] && { ADB="$TEMP_DIR/platform-tools/adb"; return; }
    local os; case "$(uname -s)" in Darwin) os=darwin;; Linux) os=linux;; *) os=windows;; esac
    log "adb not found — downloading Android platform-tools into ./temp"
    mkdir -p "$TEMP_DIR"
    curl -fsSL "https://dl.google.com/android/repository/platform-tools-latest-$os.zip" -o "$TEMP_DIR/pt.zip" \
        && unzip -qo "$TEMP_DIR/pt.zip" -d "$TEMP_DIR" && rm -f "$TEMP_DIR/pt.zip" || die "adb download failed"
    ADB="$TEMP_DIR/platform-tools/adb"
}

# edl: EDL_BIN or a system edl, else install it into ./temp/edl
ensure_edl() {
    [[ -n "$EDL" && -x "$EDL" ]] && return
    command -v edl >/dev/null 2>&1 && { EDL=edl; return; }
    [[ -x "$TEMP_DIR/edl/venv/bin/edl" ]] && { EDL="$TEMP_DIR/edl/venv/bin/edl"; return; }
    ensure_python
    command -v git >/dev/null || die "git required to fetch edl"
    log "edl not found — installing it once into ./temp/edl"
    if [[ ! -d "$TEMP_DIR/edl/src" ]]; then
        git clone -q --depth 1 https://github.com/bkerler/edl "$TEMP_DIR/edl/src" || die "edl clone failed"
        git -C "$TEMP_DIR/edl/src" submodule update -q --init --recursive || true
    fi
    "$PY" -m venv "$TEMP_DIR/edl/venv"
    "$TEMP_DIR/edl/venv/bin/pip" install -q --upgrade pip
    "$TEMP_DIR/edl/venv/bin/pip" install -q "$TEMP_DIR/edl/src"
    [[ -x "$TEMP_DIR/edl/venv/bin/edl" ]] || die "edl install failed"
    EDL="$TEMP_DIR/edl/venv/bin/edl"
}

# put the dongle into EDL (9008): adb reboot from stock, else manual D+/GND bridge
enter_edl() {
    ensure_adb
    if [[ -n "$("$ADB" devices 2>/dev/null | awk 'NR>1 && $2=="device"{print $1}')" ]]; then
        log "Dongle on adb — rebooting into EDL"
        "$ADB" reboot edl 2>/dev/null || warn "adb reboot edl returned nonzero"
    else
        warn "Enter EDL manually: short the USB plug's D+ to GND while inserting the dongle"
        warn "(it enumerates as USB 05c6:9008 / QHSUSB__BULK)."
        read -r -p "    Press Enter once the dongle is in EDL mode... " _
    fi
    wait_edl
}
wait_edl() {  # portable 9008 detection: macOS (system_profiler), Linux (lsusb), else skip
    local os; os="$(uname -s)"
    [[ "$os" != Darwin && "$os" != Linux ]] && { log "Assuming the dongle is in EDL."; return 0; }
    log "Waiting for the EDL device (05c6:9008)…"; local i
    for i in $(seq 1 40); do
        if { [[ "$os" == Darwin ]] && system_profiler SPUSBDataType 2>/dev/null | grep -qiE "0x9008|QHSUSB|QDLoader"; } ||
           { [[ "$os" == Linux  ]] && lsusb 2>/dev/null | grep -qiE "05c6:9008|QHSUSB|QDLoader"; }; then
            log "EDL device detected."; return 0; fi
        sleep 1
    done
    warn "Could not confirm 9008 automatically — continuing (edl waits for the device)."
}

# Pick the backup directory.
BK="${1:-}"
[[ -z "$BK" ]] && BK="$(ls -1d backup/stock-* 2>/dev/null | sort | tail -n1 || true)"
[[ -n "$BK" && -d "$BK" ]] || die "no backup found — run ./backup-stock.sh first, or pass a backup dir"
MAP="$BK/restore_sectors.txt"
[[ -f "$MAP" ]] || die "$MAP not found — is this a valid backup?"

echo "=== Restore STOCK from: $BK ==="
grep -c . "$MAP" | xargs echo "  partitions in map:"

# Verify every referenced image exists before touching the device.
while read -r sector file label; do
    [[ -z "$sector" ]] && continue
    [[ -f "$BK/$file" ]] || die "missing image $BK/$file (referenced by $label)"
done < "$MAP"

# userdata/cache block devices on stock (from the stock GPT / dmesg).
USERDATA_DEV="/dev/block/mmcblk0p27"
CACHE_DEV="/dev/block/mmcblk0p25"

echo
warn "This OVERWRITES the whole flash with the stock backup and FACTORY-RESETS"
warn "userdata + cache. Everything currently on the dongle is lost."
read -r -p "Restore to stock? (y/N): " c; [[ "$c" =~ ^[Yy]$ ]] || { log "Cancelled."; exit 0; }

ensure_edl
enter_edl

log "Writing stock partitions by absolute sector…"
while read -r sector file label; do
    [[ -z "$sector" ]] && continue
    log "  ws $sector  <- $file  ($label)"
    "$EDL" ws "$sector" "$BK/$file" || die "write of $label @ $sector failed"
done < "$MAP"

log "Leaving EDL / rebooting to stock…"
"$EDL" reset || warn "edl reset failed — power-cycle the dongle manually"

# ---- Format userdata + cache so stock can mount /data (else it bootloops) ----
echo
log "Waiting for stock adb to format userdata/cache…"
if "$ADB" wait-for-device 2>/dev/null; then
    "$ADB" root >/dev/null 2>&1 || true
    sleep 2; "$ADB" wait-for-device 2>/dev/null || true
    log "  make_ext4fs $USERDATA_DEV (userdata)"
    "$ADB" shell "make_ext4fs $USERDATA_DEV" || warn "userdata format failed — run manually"
    log "  make_ext4fs $CACHE_DEV (cache)"
    "$ADB" shell "make_ext4fs $CACHE_DEV"    || warn "cache format failed — run manually"
    log "Rebooting into a clean stock system…"
    "$ADB" reboot || true
else
    warn "adb device didn't appear. Format manually once stock gives adb:"
    warn "  adb root && adb shell make_ext4fs $USERDATA_DEV && adb shell make_ext4fs $CACHE_DEV && adb reboot"
fi

echo
log "Stock restore done in $(hms $SECONDS). First stock boot after a factory reset takes ~1 min;"
log "the WiFi AP comes up ~20s after full boot (factory SSID, default web at 192.168.100.1)."
