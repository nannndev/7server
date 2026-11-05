# Menghubungkan & Mengelola Server

7Server menyatukan seluruh VPS Anda ke dalam satu tampilan armada (*fleet*) yang rapi.

---

## Menambahkan Server Baru

Buka dashboard dan klik **+ Tambah Server**.

### Parameter Koneksi

- **Nama Server**: Label yang mudah dikenali (misal: `api-sg-01`, `db-staging`).
- **Host / IP**: Alamat IPv4, IPv6, atau hostname server.
- **Port**: Default adalah `22` (port kustom didukung penuh).
- **Username**: Umumnya `root`, `ubuntu`, atau user yang memiliki hak `sudo`.
- **Metode Otentikasi**: Password atau OpenSSH Private Key (RSA / Ed25519).

### Pengujian Koneksi Instan

Sebelum menyimpan data ke vault SQLite, 7Server melakukan verifikasi *pre-flight*:
1. Menguji handshake SSH terenkripsi.
2. Memeriksa arsitektur CPU dan versi OS Linux.
3. Hanya menyimpan jika koneksi terbukti valid.

