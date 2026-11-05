# Sesi Aktif & Audit Log

Pantau siapa saja yang sedang login dan periksa setiap tindakan konfigurasi di server.

---

## Manajemen Sesi Aktif

Pada menu `#/users?tab=sessions`, Anda dapat melihat seluruh sesi yang sedang aktif beserta jenis peramban, sistem operasi, dan alamat IP. Admin dapat mencabut sesi kapan pun dengan tombol **Cabut Sesi**.

---

## Riwayat Audit & Ekspor CSV

Setiap tindakan penting (seperti pembuatan server, restart Docker, penambahan aturan firewall) dicatat secara permanen di database lokal dan dapat diunduh dalam format spreadsheet **`.csv`**.

