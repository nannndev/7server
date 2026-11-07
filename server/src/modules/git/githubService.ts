import type { NormalizedRepo, InspectResult, DetectedEngine, SuggestedConfig } from './types.js';
import { getOAuthConfig } from './store.js';

const GITHUB_API_BASE = 'https://api.github.com';
const USER_AGENT = '7Server-Panel';

function ghHeaders(accessToken?: string, accept = 'application/vnd.github.v3+json'): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    Accept: accept
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return headers;
}

export function getGitHubAuthorizeUrl(redirectUri: string, state: string): string {
  const { githubClientId } = getOAuthConfig();
  if (!githubClientId) {
    throw new Error('GitHub Client ID belum dikonfigurasi. Atur di file server/.env atau Settings panel.');
  }
  const scopes = ['repo', 'read:user', 'admin:repo_hook'].join(',');
  const params = new URLSearchParams({
    client_id: githubClientId,
    redirect_uri: redirectUri,
    scope: scopes,
    state
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeGitHubCode(code: string, redirectUri: string): Promise<{
  access_token: string;
  scope?: string;
  token_type?: string;
}> {
  const { githubClientId, githubClientSecret } = getOAuthConfig();
  if (!githubClientId || !githubClientSecret) {
    throw new Error('GitHub Client ID atau Secret belum dikonfigurasi.');
  }

  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': USER_AGENT
    },
    body: JSON.stringify({
      client_id: githubClientId,
      client_secret: githubClientSecret,
      code,
      redirect_uri: redirectUri
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gagal menukar kode GitHub OAuth: ${res.status} ${errText}`);
  }

  const data = (await res.json()) as any;
  if (data.error) {
    throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`);
  }

  return data;
}

export async function fetchGitHubUserProfile(accessToken: string): Promise<{
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
}> {
  const res = await fetch(`${GITHUB_API_BASE}/user`, {
    headers: ghHeaders(accessToken)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gagal mengambil profil GitHub: ${res.status} ${errText}`);
  }

  return (await res.json()) as any;
}

export async function fetchGitHubRepos(
  accessToken: string,
  options?: {
    page?: number;
    per_page?: number;
    search?: string;
    type?: 'all' | 'owner' | 'public' | 'private';
  }
): Promise<NormalizedRepo[]> {
  const page = options?.page || 1;
  const perPage = Math.min(Math.max(options?.per_page || 100, 1), 100);
  const type = options?.type || 'all';

  const url = `${GITHUB_API_BASE}/user/repos?sort=updated&per_page=${perPage}&page=${page}&type=${type}`;
  const res = await fetch(url, {
    headers: ghHeaders(accessToken)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gagal mengambil repositori GitHub: ${res.status} ${errText}`);
  }

  const repos = (await res.json()) as any[];
  let list: NormalizedRepo[] = repos.map((r) => ({
    id: r.id,
    name: r.name,
    full_name: r.full_name,
    private: Boolean(r.private),
    html_url: r.html_url,
    clone_url: r.clone_url,
    default_branch: r.default_branch || 'main',
    updated_at: r.updated_at,
    language: r.language || null,
    description: r.description || null,
    owner: r.owner
      ? {
          login: r.owner.login,
          avatar_url: r.owner.avatar_url,
          type: r.owner.type
        }
      : {
          login: r.full_name.split('/')[0]
        }
  }));

  if (options?.search) {
    const q = options.search.trim().toLowerCase();
    list = list.filter((r) =>
      r.name.toLowerCase().includes(q) ||
      r.full_name.toLowerCase().includes(q) ||
      (r.description && r.description.toLowerCase().includes(q))
    );
  }

  return list;
}

export async function fetchGitHubBranches(accessToken: string, owner: string, repo: string): Promise<string[]> {
  const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100`;
  const res = await fetch(url, {
    headers: ghHeaders(accessToken)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gagal mengambil branch repositori ${owner}/${repo}: ${res.status} ${errText}`);
  }

  const branches = (await res.json()) as any[];
  return branches.map((b) => b.name);
}

export async function fetchRawFileContent(
  accessToken: string,
  owner: string,
  repo: string,
  path: string,
  branch: string
): Promise<string | null> {
  const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, {
    headers: ghHeaders(accessToken, 'application/vnd.github.raw+json')
  });

  if (!res.ok) {
    return null;
  }

  return await res.text();
}

/**
 * Host ports a compose file publishes ("3000:3000", "127.0.0.1:8080:80", "- 8080") and whether any service builds
 * from this repo. shortcut: line-based, not a YAML parser; long-form `published:` ports and anchors are ignored.
 */
export function readCompose(yaml: string | null): { ports: number[]; builds: boolean } {
  if (!yaml) return { ports: [], builds: false };
  const ports: number[] = [];
  // "- [ip:]host[:container][/proto]" or "- ${PORT:-3000}:3000": with a container part, the host port is the one before it.
  for (const m of yaml.matchAll(/^\s*-\s*["']?((?:\d{1,3}(?:\.\d{1,3}){3}:)?(?:\$\{[^:}]+:-(\d+)\}|[\d]+)(?::[\d$a-zA-Z_{}:-]+)?)(?:\/(?:tcp|udp))?["']?\s*$/gm)) {
    if (m[2]) {
      const envDef = Number(m[2]);
      if (envDef >= 1 && envDef <= 65535) ports.push(envDef);
      continue;
    }
    const parts = m[1].replace(/^\d{1,3}(?:\.\d{1,3}){3}:/, '').split(':').filter(Boolean);
    const host = Number(parts[0]);
    if (parts.length <= 2 && host >= 1 && host <= 65535) ports.push(host);
  }
  return { ports, builds: /^\s*build\s*:/m.test(yaml) };
}

export function readDockerfilePort(dockerfile: string | null): number | undefined {
  if (!dockerfile) return undefined;
  const ports: number[] = [];
  for (const m of dockerfile.matchAll(/^\s*EXPOSE\s+(.+)$/gim)) {
    for (const tok of m[1].trim().split(/\s+/)) {
      const p = parseInt(tok.replace(/\/(tcp|udp)$/i, ''), 10);
      if (p >= 1 && p <= 65535) ports.push(p);
    }
  }
  return ports.find((p) => ![5432, 3306, 6379, 27017].includes(p)) ?? ports[0];
}

export function detectFrameworkFromFiles(
  fileNames: string[],
  packageJsonStr: string | null,
  composerJsonStr: string | null,
  composeStr: string | null = null,
  dockerfileStr: string | null = null,
  rootFileNames: string[] = []
): InspectResult {
  const files = new Set(fileNames.map((f) => f.toLowerCase()));
  const rootFiles = new Set(rootFileNames.map((f) => f.toLowerCase()));
  const hasFile = (name: string) => files.has(name) || rootFiles.has(name);
  const compose = readCompose(composeStr);
  // A compose file that only runs services (postgres, redis) next to a Node/PHP app is a sidecar, not the app.
  const sidecarOnly = !!composeStr && !compose.builds && !files.has('dockerfile') && !!(packageJsonStr || composerJsonStr);

  // 1. Docker
  if (!sidecarOnly && (files.has('dockerfile') || files.has('docker-compose.yml') || files.has('docker-compose.yaml') || files.has('compose.yml') || files.has('compose.yaml'))) {
    const exposed = readDockerfilePort(dockerfileStr);
    const rawPort = compose.ports.find((p) => ![5432, 3306, 6379, 27017].includes(p)) ?? exposed ?? 3000;
    const appPort = rawPort === 80 || rawPort === 443 ? 3000 : rawPort;
    return {
      detected_engine: 'docker',
      framework: 'Docker',
      build_preset: 'Docker Container',
      suggested_config: {
        root_dir: '/',
        install_command: '',
        build_command: files.has('docker-compose.yml') || files.has('docker-compose.yaml') || files.has('compose.yml') || files.has('compose.yaml') ? 'docker compose build' : 'docker build -t app .',
        start_command: files.has('docker-compose.yml') || files.has('docker-compose.yaml') || files.has('compose.yml') || files.has('compose.yaml') ? 'docker compose up -d' : 'docker run -d -p $PORT:$PORT app',
        internal_port: appPort
      }
    };
  }

  // 2. Node.js (package.json)
  if (packageJsonStr) {
    try {
      const pkg = JSON.parse(packageJsonStr);
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      const scripts = pkg.scripts || {};
      const pmField = typeof pkg.packageManager === 'string' ? pkg.packageManager.toLowerCase() : '';

      let installCmd = 'npm ci';
      let runCmd = 'npm run';
      let startDefault = 'npm start';
      if (hasFile('pnpm-lock.yaml') || hasFile('pnpm-workspace.yaml') || pmField.startsWith('pnpm')) {
        installCmd = 'pnpm install';
        runCmd = 'pnpm run';
        startDefault = 'pnpm start';
      } else if (hasFile('yarn.lock') || pmField.startsWith('yarn')) {
        installCmd = 'yarn install';
        runCmd = 'yarn';
        startDefault = 'yarn start';
      } else if (hasFile('bun.lockb') || hasFile('bun.lock') || pmField.startsWith('bun')) {
        installCmd = 'bun install';
        runCmd = 'bun run';
        startDefault = 'bun start';
      }

      // Next.js
      if (deps['next'] || files.has('next.config.js') || files.has('next.config.mjs') || files.has('next.config.ts')) {
        return {
          detected_engine: 'native_node',
          framework: 'Next.js',
          build_preset: 'Next.js',
          suggested_config: {
            root_dir: '/',
            install_command: installCmd,
            build_command: scripts.build ? `${runCmd} build` : 'next build',
            start_command: scripts.start ? startDefault : 'next start',
            internal_port: 3000
          }
        };
      }

      // Nuxt
      if (deps['nuxt'] || deps['nuxt3'] || files.has('nuxt.config.ts') || files.has('nuxt.config.js')) {
        return {
          detected_engine: 'native_node',
          framework: 'Nuxt',
          build_preset: 'Nuxt',
          suggested_config: {
            root_dir: '/',
            install_command: installCmd,
            build_command: scripts.build ? `${runCmd} build` : 'nuxt build',
            start_command: 'node .output/server/index.mjs',
            internal_port: 3000
          }
        };
      }

      // SvelteKit
      if (deps['@sveltejs/kit']) {
        return {
          detected_engine: 'native_node',
          framework: 'SvelteKit',
          build_preset: 'SvelteKit',
          suggested_config: {
            root_dir: '/',
            install_command: installCmd,
            build_command: scripts.build ? `${runCmd} build` : 'vite build',
            start_command: scripts.start ? startDefault : 'node build',
            internal_port: 3000
          }
        };
      }

      // Remix
      if (deps['@remix-run/react'] || deps['@remix-run/node'] || deps['@react-router/node']) {
        return {
          detected_engine: 'native_node',
          framework: 'Remix',
          build_preset: 'Remix',
          suggested_config: {
            root_dir: '/',
            install_command: installCmd,
            build_command: scripts.build ? `${runCmd} build` : 'remix build',
            start_command: scripts.start ? startDefault : 'remix-serve ./build/server/index.js',
            internal_port: 3000
          }
        };
      }

      // Astro
      if (deps['astro']) {
        return {
          detected_engine: 'native_node',
          framework: 'Astro',
          build_preset: 'Astro',
          suggested_config: {
            root_dir: '/',
            install_command: installCmd,
            build_command: scripts.build ? `${runCmd} build` : 'astro build',
            start_command: scripts.start ? startDefault : 'astro preview --host 0.0.0.0 --port $PORT',
            internal_port: 4321
          }
        };
      }

      // Frontend SPA / Vite
      if ((deps['vite'] || deps['react-scripts'] || deps['@vitejs/plugin-react'] || deps['vue']) && !deps['express'] && !deps['fastify'] && !deps['koa'] && !deps['@nestjs/core'] && !deps['hono']) {
        return {
          detected_engine: 'static',
          framework: 'Frontend (Vite / SPA)',
          build_preset: 'Frontend (SPA)',
          suggested_config: {
            root_dir: '/',
            install_command: installCmd,
            build_command: scripts.build ? `${runCmd} build` : 'vite build',
            start_command: '',
            internal_port: 3000
          }
        };
      }

      // Node.js API (Express, Fastify, NestJS, Hono, Koa)
      if (deps['express'] || deps['fastify'] || deps['@nestjs/core'] || deps['hono'] || deps['koa']) {
        const framework = deps['@nestjs/core'] ? 'NestJS' : deps['fastify'] ? 'Fastify' : deps['hono'] ? 'Hono' : 'Express / Node.js API';
        return {
          detected_engine: 'native_node',
          framework,
          build_preset: 'Node.js API',
          suggested_config: {
            root_dir: '/',
            install_command: installCmd,
            build_command: scripts.build ? `${runCmd} build` : '',
            start_command: scripts.start ? startDefault : (scripts.dev ? `${runCmd} dev` : 'node index.js'),
            internal_port: 3001
          }
        };
      }

      // Generic Node.js
      return {
        detected_engine: 'native_node',
        framework: 'Node.js',
        build_preset: 'Node.js Application',
        suggested_config: {
          root_dir: '/',
          install_command: installCmd,
          build_command: scripts.build ? `${runCmd} build` : '',
          start_command: scripts.start ? startDefault : 'node index.js',
          internal_port: 3000
        }
      };
    } catch {
      // JSON parse error, fallback
    }
  }

  // 3. PHP (composer.json)
  if (composerJsonStr) {
    try {
      const comp = JSON.parse(composerJsonStr);
      const req = comp.require || {};
      if (req['laravel/framework']) {
        return {
          detected_engine: 'native_php',
          framework: 'Laravel',
          build_preset: 'Laravel',
          suggested_config: {
            root_dir: '/public',
            install_command: 'composer install --no-dev --optimize-autoloader',
            build_command: 'php artisan optimize',
            start_command: '',
            internal_port: 8000
          }
        };
      }
      return {
        detected_engine: 'native_php',
        framework: 'PHP Application',
        build_preset: 'PHP Application',
        suggested_config: {
          root_dir: '/',
          install_command: 'composer install --no-dev',
          build_command: '',
          start_command: '',
          internal_port: 8000
        }
      };
    } catch {
      // parse error
    }
  }

  // 4. Python
  if (files.has('requirements.txt') || files.has('pipfile') || files.has('pyproject.toml') || files.has('main.py') || files.has('app.py')) {
    return {
      detected_engine: 'native_python',
      framework: 'Python (FastAPI / Django / Flask)',
      build_preset: 'Python Application',
      suggested_config: {
        root_dir: '/',
        install_command: files.has('requirements.txt') ? 'pip install -r requirements.txt' : 'pip install -e .',
        build_command: '',
        start_command: files.has('main.py') ? 'python main.py' : files.has('app.py') ? 'python app.py' : 'python -m http.server $PORT',
        internal_port: 8000
      }
    };
  }

  // 5. Go
  if (files.has('go.mod')) {
    return {
      detected_engine: 'native_go',
      framework: 'Go',
      build_preset: 'Go Application',
      suggested_config: {
        root_dir: '/',
        install_command: 'go mod download',
        build_command: 'go build -o app',
        start_command: './app',
        internal_port: 8080
      }
    };
  }

  // Default fallback
  return {
    detected_engine: 'static',
    framework: 'Static Web',
    build_preset: 'Static HTML / Web',
    suggested_config: {
      root_dir: '/',
      install_command: '',
      build_command: '',
      start_command: '',
      internal_port: 3000
    }
  };
}

const MANIFEST_FILES = new Set([
  'package.json',
  'composer.json',
  'dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
  'requirements.txt',
  'pyproject.toml',
  'pipfile',
  'go.mod',
  'cargo.toml'
]);

export async function inspectGitHubRepo(
  accessToken: string,
  owner: string,
  repo: string,
  branch: string,
  subDir = '/'
): Promise<InspectResult> {
  const cleanSubDir = subDir.trim().replace(/^\/+|\/+$/g, '');
  const recursiveUrl = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
  const res = await fetch(recursiveUrl, {
    headers: ghHeaders(accessToken)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gagal membaca file repository ${owner}/${repo} pada branch ${branch}: ${res.status} ${errText}`);
  }

  const data = (await res.json()) as any;
  const treeItems: any[] = data.tree || [];

  // Extract all directories and identify deployable project roots (for monorepos)
  const dirSet = new Set<string>();
  const projectRootSet = new Set<string>();
  dirSet.add('/');

  for (const item of treeItems) {
    if (typeof item.path !== 'string') continue;
    const p = item.path.trim();
    if (p.startsWith('.') || p.includes('/.') || p.includes('node_modules') || p.includes('vendor') || p.includes('/dist/') || p.includes('/build/')) {
      continue;
    }
    if (item.type === 'tree') {
      dirSet.add(`/${p}`);
    } else if (item.type === 'blob') {
      const slashIdx = p.lastIndexOf('/');
      const fileName = (slashIdx === -1 ? p : p.slice(slashIdx + 1)).toLowerCase();
      const folder = slashIdx === -1 ? '/' : `/${p.slice(0, slashIdx)}`;
      if (MANIFEST_FILES.has(fileName)) {
        projectRootSet.add(folder);
      }
    }
  }

  const project_roots = Array.from(projectRootSet).sort((a, b) => {
    if (a === '/') return -1;
    if (b === '/') return 1;
    return a.localeCompare(b);
  });

  const available_directories = Array.from(dirSet).sort((a, b) => {
    if (a === '/') return -1;
    if (b === '/') return 1;
    const aIsRoot = projectRootSet.has(a);
    const bIsRoot = projectRootSet.has(b);
    if (aIsRoot && !bIsRoot) return -1;
    if (!aIsRoot && bIsRoot) return 1;
    return a.localeCompare(b);
  });

  // Filter items in the requested subDir (root or monorepo subfolder) and also collect root-level files
  const targetPrefix = cleanSubDir ? `${cleanSubDir}/` : '';
  const directFiles: string[] = [];
  const rootFiles: string[] = [];

  for (const item of treeItems) {
    if (typeof item.path !== 'string') continue;
    const p = item.path;

    if (!p.includes('/')) {
      rootFiles.push(p);
    }

    if (!cleanSubDir) {
      if (!p.includes('/')) {
        directFiles.push(p);
      }
    } else {
      if (p.startsWith(targetPrefix)) {
        const rel = p.slice(targetPrefix.length);
        if (!rel.includes('/')) {
          directFiles.push(rel);
        }
      }
    }
  }

  const pkgPath = cleanSubDir ? `${cleanSubDir}/package.json` : 'package.json';
  let packageJsonStr: string | null = null;
  if (directFiles.some((f) => f.toLowerCase() === 'package.json')) {
    packageJsonStr = await fetchRawFileContent(accessToken, owner, repo, pkgPath, branch);
  }

  const compPath = cleanSubDir ? `${cleanSubDir}/composer.json` : 'composer.json';
  let composerJsonStr: string | null = null;
  if (directFiles.some((f) => f.toLowerCase() === 'composer.json')) {
    composerJsonStr = await fetchRawFileContent(accessToken, owner, repo, compPath, branch);
  }

  const composeFile = directFiles.find((f) => /^(docker-)?compose\.ya?ml$/i.test(f));
  const composeStr = composeFile
    ? await fetchRawFileContent(accessToken, owner, repo, cleanSubDir ? `${cleanSubDir}/${composeFile}` : composeFile, branch)
    : null;

  const dockerFile = directFiles.find((f) => f.toLowerCase() === 'dockerfile');
  const dockerfileStr = dockerFile
    ? await fetchRawFileContent(accessToken, owner, repo, cleanSubDir ? `${cleanSubDir}/${dockerFile}` : dockerFile, branch)
    : null;

  const detected = detectFrameworkFromFiles(directFiles, packageJsonStr, composerJsonStr, composeStr, dockerfileStr, rootFiles);
  if (composeStr && detected.detected_engine !== 'docker') detected.compose_sidecar = true;
  const nvmFile = directFiles.find((f) => f === '.nvmrc' || f === '.node-version') || rootFiles.find((f) => f === '.nvmrc' || f === '.node-version');
  const nvmPath = nvmFile
    ? (directFiles.includes(nvmFile) && cleanSubDir ? `${cleanSubDir}/${nvmFile}` : nvmFile)
    : null;
  const nvmStr = nvmPath ? await fetchRawFileContent(accessToken, owner, repo, nvmPath, branch) : null;
  let engines: unknown;
  try { engines = packageJsonStr ? JSON.parse(packageJsonStr)?.engines?.node : undefined; } catch { /* detect already handled bad JSON */ }
  detected.node_version = minNodeMajor(typeof engines === 'string' ? engines : nvmStr);
  detected.suggested_config.root_dir = cleanSubDir ? `/${cleanSubDir}` : '/';
  detected.available_directories = available_directories;
  detected.project_roots = project_roots;

  const envExampleFile = directFiles.find((f) => /^\.env\.(example|sample|template)$/i.test(f));
  if (envExampleFile) {
    const raw = await fetchRawFileContent(accessToken, owner, repo, cleanSubDir ? `${cleanSubDir}/${envExampleFile}` : envExampleFile, branch);
    if (raw) {
      const vars: Array<{ key: string; value: string }> = [];
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const k = trimmed.substring(0, eqIdx).trim();
          let v = trimmed.substring(eqIdx + 1).trim();
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
          }
          if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) {
            vars.push({ key: k, value: v });
          }
        }
      }
      if (vars.length > 0) {
        detected.suggested_env = vars;
      }
    }
  }

  return detected;
}


/** "^22.11.0 || >=24" -> 22, ">=18" -> 18, "v20.10" -> 20, "lts/*" -> undefined. Lowest major any range allows. */
export function minNodeMajor(spec: string | null | undefined): number | undefined {
  const majors = [...String(spec || '').matchAll(/(?:^|[\s|^~>=v])(\d{1,2})(?=[.\sx*]|$)/g)].map((m) => Number(m[1])).filter((n) => n >= 4);
  return majors.length ? Math.min(...majors) : undefined;
}
