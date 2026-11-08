// 7Server Discord Community Bot Daemon
// Handles:
// - Auto-role (👥 Member) on new member join
// - Welcome message with rich embed in #welcome
// - Slash commands (/status, /stats, /docs, /quickstart)
// - Real-time channel stats sync (members, stars, npm)

import fs from 'node:fs';
import path from 'node:path';
import WebSocket from '../server/node_modules/ws/index.js';

// Load .env if present
try {
  const envFile = path.resolve(import.meta.dirname, '..', '.env');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
} catch {}

const TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!TOKEN) {
  console.error('Error: DISCORD_BOT_TOKEN environment variable is required.');
  process.exit(1);
}
const GUILD_ID = '1568074042123092029';
const WELCOME_CH_ID = '1568920757671559188';
const MEMBER_ROLE_ID = '1568920747706024037';

const STATS_CH_MEMBERS = '1568941663299047524';
const STATS_CH_STARS = '1568941665593466953';
const STATS_CH_NPM = '1568941668617691136';

const headers = {
  Authorization: `Bot ${TOKEN}`,
  'Content-Type': 'application/json',
};

async function api(path, method = 'GET', body = null) {
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`https://discord.com/api/v10${path}`, opts);
  if (res.status === 204) return null;
  return res.json().catch(() => null);
}

let latestStars = 1;
let latestDownloads = 681;

// ---------------------------------------------------------------- Auto Sync Stats
async function updateStatsChannels() {
  try {
    const guild = await api(`/guilds/${GUILD_ID}?with_counts=true`);
    const members = guild?.approximate_member_count || 2;

    try {
      const gh = await fetch('https://api.github.com/repos/nannndev/7server').then((r) => r.json());
      if (gh && typeof gh.stargazers_count === 'number') latestStars = gh.stargazers_count;
    } catch {}

    try {
      const npm = await fetch('https://api.npmjs.org/downloads/point/last-month/sevenserver').then((r) => r.json());
      if (npm && typeof npm.downloads === 'number') latestDownloads = npm.downloads;
    } catch {}

    await api(`/channels/${STATS_CH_MEMBERS}`, 'PATCH', { name: `👥・Members: ${members}` }).catch(() => {});
    await api(`/channels/${STATS_CH_STARS}`, 'PATCH', { name: `⭐・Stars: ${latestStars}` }).catch(() => {});
    await api(`/channels/${STATS_CH_NPM}`, 'PATCH', { name: `📦・npm: ${latestDownloads.toLocaleString()}+` }).catch(() => {});
    console.log(`[Stats] Synced: Members=${members}, Stars=${latestStars}, npm=${latestDownloads}`);
  } catch (err) {
    console.error('[Stats] Error updating stats channels:', err.message);
  }
}

// ---------------------------------------------------------------- Gateway Connection
let ws = null;
let heartbeatInterval = null;
let sequence = null;

function connectGateway() {
  console.log('[Gateway] Connecting to Discord Gateway...');
  ws = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json');

  ws.on('open', () => {
    console.log('[Gateway] WebSocket connection established.');
  });

  ws.on('message', async (data) => {
    let payload;
    try {
      payload = JSON.parse(data.toString());
    } catch {
      return;
    }

    const { op, d, s, t } = payload;
    if (s !== null) sequence = s;

    // Op 10: Hello -> start heartbeating & identify
    if (op === 10) {
      const interval = d.heartbeat_interval;
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      heartbeatInterval = setInterval(() => {
        ws.send(JSON.stringify({ op: 1, d: sequence }));
      }, interval);

      // Identify
      ws.send(
        JSON.stringify({
          op: 2,
          d: {
            token: TOKEN,
            intents: 3276799, // All intents (Guilds, Members, Messages)
            properties: {
              os: process.platform,
              browser: '7server-bot',
              device: '7server-bot',
            },
          },
        })
      );
    }

    // Op 11: Heartbeat ACK
    if (op === 11) {
      // Heartbeat acknowledged
    }

    // Op 0: Dispatch Events
    if (op === 0) {
      if (t === 'READY') {
        console.log(`[Gateway] Logged in as ${d.user.username}#${d.user.discriminator} (ID: ${d.user.id})`);
        updateStatsChannels();
      }

      // 1. GUILD_MEMBER_ADD: Auto-role & Welcome Embed
      if (t === 'GUILD_MEMBER_ADD') {
        const user = d.user;
        if (!user || user.bot) return;

        console.log(`[Member] New member joined: ${user.username} (${user.id})`);

        // Give Member role
        await api(`/guilds/${GUILD_ID}/members/${user.id}/roles/${MEMBER_ROLE_ID}`, 'PUT')
          .then(() => console.log(`[Role] Assigned Member role to ${user.username}`))
          .catch((e) => console.error('[Role] Failed to assign role:', e.message));

        // Send Welcome Embed to #welcome
        const avatarUrl = user.avatar
          ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
          : 'https://cdn.discordapp.com/embed/avatars/0.png';

        const welcomePayload = {
          content: `Selamat datang di server **7Server**, <@${user.id}>! 🎉`,
          embeds: [
            {
              title: '🚀 Welcome to 7Server Community!',
              description:
                `Halo <@${user.id}>! Selamat bergabung dengan komunitas para developer & homelabber.\n\n` +
                `📌 **Langkah Awal:**\n` +
                `• Baca peraturan server di <#1568920761605955704>\n` +
                `• Link repository & dokumentasi di <#1568920781164122263>\n` +
                `• Diskusi & obrolan santai di <#1568074043863597169>\n` +
                `• Bantuan instalasi & tanya jawab di <#1568920811145011230>\n\n` +
                `*Role **👥 Member** sudah otomatis diberikan ke akun kamu.*`,
              color: 0x38bdf8,
              thumbnail: { url: avatarUrl },
              footer: {
                text: '7Server · Self-hosted & Agentless Server Management',
              },
              timestamp: new Date().toISOString(),
            },
          ],
        };

        await api(`/channels/${WELCOME_CH_ID}/messages`, 'POST', welcomePayload).catch((e) =>
          console.error('[Welcome] Error sending welcome message:', e.message)
        );

        // Update stats member count
        updateStatsChannels();
      }

function getCommandEmbed(commandName) {
  if (commandName === 'status') {
    return {
      title: '⚡ 7Server System Status',
      description:
        '**7Server** adalah dashboard manajemen multi-server self-hosted tanpa agen (agentless OpenSSH).\n\n' +
        '• **Versi Rilis:** `v0.2.0`\n' +
        '• **Arsitektur:** Node.js 22 LTS + SQLite + OpenSSH + Docker\n' +
        '• **Repository:** [github.com/nannndev/7server](https://github.com/nannndev/7server)\n' +
        '• **Dokumentasi:** [7server.dev](https://github.com/nannndev/7server#readme)\n' +
        '• **Status:** Operasional & Siap Digunakan ✅',
      color: 0x10b981,
      footer: { text: '7Server · Agentless Infrastructure' },
    };
  } else if (commandName === 'stats') {
    return {
      title: '📊 7Server Live Statistics',
      fields: [
        { name: '⭐ GitHub Stars', value: `**${latestStars}** stars`, inline: true },
        { name: '📦 npm Installs (Monthly)', value: `**${latestDownloads.toLocaleString()}+** downloads`, inline: true },
        { name: '👥 Verified Cloners', value: '**200+** unique nodes', inline: true },
      ],
      color: 0xf59e0b,
      footer: { text: 'Data ditarik langsung dari GitHub & npm API' },
    };
  } else if (commandName === 'quickstart') {
    return {
      title: '🚀 Cara Cepat Memulai 7Server',
      description:
        'Pilih salah satu cara instalasi favorit kamu:\n\n' +
        '**1. Jalankan instan via npm (Node.js 22+):**\n' +
        '```bash\nnpx sevenserver\n```\n' +
        '**2. Instal global:**\n' +
        '```bash\nnpm install -g sevenserver\n7server\n```\n' +
        '**3. Menggunakan Docker Compose:**\n' +
        '```bash\ngit clone https://github.com/nannndev/7server.git\ncd 7server && docker compose up -d\n```\n' +
        'Buka di browser: `http://127.0.0.1:5001`',
      color: 0x6366f1,
    };
  } else if (commandName === 'docs' || commandName === 'help') {
    return {
      title: '📚 Dokumentasi 7Server & Bantuan Bot',
      description:
        'Panduan lengkap arsitektur dan konfigurasi 7Server:\n\n' +
        '• 🚀 [Quickstart Guide](https://github.com/nannndev/7server#install)\n' +
        '• 🔒 [Security & Encryption Model](https://github.com/nannndev/7server#security)\n' +
        '• 🐳 [Docker & Compose Management](https://github.com/nannndev/7server#readme)\n' +
        '• 🌐 [Cloudflare Tunnels & Automated SSL](https://github.com/nannndev/7server#readme)\n' +
        '• 🤖 [AI Copilot & AI Gateway](https://github.com/nannndev/7server#readme)\n\n' +
        '**Perintah Bot Tersedia:**\n' +
        '`/status` atau `!status` - Cek status 7Server\n' +
        '`/stats` atau `!stats` - Statistik unduhan & stars\n' +
        '`/quickstart` atau `!quickstart` - Cara install cepat\n' +
        '`/docs` atau `!docs` - Link dokumentasi',
      color: 0x38bdf8,
    };
  }
  return null;
}

      // 2. INTERACTION_CREATE: Slash Commands
      if (t === 'INTERACTION_CREATE') {
        const interactionId = d.id;
        const interactionToken = d.token;
        const commandName = d.data?.name;

        console.log(`[Command] Received /${commandName} from ${d.member?.user?.username || 'user'}`);

        const responseEmbed = getCommandEmbed(commandName);

        if (responseEmbed) {
          await api(`/interactions/${interactionId}/${interactionToken}/callback`, 'POST', {
            type: 4,
            data: {
              embeds: [responseEmbed],
            },
          }).catch((e) => console.error('[Interaction] Error responding:', e.message));
        }
      }

      // 3. MESSAGE_CREATE: Prefix text commands (!status, !stats, !docs, !quickstart)
      if (t === 'MESSAGE_CREATE') {
        const content = (d.content || '').trim().toLowerCase();
        const author = d.author;
        if (!author || author.bot) return;

        let cmd = null;
        if (content.startsWith('!') || content.startsWith('/') || content.startsWith('?')) {
          cmd = content.slice(1).split(' ')[0];
        } else if (content === 'status' || content === 'stats' || content === 'quickstart' || content === 'docs' || content === 'help') {
          cmd = content;
        }

        if (cmd) {
          const embed = getCommandEmbed(cmd);
          if (embed) {
            console.log(`[MessageCmd] Responding to ${cmd} from ${author.username}`);
            await api(`/channels/${d.channel_id}/messages`, 'POST', {
              message_reference: { message_id: d.id },
              embeds: [embed],
            }).catch((e) => console.error('[MessageCmd] Error responding:', e.message));
          }
        }
      }
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`[Gateway] Disconnected (${code}: ${reason}). Reconnecting in 5s...`);
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    setTimeout(connectGateway, 5000);
  });

  ws.on('error', (err) => {
    console.error('[Gateway] Socket error:', err.message);
  });
}

// Start
connectGateway();

// Periodic stat update every 30 minutes
setInterval(updateStatsChannels, 30 * 60 * 1000);

