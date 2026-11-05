# Browser-Based Web Terminal

7Server features a built-in terminal emulator powered by **xterm.js** and WebSocket streaming directly into an interactive SSH pseudo-terminal (PTY).

---

## Capabilities

- **Interactive TUI Support**: Full support for `htop`, `btop`, `vim`, `nano`, `mc`, and interactive curses dialogs.
- **Dynamic Window Resizing**: Automatically sends `SIGWINCH` window resize signals when resizing browser windows or side drawers.
- **Copy & Paste**: Seamless clipboard integration (supporting keyboard shortcuts and context menus).
- **Session Isolation**: Each terminal session runs in its own dedicated SSH channel and terminates cleanly upon modal close.

---

## RBAC Permission Control

Access to the interactive terminal can be restricted using Role-Based Access Control:

::: warning RBAC Guard
Only accounts granted the `terminal.open` permission (Admin and Operator roles by default) can launch terminal sessions. Users with the **Viewer** role or restricted server scopes are blocked from opening shell sessions to prevent unauthorized command execution.
:::

