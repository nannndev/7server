# Quick Start Guide

Get 7Server up and running on your local machine or dedicated management node in less than two minutes.

::: tip Prerequisites
- **Node.js 20+** or **22+**
- **npm** or **pnpm**
- SSH access (`user`, `host`, and password or private key) to at least one Linux VPS.
:::

---

## 1. Clone & Install

Clone the repository and install dependencies for the backend and frontend:

```bash
git clone https://github.com/nannndev/7server.git
cd 7server

# Install backend dependencies
cd server && npm install

# Install frontend dependencies
cd ../client && npm install
```

---

## 2. Launch the Application

From the project root directory, run:

```bash
npm run dev
# Or start with landing page & docs:
node start.js --all
```

The process launches:
- **Backend API & SSH Engine**: `http://localhost:5001`
- **Dashboard UI**: `http://localhost:3000`
- **AI Gateway & Copilot Server**: `http://localhost:5001/v1`

---

## 3. Initial Login & Password

When running for the first time, 7Server automatically provisions the SQLite database (`server/data/7server.db`) and generates a secure initial administrator password:

```bash
# View your auto-generated admin password:
cat server/data/dashboard.password
```

Open your browser to [http://localhost:3000](http://localhost:3000):
- **Username**: `admin`
- **Password**: *(The string found in `server/data/dashboard.password`)*

::: info Customizing Initial Password
You can override the initial administrator password by exporting `DASHBOARD_PASSWORD` in your environment before startup:
```bash
export DASHBOARD_PASSWORD="YourStrongCustomPasswordHere"
npm run dev
```
:::

---

## 4. Add Your First Server

1. Click **+ Add Server** in the top navigation bar.
2. Enter your server connection details:
   - **Label / Name**: e.g. `Production Web 01`
   - **Host / IP**: `192.168.1.100` or `vps.yourdomain.com`
   - **Port**: `22` (default)
   - **Username**: `root` or a `sudo`-capable user
   - **Authentication**: Password or upload an OpenSSH Private Key (RSA / Ed25519).
3. Click **Test Connection**. 7Server verifies SSH handshake and latency immediately before saving.
4. Click **Save Server**. 7Server encrypts the credentials into its AES-256-GCM vault and starts streaming real-time telemetry!

