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

export function detectFrameworkFromFiles(
  fileNames: string[],
  packageJsonStr: string | null,
  composerJsonStr: string | null
): InspectResult {
  const files = new Set(fileNames.map((f) => f.toLowerCase()));

  // 1. Docker
  if (files.has('dockerfile') || files.has('docker-compose.yml') || files.has('docker-compose.yaml')) {
    return {
      detected_engine: 'docker',
      framework: 'Docker',
      build_preset: 'Docker Container',
      suggested_config: {
        root_dir: '/',
        install_command: '',
        build_command: files.has('docker-compose.yml') || files.has('docker-compose.yaml') ? 'docker compose build' : 'docker build -t app .',
        start_command: files.has('docker-compose.yml') || files.has('docker-compose.yaml') ? 'docker compose up -d' : 'docker run -d -p 3000:3000 app',
        internal_port: 3000
      }
    };
  }

  // 2. Node.js (package.json)
  if (packageJsonStr) {
    try {
      const pkg = JSON.parse(packageJsonStr);
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      const scripts = pkg.scripts || {};

      // Next.js
      if (deps['next']) {
        return {
          detected_engine: 'native_node',
          framework: 'Next.js',
          build_preset: 'Next.js',
          suggested_config: {
            root_dir: '/',
            install_command: 'npm ci',
            build_command: scripts.build ? 'npm run build' : 'next build',
            start_command: scripts.start ? 'npm start' : 'next start',
            internal_port: 3000
          }
        };
      }

      // Nuxt
      if (deps['nuxt'] || deps['nuxt3']) {
        return {
          detected_engine: 'native_node',
          framework: 'Nuxt',
          build_preset: 'Nuxt',
          suggested_config: {
            root_dir: '/',
            install_command: 'npm ci',
            build_command: scripts.build ? 'npm run build' : 'nuxt build',
            start_command: 'node .output/server/index.mjs',
            internal_port: 3000
          }
        };
      }

      // Remix
      if (deps['@remix-run/react'] || deps['@remix-run/node']) {
        return {
          detected_engine: 'native_node',
          framework: 'Remix',
          build_preset: 'Remix',
          suggested_config: {
            root_dir: '/',
            install_command: 'npm ci',
            build_command: scripts.build ? 'npm run build' : 'remix build',
            start_command: scripts.start ? 'npm start' : 'remix-serve ./build/server/index.js',
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
            install_command: 'npm ci',
            build_command: scripts.build ? 'npm run build' : 'astro build',
            start_command: scripts.start ? 'npm start' : 'astro preview',
            internal_port: 4321
          }
        };
      }

      // Frontend SPA / Vite
      if ((deps['vite'] || deps['react-scripts'] || deps['@vitejs/plugin-react'] || deps['vue']) && !deps['express'] && !deps['fastify'] && !deps['koa']) {
        return {
          detected_engine: 'native_node',
          framework: 'Frontend (Vite / SPA)',
          build_preset: 'Frontend (SPA)',
          suggested_config: {
            root_dir: '/',
            install_command: 'npm ci',
            build_command: scripts.build ? 'npm run build' : 'vite build',
            start_command: '',
            internal_port: 80
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
            install_command: 'npm ci',
            build_command: scripts.build ? 'npm run build' : '',
            start_command: scripts.start ? 'npm start' : (scripts.dev ? 'npm run dev' : 'node index.js'),
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
          install_command: 'npm ci',
          build_command: scripts.build ? 'npm run build' : '',
          start_command: scripts.start ? 'npm start' : 'node index.js',
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
          internal_port: 80
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
        start_command: files.has('main.py') ? 'python main.py' : files.has('app.py') ? 'python app.py' : 'python -m http.server 8000',
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
      internal_port: 80
    }
  };
}

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

  // Extract all directories for autocomplete suggestions
  const dirSet = new Set<string>();
  dirSet.add('/');

  for (const item of treeItems) {
    if (item.type === 'tree' && typeof item.path === 'string') {
      const p = item.path.trim();
      // Ignore hidden/node_modules/vendor directories
      if (!p.startsWith('.') && !p.includes('/.') && !p.includes('node_modules') && !p.includes('vendor')) {
        dirSet.add(`/${p}`);
      }
    }
  }

  const available_directories = Array.from(dirSet).sort((a, b) => {
    if (a === '/') return -1;
    if (b === '/') return 1;
    return a.localeCompare(b);
  });

  // Filter items in the requested subDir (root or monorepo subfolder)
  const targetPrefix = cleanSubDir ? `${cleanSubDir}/` : '';
  const directFiles: string[] = [];

  for (const item of treeItems) {
    if (typeof item.path !== 'string') continue;
    const p = item.path;

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

  const detected = detectFrameworkFromFiles(directFiles, packageJsonStr, composerJsonStr);
  detected.suggested_config.root_dir = cleanSubDir ? `/${cleanSubDir}` : '/';
  detected.available_directories = available_directories;

  return detected;
}

