#!/usr/bin/env bash
# ===========================================================================
# backup-stock.sh — Full EDL backup of a STOCK UZ801 dongle.
#
# Dumps every flash partition (except userdata/cache, which carry no unique
# data) plus the GPT into  backup/stock-<timestamp>/  and writes a
# restore_sectors.txt that restore-stock.sh consumes. This preserves the
# device's per-unit radio/calibration data (modemst1/2, fsg, sec, persist,
# modem) — i.e. its REAL IMEI — so you can always return it to factory.
#
# Run this on a NEW dongle BEFORE flashing anything.
# Any missing tool (edl, python, adb) is installed into ./temp automatically;
# nothing is written outside the project.
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

# Stock partition layout (label  start_sector  num_sectors) from rawprogram0.xml.
# Board-specific to FY_UZ801_V3.2. userdata/cache excluded (formatted, not imaged).
PARTS_TABLE="
modem 131072 131072
sbl1 262144 1024
sbl1bak 263168 1024
aboot 264192 2048
abootbak 266240 2048
rpm 268288 1024
rpmbak 269312 1024
tz 270336 1024
tzbak 271360 1024
hyp 272384 1024
hypbak 273408 1024
pad 274432 2048
modemst1 276480 3072
modemst2 279552 3072
misc 282624 2048
fsc 284672 2
ssd 284674 16
splash 284690 20480
DDR 393216 64
fsg 393280 3072
sec 396352 32
boot 396384 32768
system 429152 1638400
persist 2067552 65536
recovery 2395232 32768
"
GPT_PRIMARY_SECTOR=0
GPT_BACKUP_SECTOR=7569375

# Dump GPT + every listed partition into $1 (edl must be connected).
# GPT is read by absolute sectors (edl's `gpt <dir>` doesn't write gpt_*.bin here):
#   primary  = 34 sectors from 0,  backup = 33 sectors from GPT_BACKUP_SECTOR.
edl_read_all() {
    local out="$1" name start num
    log "Reading GPT (primary 34 sectors @0, backup 33 sectors @$GPT_BACKUP_SECTOR)…"
    "$EDL" rs 0 34 "$out/gpt_main0.bin"                  || die "GPT primary read failed"
    "$EDL" rs "$GPT_BACKUP_SECTOR" 33 "$out/gpt_backup0.bin" || die "GPT backup read failed"
    while read -r name start num; do
        [[ -z "$name" ]] && continue
        log "Reading $name ($num sectors)…"
        "$EDL" r "$name" "$out/$name.bin" || die "read of $name failed"
    done <<< "$(echo "$PARTS_TABLE" | sed '/^[[:space:]]*$/d')"
}
# Write restore map (sector  file  label), GPT first, for restore-stock.sh.
write_restore_map() {
    local out="$1" name start num
    {
        echo "$GPT_PRIMARY_SECTOR gpt_main0.bin PrimaryGPT"
        echo "$PARTS_TABLE" | sed '/^[[:space:]]*$/d' | while read -r name start num; do
            echo "$start $name.bin $name"
        done
        echo "$GPT_BACKUP_SECTOR gpt_backup0.bin BackupGPT"
    } > "$out/restore_sectors.txt"
}

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="backup/stock-$STAMP"

echo "=== UZ801 stock backup ==="
log "Output: $OUT"
mkdir -p "$OUT"

ensure_edl
enter_edl

log "Reading partitions (this takes a few minutes)…"
edl_read_all "$OUT"
write_restore_map "$OUT"

log "Leaving EDL…"
"$EDL" reset || warn "edl reset failed — power-cycle the dongle manually"

# Integrity summary.
{
    echo "UZ801 (FY_UZ801_V3.2) stock backup"
    echo "created: $STAMP"
    echo
    echo "size  md5  file"
    for f in "$OUT"/*.bin; do
        printf '%s  %s  %s\n' "$(wc -c <"$f")" "$(md5 -q "$f" 2>/dev/null || md5sum "$f" | awk '{print $1}')" "$(basename "$f")"
    done
} > "$OUT/MANIFEST.txt"

echo
log "Backup complete in $(hms $SECONDS): $OUT"
log "  $(ls -1 "$OUT"/*.bin | wc -l | tr -d ' ') partition images + gpt + restore_sectors.txt + MANIFEST.txt"
warn "KEEP THIS FOLDER SAFE — it is the only way back to factory (contains the unit's IMEI)."
