# Terminal Web Interaktif

7Server menyediakan emulator terminal berbasis browser yang ditenagai oleh **xterm.js** dan streaming WebSocket ke sesi SSH pseudo-terminal (PTY).

---

## Kemampuan Terminal

- **Mendukung Aplikasi TUI**: Mendukung penuh navigasi `htop`, `btop`, `vim`, `nano`, serta antarmuka interaktif ncurses.
- **Resize Dinamis**: Otomatis mengirim sinyal `SIGWINCH` saat ukuran jendela browser diubah.
- **Isolasi Izin**: Akses terminal dilindungi oleh izin `terminal.open` (pengguna dengan peran *Viewer* dibatasi secara otomatis).

