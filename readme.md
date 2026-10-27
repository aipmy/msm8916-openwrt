# OpenWrt Stable for Qualcomm MSM8916 (YiMing UZ801v3) — ModemRadar

[![OpenWrt Version](https://img.shields.io/badge/OpenWrt-25.12.5-blue.svg)](https://openwrt.org/)
[![Kernel](https://img.shields.io/badge/Linux_Kernel-6.12.94-green.svg)](https://kernel.org/)
[![Theme](https://img.shields.io/badge/Theme-Proton2025-purple.svg)](packages/luci-theme-proton2025)
[![Hotspot Bypass](https://img.shields.io/badge/TTL_Bypass-Default_64-orange.svg)](#-fitur-utama)
[![License](https://img.shields.io/badge/License-GPL--2.0-lightgrey.svg)](LICENSE)

Distribusi kustom **OpenWrt Stable** siap pakai untuk modem USB Qualcomm Snapdragon 410 (MSM8916) tipe **YiMing UZ801 v3 / v3.2** (`yiming,uz801-v3`). 

Firmware ini dirancang khusus untuk stabilitas tinggi, performa jaringan seluler maksimal, dan tampilan web UI LuCI modern tanpa memerlukan konfigurasi manual yang rumit setelah flashing.

---

## 🚀 Fitur Utama (Out of the Box)

* **Linux Kernel 6.12.94 Bebas Boot Loop**: Masalah kernel panic / stuck red LED pada firmware Stable teratasi dengan meniadakan patch CPR/SPM yang tidak kompatibel dengan PMIC UZ801.
* **Tema Proton2025 Baked-In**: Seluruh modul tema Proton2025 modern dark UI sudah terintegrasi langsung di dalam image SquashFS (`system.img`), termasuk perbaikan layout navigasi mobile-close button dan router client-side SPA.
* **Auto Hotspot Sharing Bypass (TTL 64 Default)**: Mangle firewall nftables otomatis aktif saat booting pertama (`ip ttl set 64` & `ip6 hoplimit set 64`), mencegah kuota tethering operator seluler terpotong. Dilengkapi menu kontrol di **Modem -> Fix TTL**.
* **Radio Signal Gauges Real-Time**: Perbaikan pembacaan indikator SINR/SNR dan RSSI di halaman **Modem -> Band Lock** dengan mekanisme fallback native QMI (`qmicli`).
* **Web Terminal Browser Integrasi (`ttyd`)**: Akses terminal CLI root langsung dari browser di menu **Services -> Terminal** tanpa setup SSH manual.
* **Otomasi LED Netdev Hardware**:
  * 🔵 **LED Biru (`blue:wlan`)**: Berkedip otomatis mengikuti aktivitas Wi-Fi & LAN (`br-lan`).
  * 🟢 **LED Hijau (`green:wan`)**: Berkedip otomatis mengikuti trafik jaringan seluler 4G LTE (`wwan0`).
* **Branding Minimalis & Bersih**: Identitas sistem disesuaikan menjadi **ModemRadar by aipmy**, meniadakan footer dan branding OpenWrt default.
* **Firmware Siap Flash**: File biner firmware siap pakai tersedia langsung di direktori [`flasher/firmware/openwrt-stable`](flasher/firmware/openwrt-stable).

---

## ⚡ Quick Start: Flashing via EDL Mode

Seluruh alat bantu flashing dan image firmware siap pakai sudah disertakan di folder `flasher/`.

### 1. Masuk ke Mode EDL (Qualcomm HS-USB QDLoader 9008)
1. Cabut dongle UZ801 dari port USB.
2. Buka penutup modem, tekan dan tahan **tombol boot / EDL switch** kecil di papan PCB.
3. Sambil menahan tombol, colokkan modem ke port USB komputer.
4. Lepaskan tombol setelah 2 detik.

### 2. Eksekusi Script Flash
Buka terminal dan jalankan:
```bash
cd flasher
./flash-firmware.sh
```
Pilih opsi **`OpenWrt Stable (Clean / Native Tools - ./firmware/openwrt-stable)`**. Script akan mempartisi eMMC dan menulis seluruh image yang diperlukan secara otomatis.

### 3. Akses Dashboard LuCI
Setelah flashing selesai, cabut dan colokkan ulang modem:
* **IP Default**: `192.168.8.1`
* **Web UI**: `http://192.168.8.1`
* **Username**: `root`
* **Password**: *(kosongkan / tanpa password)*

Untuk panduan lebih detail, baca [Panduan Flashing Lengkap](flasher/QUICKSTART.md).

---

## 🛠️ Kompilasi dari Source

Proyek ini menggunakan Docker builder agar dependensi build OpenWrt terisolasi dengan rapi.

```bash
# Build penuh untuk board UZ801
./build.sh build uz801

# Membuka terminal builder di dalam container
./build.sh shell

# Mengonfigurasi paket via menuconfig
./build.sh menuconfig uz801
```

---

## 📂 Struktur Repositori

```text
├── flasher/                    # Tooling flashing EDL & image firmware siap pakai
│   ├── flash-firmware.sh       # Script eksekutor flash otomatis via edl
│   ├── backup-stock.sh         # Script backup firmware bawaan pabrik
│   └── firmware/openwrt-stable # Image biner siap flash (*boot.img, *system.img)
├── msm89xx/                    # File target OpenWrt, kernel config, firstboot & LED
├── packages/                   # Modul kustom: luci-theme-proton2025, modem-tools, SMS
├── diffconfigs/uz801           # Konfigurasi paket OpenWrt untuk target UZ801
└── build.sh                    # Script orkestrator build OpenWrt berbasis Docker
```

---

## 📜 Lisensi & Atribusi
Basis proyek ini dibangun di atas [OpenWrt Project](https://openwrt.org/) dan porting Snapdragon MSM8916 oleh komunitas open-source. Seluruh kustomisasi tema dan otomasi sistem dilisensikan di bawah GPL-2.0.
