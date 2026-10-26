#!/usr/bin/env bash
# ===========================================================================
# flash-firmware.sh — Flash the custom OpenWrt-Liberty image via EDL.
#
# Mirrors the upstream MSM8916 flash.sh, self-contained. Flashes a CLEAN image:
# no user settings are baked in (WiFi/network config, passwords etc. live in the
# overlay, which is erased -> the dongle boots with OpenWrt defaults). The unit's
# own radio partitions (IMEI/calibration) are backed up and restored, so its real
# IMEI is preserved.
#
# Reads images from ./firmware/. Run backup-stock.sh FIRST on a new dongle.
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

# put the dongle into EDL (9008): already in EDL, ssh reboot-edl, adb reboot, else manual D+/GND bridge
enter_edl() {
    if is_edl; then
        log "Dongle is already in EDL mode (05c6:9008)"
        return 0
    fi

    # Check if reachable via SSH on OpenWrt
    for ip in 192.168.8.1 192.168.1.1; do
        if ping -c 1 -W 1000 "$ip" >/dev/null 2>&1; then
            log "Dongle reachable via IP $ip — sending reboot-edl over SSH…"
            ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=2 "root@$ip" "reboot-edl" 2>/dev/null || true
            wait_edl
            return
        fi
    done

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
is_edl() {
    local os; os="$(uname -s)"
    if [[ "$os" == Darwin ]]; then
        ioreg -p IOUSB -w0 2>/dev/null | grep -qiE "0x9008|QHSUSB|QDLoader"
    elif [[ "$os" == Linux ]]; then
        lsusb 2>/dev/null | grep -qiE "05c6:9008|QHSUSB|QDLoader"
    else
        return 1
    fi
}
wait_edl() {  # fast 9008 detection: macOS (ioreg), Linux (lsusb), else skip
    local os; os="$(uname -s)"
    [[ "$os" != Darwin && "$os" != Linux ]] && { log "Assuming the dongle is in EDL."; return 0; }
    log "Waiting for the EDL device (05c6:9008)…"; local i
    for i in $(seq 1 40); do
        if is_edl; then
            log "EDL device detected."; return 0; fi
        sleep 1
    done
    warn "Could not confirm 9008 automatically — continuing (edl waits for the device)."
}

find_firmware_files() {
    local dir="$1"
    GPT="$(find "$dir" -maxdepth 1 -name "*gpt_both0.bin" 2>/dev/null | head -1 || true)"
    BOOT="$(find "$dir" -maxdepth 1 -name "*boot.img" 2>/dev/null | head -1 || true)"
    ROOTFS="$(find "$dir" -maxdepth 1 -name "*system.img" 2>/dev/null | head -1 || true)"
    ZIP="$(find "$dir" -maxdepth 1 -name "*firmware.zip" 2>/dev/null | head -1 || true)"
    [[ -n "$GPT" && -n "$BOOT" && -n "$ROOTFS" && -n "$ZIP" ]]
}

FW_DIRS=()
FW_LABELS=()

# 1. OpenWrt Stable build in this repo
if find_firmware_files "firmware/openwrt-stable"; then
    FW_DIRS+=("firmware/openwrt-stable")
    FW_LABELS+=("OpenWrt Stable (Clean 13MB / Native Qualcomm Tools - ./firmware/openwrt-stable)")
fi

# 2. OpenWrt-Liberty in this repo
if find_firmware_files "firmware"; then
    FW_DIRS+=("firmware")
    FW_LABELS+=("OpenWrt-Liberty (Bypass / PassWall / VPN - ./firmware)")
fi

# 3. Any other subfolder in ./firmware/
for sub in firmware/*/; do
    sub_clean="${sub%/}"
    [[ "$sub_clean" == "firmware/openwrt-stable" ]] && continue
    if [[ -d "$sub_clean" ]] && find_firmware_files "$sub_clean"; then
        FW_DIRS+=("$sub_clean")
        FW_LABELS+=("Custom Folder: $sub_clean")
    fi
done

echo "=== Select OpenWrt Firmware to Flash ==="
SELECTED_FW_DIR=""
if [[ ${#FW_DIRS[@]} -eq 0 ]]; then
    warn "No pre-configured firmware directories found."
    read -e -r -p "Enter path to firmware folder: " SELECTED_FW_DIR
else
    for i in "${!FW_DIRS[@]}"; do
        printf "  %d) %s\n" "$((i+1))" "${FW_LABELS[$i]}"
    done
    printf "  %d) Enter custom directory path\n" "$(( ${#FW_DIRS[@]} + 1 ))"
    read -r -p "Select firmware [1-$(( ${#FW_DIRS[@]} + 1 ))] (default 1): " fw_choice
    fw_choice="${fw_choice:-1}"
    if [[ "$fw_choice" -le "${#FW_DIRS[@]}" && "$fw_choice" -ge 1 ]]; then
        SELECTED_FW_DIR="${FW_DIRS[$((fw_choice-1))]}"
    else
        read -e -r -p "Enter path to firmware folder: " SELECTED_FW_DIR
    fi
fi

SELECTED_FW_DIR="${SELECTED_FW_DIR//\"/}"
SELECTED_FW_DIR="${SELECTED_FW_DIR//\'/}"
SELECTED_FW_DIR="${SELECTED_FW_DIR%/}"

find_firmware_files "$SELECTED_FW_DIR" || die "Directory does not contain required files (*gpt_both0.bin, *boot.img, *system.img, *firmware.zip): $SELECTED_FW_DIR"

# Dynamically calculate total sectors from GPT header
alt_lba=$(od -An -tu8 -j 544 -N 8 "$GPT" 2>/dev/null | tr -d '[:space:]' || true)
if [[ "${alt_lba:-0}" =~ ^[0-9]+$ ]] && [[ "$alt_lba" -ge 67 ]]; then
    TOT_SECTORS=$((alt_lba + 1))
else
    TOT_SECTORS=7569408
fi

echo
log "Using firmware directory: $SELECTED_FW_DIR"
log "GPT:    $(basename "$GPT") (Total sectors: $TOT_SECTORS)"
log "Boot:   $(basename "$BOOT")"
log "Rootfs: $(basename "$ROOTFS")"
log "Bundle: $(basename "$ZIP")"

# Extract the Qualcomm .mbn firmware from the bundle.
MBN="$(mktemp -d)"; trap 'rm -rf "$MBN" "$GPTTMP"; [[ -n "$SAVED" && "$RADIO_SRC" != "2" ]] && rm -rf "$SAVED"' EXIT
GPTTMP=""; SAVED=""
log "Extracting .mbn firmware from $(basename "$ZIP")…"
unzip -q -j -d "$MBN" "$ZIP" "*.mbn"
for p in aboot hyp rpm sbl1 tz; do
    [[ -f "$MBN/$p.mbn" ]] || die "$p.mbn missing from firmware bundle"
done

RADIO="fsc fsg modemst1 modemst2 modem persist sec"

echo
warn "This ERASES the OpenWrt overlay / any existing config on the dongle."
echo "Choose radio/modem partitions source ($RADIO):"
echo "  1) Read live from connected dongle (default - preserves current dongle state)"
echo "  2) Restore from local radio/stock backup (./backup/*)"
read -r -p "Select source [1/2] (default 1): " RADIO_SRC
RADIO_SRC="${RADIO_SRC:-1}"

STOCK_DIR=""
if [[ "$RADIO_SRC" == "2" ]]; then
    validate_radio_dir() {
        local d="$1"
        for part in $RADIO; do
            [[ -s "$d/$part.bin" ]] || return 1
        done
        return 0
    }

    RADIO_DIRS=()
    for b_dir in backup/*/; do
        b_clean="${b_dir%/}"
        if [[ -d "$b_clean" ]] && validate_radio_dir "$b_clean"; then
            RADIO_DIRS+=("$b_clean")
        fi
    done

    if [[ ${#RADIO_DIRS[@]} -eq 0 ]]; then
        warn "No valid radio backup folders found in ./backup/."
        read -e -r -p "Enter path to folder containing radio .bin files: " STOCK_DIR
    else
        echo "Found valid radio backup folders:"
        for i in "${!RADIO_DIRS[@]}"; do
            printf "  %d) %s\n" "$((i+1))" "${RADIO_DIRS[$i]}"
        done
        printf "  %d) Enter custom directory path\n" "$(( ${#RADIO_DIRS[@]} + 1 ))"
        read -r -p "Select backup [1-$(( ${#RADIO_DIRS[@]} + 1 ))] (default 1): " b_choice
        b_choice="${b_choice:-1}"
        if [[ "$b_choice" -le "${#RADIO_DIRS[@]}" && "$b_choice" -ge 1 ]]; then
            STOCK_DIR="${RADIO_DIRS[$((b_choice-1))]}"
        else
            read -e -r -p "Enter path to folder containing radio .bin files: " STOCK_DIR
        fi
    fi

    STOCK_DIR="${STOCK_DIR//\"/}"
    STOCK_DIR="${STOCK_DIR//\'/}"
    STOCK_DIR="${STOCK_DIR%/}"

    validate_radio_dir "$STOCK_DIR" || die "Directory does not contain all required radio partitions ($RADIO): $STOCK_DIR"
    log "Using radio backup from: $STOCK_DIR"
fi

read -r -p "Continue flashing? (y/N): " c; [[ "$c" =~ ^[Yy]$ ]] || { log "Cancelled."; exit 0; }

ensure_edl
enter_edl

SAVED=""
if [[ "$RADIO_SRC" == "2" ]]; then
    SAVED="$STOCK_DIR"
    log "Skipping live radio backup; will restore from $STOCK_DIR"
else
    SAVED="$(mktemp -d)"
    log "Backing up radio partitions from this unit…"
    for n in $RADIO; do log "  read $n"; "$EDL" r "$n" "$SAVED/$n.bin" || die "backup of $n failed"; done
fi

log "Flashing GPT (raw sector writes)…"
GPTTMP="$(mktemp -d)"
dd if="$GPT" bs=512 count=34         of="$GPTTMP/primary.bin"        2>/dev/null
dd if="$GPT" bs=512 skip=34 count=32 of="$GPTTMP/backup_entries.bin" 2>/dev/null
dd if="$GPT" bs=512 skip=66 count=1  of="$GPTTMP/backup_header.bin"  2>/dev/null
"$EDL" ws 0                     "$GPTTMP/primary.bin"        || die "GPT primary write failed"
"$EDL" ws $((TOT_SECTORS-33))   "$GPTTMP/backup_entries.bin" || die "GPT backup-entries write failed"
"$EDL" ws $((TOT_SECTORS-1))    "$GPTTMP/backup_header.bin"  || die "GPT backup-header write failed"

log "Flashing firmware + OpenWrt images…"
"$EDL" w aboot  "$MBN/aboot.mbn" || die "aboot"
"$EDL" w hyp    "$MBN/hyp.mbn"   || die "hyp"
"$EDL" w rpm    "$MBN/rpm.mbn"   || die "rpm"
"$EDL" w sbl1   "$MBN/sbl1.mbn"  || die "sbl1"
"$EDL" w tz     "$MBN/tz.mbn"    || die "tz"
"$EDL" w boot   "$BOOT"          || die "boot"
"$EDL" w rootfs "$ROOTFS"        || die "rootfs"
log "Wiping rootfs_data overlay header (clean overlay)..."
ZEROS="$(mktemp)"
dd if=/dev/zero of="$ZEROS" bs=1M count=32 status=none 2>/dev/null || dd if=/dev/zero of="$ZEROS" bs=512 count=65536 status=none 2>/dev/null || true
"$EDL" ws 610338 "$ZEROS" 2>/dev/null || warn "wiping rootfs_data header returned non-zero"
rm -f "$ZEROS"

log "Restoring radio partitions…"
for n in $RADIO; do log "  write $n"; "$EDL" w "$n" "$SAVED/$n.bin" || die "restore of $n failed"; done

log "Rebooting…"
"$EDL" reset || warn "edl reset failed — power-cycle the dongle manually"

echo
log "Flash complete in $(hms $SECONDS). The dongle boots OpenWrt with default config."
log "Access: http://192.168.1.1 over the USB gadget (DHCP hands out 192.168.1.x)."
