# Arsitektur & Model Keamanan

7Server dirancang dengan prinsip *zero-trust containment*, penyimpanan kredensial lokal terisolasi, dan orkestrasi *agentless* melalui SSH.

---

## 1. Tanpa Daemon di Server Target

Tidak seperti panel konvensional yang mewajibkan instalasi binary dengan hak akses `root`, 7Server hanya berkomunikasi melalui sesi SSH standar:

- **Pengambilan Metrik**: Membaca `/proc/meminfo`, `/proc/stat`, `df`, dan `uptime` melalui pipeline shell POSIX ringan tanpa meninggalkan beban memori di VPS target.
- **Pembersihan Bersih**: Saat server dihapus dari dashboard, tidak ada sisa file atau background service yang tertinggal di VPS target.

---

## 2. Vault Enkripsi AES-256-GCM

Semua data sensitif dienkripsi sebelum ditulis ke penyimpanan:

- **Password & Private Key SSH**: Dienkripsi menggunakan **AES-256-GCM** dengan tag otentikasi untuk mencegah manipulasi data.
- **Kunci Master**: Disimpan pada file `server/data/.secret_key` dengan izin ketat (`chmod 600`).

