# Peran & Hak Akses (RBAC)

Kelola akses multi-pengguna dengan pembagian peran (*roles*) dan pembatasan cakupan server (*server scoping*).

---

## Matriks Peran Bawaan

| Hak Akses | Admin | Operator | Viewer |
| :--- | :---: | :---: | :---: |
| **Kelola Pengguna & Peran** | ✅ Penuh | ❌ Tidak | ❌ Tidak |
| **Tambah / Hapus Server** | ✅ Penuh | ❌ Tidak | ❌ Tidak |
| **Buka Web Terminal** | ✅ Penuh | ✅ Penuh | ❌ Diblokir |
| **Kelola Firewall UFW** | ✅ Penuh | ✅ Penuh | ❌ Diblokir |
| **Start / Stop Kontainer** | ✅ Penuh | ✅ Penuh | ❌ Diblokir |
| **Lihat Metrik & Log** | ✅ Penuh | ✅ Penuh | ✅ Read-only |

---

## Pembatasan Server (Scoping)

Admin dapat membatasi user tertentu agar hanya dapat melihat dan mengoperasikan server spesifik (misal: developer hanya diizinkan mengakses server `staging-api`).

