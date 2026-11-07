# Firewall Terpusat (UFW) & Pencegahan Lockout SSH

Mengelola firewall multi-server sering kali berisiko memutus koneksi SSH operator secara tidak sengaja. 7Server menyediakan antarmuka UFW terpusat dengan fitur **SSH Lockout Safeguard**.

---

## Fitur Proteksi SSH Lockout

1. **Deteksi Port SSH Aktif**: 7Server secara otomatis mendeteksi port SSH yang sedang digunakan oleh server target.
2. **Blokir Aktivasi Sembrono**: Jika UFW belum aktif, sistem **mencegah** pengaktifan firewall jika belum ada aturan eksplisit `ALLOW` untuk port SSH tersebut.
3. **Peringatan Penghapusan**: Mencoba menghapus aturan port SSH akan memunculkan dialog konfirmasi bahaya dengan peringatan putusnya akses.

