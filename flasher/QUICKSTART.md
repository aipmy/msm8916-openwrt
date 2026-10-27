# Panduan Cepat Flashing OpenWrt UZ801v3 (ModemRadar)

Firmware ini dikhususkan untuk Qualcomm Snapdragon 410 (MSM8916) USB Modem Dongle **YiMing UZ801 v3 / v3.2** (`yiming,uz801-v3`).

---

## ⚡ Fitur Unggulan Build Ini
* **Linux Kernel 6.12.94 Stable**: Bebas masalah boot loop / stuck red LED (patch CPR/SPM telah disesuaikan).
* **Tema Proton2025 Baked-In**: Tampilan modern dark UI bawaan langsung aktif saat booting pertama.
* **Auto Hotspot Bypass (TTL 64 Default)**: Langsung aktif otomatis untuk bypass pembatasan kuota tethering operator.
* **Radio Signal Gauges Real-Time**: Sinyal SINR/SNR & RSSI akurat di halaman Bandlock dengan fallback native QMI.
* **Web Terminal (ttyd)**: Terminal browser langsung aktif di menu **Services -> Terminal** (auto-login root).
* **Otomasi LED Status**:
  * 🔵 **LED Biru (`blue:wlan`)**: Indikator aktivitas Wi-Fi & LAN (`br-lan`).
  * 🟢 **LED Hijau (`green:wan`)**: Indikator koneksi internet 4G LTE (`wwan0`).
* **Branding Bersih**: Bebas teks bawaan OpenWrt, digantikan dengan identitas **ModemRadar by aipmy**.

---

## 🚀 Langkah Flashing via Mode EDL (Qualcomm HS-USB QDLoader 9008)

### 1. Masuk ke Mode EDL
* Cabut modem dari port USB.
* Buka casing modem, tekan dan tahan **tombol kecil (boot/EDL button)** di PCB (atau hubungkan test point EDL ke ground) sambil mencolokkan modem ke port USB komputer/laptop.
* Lepaskan tombol setelah 2 detik. Pastikan modem terdeteksi sebagai Qualcomm QDLoader 9008 (`lsusb` atau `system_profiler SPUSBDataType`).

### 2. Jalankan Script Flasher
Masuk ke direktori `flasher` di terminal:
```bash
cd flasher
./flash-firmware.sh
```
Pilih opsi firmware **OpenWrt Stable** (`firmware/openwrt-stable`). Script akan secara otomatis mempartisi eMMC dan menulis image `boot.img`, `system.img`, serta partisi firmware modem.

### 3. Selesai & Akses Web UI
* Setelah proses flashing selesai (muncul pesan sukses), cabut dan colokkan kembali modem ke port USB.
* Tunggu sekitar 20-30 detik hingga LED indikator berkedip normal.
* Komputer akan otomatis mendapatkan IP DHCP (`192.168.8.x`).
* Buka browser dan akses:  
  👉 **`http://192.168.8.1`**  
  *(Default username: `root`, tanpa password - langsung klik Log in).*

