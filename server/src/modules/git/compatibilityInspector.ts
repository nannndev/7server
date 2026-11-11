import type {
  CompatibilityIssue,
  CompatibilityReport,
  RuntimeVersionInfo,
  StackLanguage
} from './types.js';

interface AnalyzeParams {
  directFiles: string[];
  packageJsonStr?: string | null;
  composerJsonStr?: string | null;
  goModStr?: string | null;
  pyprojectStr?: string | null;
  requirementsStr?: string | null;
  runtimeTxtStr?: string | null;
  pomXmlStr?: string | null;
  buildGradleStr?: string | null;
  cargoTomlStr?: string | null;
  dockerfileStr?: string | null;
  composeStr?: string | null;
  nvmStr?: string | null;
}

/**
 * Universal Pre-Flight Compatibility Inspector for 7Server.
 * Analyzes repository manifests across PHP, Go, Node.js, Python, Java, and Rust,
 * comparing required language/runtime versions against provided Dockerfile base images
 * and validating network binding, C-dependencies, and build configurations.
 */
export function analyzeCompatibility(params: AnalyzeParams): CompatibilityReport {
  const issues: CompatibilityIssue[] = [];
  const recommendations: string[] = [];
  let runtime: RuntimeVersionInfo | undefined;

  const files = new Set((params.directFiles || []).map((f) => f.toLowerCase()));
  const dockerfile = params.dockerfileStr || null;

  // 1. PHP / Composer Analysis
  if (params.composerJsonStr || files.has('composer.json')) {
    const phpReport = inspectPhpCompatibility(params.composerJsonStr, dockerfile);
    issues.push(...phpReport.issues);
    recommendations.push(...phpReport.recommendations);
    if (phpReport.runtime) runtime = phpReport.runtime;
  }

  // 2. Go (go.mod) Analysis
  if (params.goModStr || files.has('go.mod')) {
    const goReport = inspectGoCompatibility(params.goModStr, dockerfile);
    issues.push(...goReport.issues);
    recommendations.push(...goReport.recommendations);
    if (!runtime || runtime.language === 'generic') runtime = goReport.runtime;
  }

  // 3. Node.js (package.json / .nvmrc) Analysis
  if (params.packageJsonStr || files.has('package.json')) {
    const nodeReport = inspectNodeCompatibility(params.packageJsonStr, dockerfile, params.nvmStr);
    issues.push(...nodeReport.issues);
    recommendations.push(...nodeReport.recommendations);
    if (!runtime || runtime.language === 'generic') runtime = nodeReport.runtime;
  }

  // 4. Python Analysis
  if (params.pyprojectStr || params.requirementsStr || params.runtimeTxtStr || files.has('requirements.txt') || files.has('pyproject.toml')) {
    const pyReport = inspectPythonCompatibility(params.pyprojectStr, params.requirementsStr, params.runtimeTxtStr, dockerfile);
    issues.push(...pyReport.issues);
    recommendations.push(...pyReport.recommendations);
    if (!runtime || runtime.language === 'generic') runtime = pyReport.runtime;
  }

  // 5. Java / JVM Analysis
  if (params.pomXmlStr || params.buildGradleStr || files.has('pom.xml') || files.has('build.gradle')) {
    const javaReport = inspectJavaCompatibility(params.pomXmlStr, params.buildGradleStr, dockerfile);
    issues.push(...javaReport.issues);
    recommendations.push(...javaReport.recommendations);
    if (!runtime || runtime.language === 'generic') runtime = javaReport.runtime;
  }

  // 6. Rust Analysis
  if (params.cargoTomlStr || files.has('cargo.toml')) {
    const rustReport = inspectRustCompatibility(params.cargoTomlStr, dockerfile);
    issues.push(...rustReport.issues);
    recommendations.push(...rustReport.recommendations);
    if (!runtime || runtime.language === 'generic') runtime = rustReport.runtime;
  }

  // 7. General Docker Best-Practice Checks
  if (dockerfile) {
    const dockerIssues = inspectGeneralDocker(dockerfile);
    issues.push(...dockerIssues.issues);
    recommendations.push(...dockerIssues.recommendations);
  }

  const hasErrors = issues.some((i) => i.severity === 'error');
  const hasWarnings = issues.some((i) => i.severity === 'warning');
  const score = hasErrors ? 'incompatible' : hasWarnings ? 'warning' : 'ok';

  return {
    is_compatible: !hasErrors,
    score,
    runtime,
    issues,
    recommendations: Array.from(new Set(recommendations))
  };
}

// ==========================================
// 1. PHP / Composer Compatibility
// ==========================================
function inspectPhpCompatibility(
  composerJsonStr: string | null | undefined,
  dockerfile: string | null
): { issues: CompatibilityIssue[]; recommendations: string[]; runtime?: RuntimeVersionInfo } {
  const issues: CompatibilityIssue[] = [];
  const recommendations: string[] = [];

  let requiredPhp = '';
  let isLaravel12 = false;
  let isLaravel11 = false;
  let isLaravel10 = false;
  let hasPestOrPhpunit12 = false;

  if (composerJsonStr) {
    try {
      const comp = JSON.parse(composerJsonStr);
      const req = { ...(comp.require || {}) };
      const reqDev = { ...(comp.requireDev || comp['require-dev'] || {}) };

      if (req.php) requiredPhp = String(req.php).trim();
      else if (reqDev.php) requiredPhp = String(reqDev.php).trim();

      const laravelVer = String(req['laravel/framework'] || '');
      if (laravelVer.includes('12.') || laravelVer.includes('^12')) isLaravel12 = true;
      else if (laravelVer.includes('11.') || laravelVer.includes('^11')) isLaravel11 = true;
      else if (laravelVer.includes('10.') || laravelVer.includes('^10')) isLaravel10 = true;

      const pestVer = String(reqDev['pestphp/pest'] || '');
      const phpunitVer = String(reqDev['phpunit/phpunit'] || '');
      if (pestVer.includes('^4') || pestVer.includes('4.') || phpunitVer.includes('^12') || phpunitVer.includes('12.')) {
        hasPestOrPhpunit12 = true;
      }
    } catch {
      // JSON parse error handled gracefully
    }
  }

  // Infer min required version
  let minPhpMajorMinor = '8.1';
  if (isLaravel12 || hasPestOrPhpunit12 || requiredPhp.includes('8.3') || requiredPhp.includes('>=8.3') || requiredPhp.includes('^8.3')) {
    minPhpMajorMinor = '8.3';
  } else if (isLaravel11 || requiredPhp.includes('8.2') || requiredPhp.includes('>=8.2') || requiredPhp.includes('^8.2')) {
    minPhpMajorMinor = '8.2';
  } else if (isLaravel10 || requiredPhp.includes('8.1') || requiredPhp.includes('>=8.1') || requiredPhp.includes('^8.1')) {
    minPhpMajorMinor = '8.1';
  }

  let providedPhp: string | undefined;
  let dockerfileImage: string | undefined;

  if (dockerfile) {
    const m = dockerfile.match(/FROM\s+(?:--platform=[^\s]+\s+)?(?:[a-zA-Z0-9_.\-\/]+\/)?php:([0-9]+\.[0-9]+)/i);
    if (m) {
      providedPhp = m[1];
      const lineMatch = dockerfile.match(/FROM\s+(?:--platform=[^\s]+\s+)?([^\s]+)/i);
      dockerfileImage = lineMatch ? lineMatch[1] : `php:${providedPhp}`;
    }
  }

  const runtime: RuntimeVersionInfo = {
    language: 'php',
    required_version: requiredPhp || `>=${minPhpMajorMinor}`,
    provided_version: providedPhp,
    source_file: 'composer.json',
    dockerfile_image: dockerfileImage
  };

  if (dockerfile && providedPhp) {
    const requiredNum = parseFloat(minPhpMajorMinor);
    const providedNum = parseFloat(providedPhp);

    if (providedNum < requiredNum) {
      issues.push({
        severity: 'error',
        category: 'runtime_mismatch',
        title: 'PHP Version Incompatibility',
        message: `composer.json / dependensi kamu membutuhkan PHP >= ${minPhpMajorMinor}, tetapi Dockerfile mengunci base image pada PHP ${providedPhp}. Composer install akan gagal validasi platform requirements!`,
        suggested_fix: `Ubah baris base image Dockerfile menjadi: FROM php:${minPhpMajorMinor}-fpm-alpine`,
        auto_fixable: true,
        file: 'Dockerfile'
      });
    }

    // Check if composer install is present without --ignore-platform-reqs
    const hasComposerInstall = /composer\s+install/i.test(dockerfile);
    const hasIgnorePlatform = /--ignore-platform-req/i.test(dockerfile);
    if (hasComposerInstall && !hasIgnorePlatform && (isLaravel12 || hasPestOrPhpunit12)) {
      issues.push({
        severity: 'info',
        category: 'build_configuration',
        title: 'Platform Requirement Tolerance',
        message: 'Project kamu memiliki paket dev modern (Pest/PHPUnit 12). Gunakan flag --ignore-platform-req=php+ pada composer install agar dependensi dev tidak menggagalkan build production.',
        suggested_fix: 'Tambahkan flag: composer install --no-dev --ignore-platform-req=php+ --optimize-autoloader',
        auto_fixable: false,
        file: 'Dockerfile'
      });
    }
  }

  recommendations.push(`Rekomendasi PHP Runtime: Gunakan PHP ${minPhpMajorMinor} dengan ekstensi pdo_mysql, bcmath, mbstring, dan opcache.`);
  return { issues, recommendations, runtime };
}

// ==========================================
// 2. Go (go.mod) Compatibility
// ==========================================
function inspectGoCompatibility(
  goModStr: string | null | undefined,
  dockerfile: string | null
): { issues: CompatibilityIssue[]; recommendations: string[]; runtime?: RuntimeVersionInfo } {
  const issues: CompatibilityIssue[] = [];
  const recommendations: string[] = [];

  let requiredGo = '';
  let usesCgoSqlite = false;

  if (goModStr) {
    const goMatch = goModStr.match(/^\s*go\s+([0-9]+\.[0-9]+(?:\.[0-9]+)?)/m);
    if (goMatch) requiredGo = goMatch[1];

    const toolchainMatch = goModStr.match(/^\s*toolchain\s+go([0-9]+\.[0-9]+(?:\.[0-9]+)?)/m);
    if (toolchainMatch) requiredGo = toolchainMatch[1];

    if (goModStr.includes('github.com/mattn/go-sqlite3')) {
      usesCgoSqlite = true;
    }
  }

  let providedGo: string | undefined;
  let dockerfileImage: string | undefined;
  let hasCgoDisabled = false;

  if (dockerfile) {
    const m = dockerfile.match(/FROM\s+(?:--platform=[^\s]+\s+)?(?:[a-zA-Z0-9_.\-\/]+\/)?golang:([0-9]+\.[0-9]+)/i);
    if (m) {
      providedGo = m[1];
      const lineMatch = dockerfile.match(/FROM\s+(?:--platform=[^\s]+\s+)?([^\s]+)/i);
      dockerfileImage = lineMatch ? lineMatch[1] : `golang:${providedGo}`;
    }

    if (/CGO_ENABLED=0/i.test(dockerfile)) {
      hasCgoDisabled = true;
    }
  }

  const runtime: RuntimeVersionInfo = {
    language: 'go',
    required_version: requiredGo || '>=1.21',
    provided_version: providedGo,
    source_file: 'go.mod',
    dockerfile_image: dockerfileImage
  };

  if (dockerfile && providedGo && requiredGo) {
    const reqParts = requiredGo.split('.').map(Number);
    const provParts = providedGo.split('.').map(Number);

    const reqMajorMinor = (reqParts[0] || 1) * 100 + (reqParts[1] || 0);
    const provMajorMinor = (provParts[0] || 1) * 100 + (provParts[1] || 0);

    if (provMajorMinor < reqMajorMinor) {
      issues.push({
        severity: 'error',
        category: 'runtime_mismatch',
        title: 'Go Compiler Version Mismatch',
        message: `go.mod mendefinisikan versi Go ${requiredGo}, tetapi Dockerfile menggunakan golang:${providedGo}. Compiler Go tidak akan mengenali fitur atau toolchain repositori ini.`,
        suggested_fix: `Ubah baris build stage Dockerfile menjadi: FROM golang:${requiredGo}-alpine`,
        auto_fixable: true,
        file: 'Dockerfile'
      });
    }
  }

  if (usesCgoSqlite && hasCgoDisabled) {
    issues.push({
      severity: 'error',
      category: 'missing_dependency',
      title: 'CGO Required for SQLite (mattn/go-sqlite3)',
      message: 'go.mod menggunakan driver mattn/go-sqlite3 yang mewajibkan CGO. Namun Dockerfile menonaktifkan CGO (CGO_ENABLED=0), sehingga build biner akan gagal.',
      suggested_fix: 'Aktifkan CGO_ENABLED=1 dan pasang build-base/gcc di Alpine, atau ganti driver ke modernc.org/sqlite (pure Go).',
      auto_fixable: false,
      file: 'Dockerfile'
    });
  }

  recommendations.push('Rekomendasi Go: Compile dengan -ldflags="-s -w" untuk biner super ringan dan pastikan web server listen di 0.0.0.0:$PORT.');
  return { issues, recommendations, runtime };
}

// ==========================================
// 3. Node.js & Frontend Compatibility
// ==========================================
function inspectNodeCompatibility(
  packageJsonStr: string | null | undefined,
  dockerfile: string | null,
  nvmStr: string | null | undefined
): { issues: CompatibilityIssue[]; recommendations: string[]; runtime?: RuntimeVersionInfo } {
  const issues: CompatibilityIssue[] = [];
  const recommendations: string[] = [];

  let requiredNodeMajor = 18;
  let isNext15 = false;
  let isNuxt4 = false;
  let hasStandaloneNext = false;

  if (packageJsonStr) {
    try {
      const pkg = JSON.parse(packageJsonStr);
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      const enginesNode = pkg.engines?.node;

      if (typeof enginesNode === 'string') {
        const m = enginesNode.match(/\d{2}/);
        if (m) requiredNodeMajor = parseInt(m[0], 10);
      } else if (nvmStr) {
        const m = nvmStr.match(/\d{2}/);
        if (m) requiredNodeMajor = parseInt(m[0], 10);
      }

      const nextVer = String(deps['next'] || '');
      if (nextVer.includes('15.') || nextVer.includes('^15') || nextVer.includes('>=15')) {
        isNext15 = true;
        if (requiredNodeMajor < 20) requiredNodeMajor = 20; // Recommended for Next 15
      }

      const nuxtVer = String(deps['nuxt'] || deps['nuxt3'] || '');
      if (nuxtVer.includes('4.') || nuxtVer.includes('^4')) {
        isNuxt4 = true;
        if (requiredNodeMajor < 20) requiredNodeMajor = 20;
      }
    } catch {
      // JSON parse error
    }
  }

  let providedNode: string | undefined;
  let dockerfileImage: string | undefined;

  if (dockerfile) {
    const m = dockerfile.match(/FROM\s+(?:--platform=[^\s]+\s+)?(?:[a-zA-Z0-9_.\-\/]+\/)?node:([0-9]+(?:\.[0-9]+)?)/i);
    if (m) {
      providedNode = m[1];
      const lineMatch = dockerfile.match(/FROM\s+(?:--platform=[^\s]+\s+)?([^\s]+)/i);
      dockerfileImage = lineMatch ? lineMatch[1] : `node:${providedNode}`;
    }

    if (/output:\s*['"]standalone['"]/i.test(dockerfile) || /server\.js/i.test(dockerfile)) {
      hasStandaloneNext = true;
    }
  }

  const runtime: RuntimeVersionInfo = {
    language: 'node',
    required_version: `>=${requiredNodeMajor}`,
    provided_version: providedNode,
    source_file: 'package.json',
    dockerfile_image: dockerfileImage
  };

  if (dockerfile && providedNode) {
    const provMajor = parseInt(providedNode.split('.')[0], 10);
    if (provMajor < requiredNodeMajor) {
      issues.push({
        severity: isNext15 || isNuxt4 ? 'error' : 'warning',
        category: 'runtime_mismatch',
        title: 'Node.js Version Gap',
        message: `Project memerlukan Node.js >= ${requiredNodeMajor}${isNext15 ? ' (Next.js 15)' : isNuxt4 ? ' (Nuxt 4)' : ''}, tetapi Dockerfile menggunakan node:${providedNode}.`,
        suggested_fix: `Ubah base image Dockerfile menjadi: FROM node:${requiredNodeMajor}-alpine`,
        auto_fixable: true,
        file: 'Dockerfile'
      });
    }
  }

  // Next.js Dockerfile checks
  if (isNext15 && dockerfile && !hasStandaloneNext && !/standalone/i.test(dockerfile)) {
    recommendations.push('Rekomendasi Next.js Docker: Pastikan next.config.js menyertakan output: "standalone" untuk optimasi ukuran image.');
  }

  return { issues, recommendations, runtime };
}

// ==========================================
// 4. Python Compatibility
// ==========================================
function inspectPythonCompatibility(
  pyprojectStr: string | null | undefined,
  requirementsStr: string | null | undefined,
  runtimeTxtStr: string | null | undefined,
  dockerfile: string | null
): { issues: CompatibilityIssue[]; recommendations: string[]; runtime?: RuntimeVersionInfo } {
  const issues: CompatibilityIssue[] = [];
  const recommendations: string[] = [];

  let requiredPy = '3.10';

  if (pyprojectStr) {
    const m = pyprojectStr.match(/requires-python\s*=\s*["']([^"']+)["']/i);
    if (m) {
      const verM = m[1].match(/3\.\d+/);
      if (verM) requiredPy = verM[0];
    }
  } else if (runtimeTxtStr) {
    const m = runtimeTxtStr.match(/python-([0-9]+\.[0-9]+)/i);
    if (m) requiredPy = m[1];
  }

  let providedPy: string | undefined;
  let dockerfileImage: string | undefined;

  if (dockerfile) {
    const m = dockerfile.match(/FROM\s+(?:--platform=[^\s]+\s+)?(?:[a-zA-Z0-9_.\-\/]+\/)?python:([0-9]+\.[0-9]+)/i);
    if (m) {
      providedPy = m[1];
      const lineMatch = dockerfile.match(/FROM\s+(?:--platform=[^\s]+\s+)?([^\s]+)/i);
      dockerfileImage = lineMatch ? lineMatch[1] : `python:${providedPy}`;
    }

    // Check host binding (both shell format --host 127.0.0.1 and exec array format "--host", "127.0.0.1")
    if (/(--host|--bind)[\s"',]+(127\.0\.0\.1|localhost)/i.test(dockerfile)) {
      issues.push({
        severity: 'error',
        category: 'network_binding',
        title: 'Localhost Binding in Container',
        message: 'Aplikasi Python dikonfigurasi untuk listen di 127.0.0.1 / localhost. Container tidak akan bisa menerima traffic dari Nginx/Proxy luar!',
        suggested_fix: 'Ubah parameter host menjadi: --host 0.0.0.0 --port $PORT',
        auto_fixable: true,
        file: 'Dockerfile'
      });
    }
  }

  const runtime: RuntimeVersionInfo = {
    language: 'python',
    required_version: `>=${requiredPy}`,
    provided_version: providedPy,
    source_file: pyprojectStr ? 'pyproject.toml' : 'runtime.txt',
    dockerfile_image: dockerfileImage
  };

  if (dockerfile && providedPy) {
    const reqNum = parseFloat(requiredPy);
    const provNum = parseFloat(providedPy);
    if (provNum < reqNum) {
      issues.push({
        severity: 'error',
        category: 'runtime_mismatch',
        title: 'Python Version Incompatibility',
        message: `Project memerlukan Python >= ${requiredPy}, tetapi Dockerfile menggunakan python:${providedPy}.`,
        suggested_fix: `Ubah base image Dockerfile menjadi: FROM python:${requiredPy}-slim`,
        auto_fixable: true,
        file: 'Dockerfile'
      });
    }
  }

  recommendations.push('Rekomendasi Python: Jalankan server ASGI (Uvicorn / Gunicorn) dengan binding 0.0.0.0:$PORT.');
  return { issues, recommendations, runtime };
}

// ==========================================
// 5. Java / JVM Compatibility
// ==========================================
function inspectJavaCompatibility(
  pomXmlStr: string | null | undefined,
  buildGradleStr: string | null | undefined,
  dockerfile: string | null
): { issues: CompatibilityIssue[]; recommendations: string[]; runtime?: RuntimeVersionInfo } {
  const issues: CompatibilityIssue[] = [];
  const recommendations: string[] = [];

  let requiredJava = 17;

  if (pomXmlStr) {
    const jm = pomXmlStr.match(/<java\.version>([0-9]+)<\/java\.version>/i) ||
               pomXmlStr.match(/<maven\.compiler\.source>([0-9]+)<\/maven\.compiler\.source>/i);
    if (jm) requiredJava = parseInt(jm[1], 10);
  } else if (buildGradleStr) {
    const jm = buildGradleStr.match(/sourceCompatibility\s*=\s*['"]?([0-9]+)['"]?/i) ||
               buildGradleStr.match(/languageVersion\.of\(([0-9]+)\)/i);
    if (jm) requiredJava = parseInt(jm[1], 10);
  }

  let providedJava: number | undefined;
  let dockerfileImage: string | undefined;

  if (dockerfile) {
    const m = dockerfile.match(/FROM\s+(?:--platform=[^\s]+\s+)?(?:[a-zA-Z0-9_.\-\/]+\/)?(?:openjdk|eclipse-temurin|amazoncorretto):([0-9]+)/i);
    if (m) {
      providedJava = parseInt(m[1], 10);
      const lineMatch = dockerfile.match(/FROM\s+(?:--platform=[^\s]+\s+)?([^\s]+)/i);
      dockerfileImage = lineMatch ? lineMatch[1] : `eclipse-temurin:${providedJava}`;
    }
  }

  const runtime: RuntimeVersionInfo = {
    language: 'java',
    required_version: `>=${requiredJava}`,
    provided_version: providedJava ? `${providedJava}` : undefined,
    source_file: pomXmlStr ? 'pom.xml' : 'build.gradle',
    dockerfile_image: dockerfileImage
  };

  if (dockerfile && providedJava && providedJava < requiredJava) {
    issues.push({
      severity: 'error',
      category: 'runtime_mismatch',
      title: 'Java JDK Version Gap',
      message: `Project di-compile untuk Java ${requiredJava}, tetapi Dockerfile menggunakan JDK ${providedJava}.`,
      suggested_fix: `Ubah base image Dockerfile menjadi: FROM eclipse-temurin:${requiredJava}-jdk-alpine`,
      auto_fixable: true,
      file: 'Dockerfile'
    });
  }

  return { issues, recommendations, runtime };
}

// ==========================================
// 6. Rust Compatibility
// ==========================================
function inspectRustCompatibility(
  cargoTomlStr: string | null | undefined,
  dockerfile: string | null
): { issues: CompatibilityIssue[]; recommendations: string[]; runtime?: RuntimeVersionInfo } {
  const issues: CompatibilityIssue[] = [];
  const recommendations: string[] = [];

  let requiredRust = '';
  if (cargoTomlStr) {
    const m = cargoTomlStr.match(/rust-version\s*=\s*["']([^"']+)["']/i);
    if (m) requiredRust = m[1];
  }

  let providedRust: string | undefined;
  let dockerfileImage: string | undefined;

  if (dockerfile) {
    const m = dockerfile.match(/FROM\s+(?:--platform=[^\s]+\s+)?(?:[a-zA-Z0-9_.\-\/]+\/)?rust:([0-9]+\.[0-9]+)/i);
    if (m) {
      providedRust = m[1];
      const lineMatch = dockerfile.match(/FROM\s+(?:--platform=[^\s]+\s+)?([^\s]+)/i);
      dockerfileImage = lineMatch ? lineMatch[1] : `rust:${providedRust}`;
    }
  }

  const runtime: RuntimeVersionInfo = {
    language: 'rust',
    required_version: requiredRust || 'stable',
    provided_version: providedRust,
    source_file: 'Cargo.toml',
    dockerfile_image: dockerfileImage
  };

  return { issues, recommendations, runtime };
}

// ==========================================
// 7. General Docker Best-Practice Checks
// ==========================================
function inspectGeneralDocker(dockerfile: string): { issues: CompatibilityIssue[]; recommendations: string[] } {
  const issues: CompatibilityIssue[] = [];
  const recommendations: string[] = [];

  // Check missing EXPOSE
  if (!/^\s*EXPOSE\s+\d+/mi.test(dockerfile)) {
    issues.push({
      severity: 'info',
      category: 'build_configuration',
      title: 'No EXPOSE Port Declared',
      message: 'Dockerfile tidak mendeklarasikan port via EXPOSE. Pastikan kamu mengatur Internal Port yang sesuai di 7Server.',
      suggested_fix: 'Tambahkan instruksi: EXPOSE 8080 (atau port aplikasi kamu)',
      auto_fixable: false,
      file: 'Dockerfile'
    });
  }

  // Check if Dockerfile executes application commands (artisan, npm, python, etc.) but lacks COPY/ADD
  const hasAppCmd = /^\s*(CMD|ENTRYPOINT)\s+/mi.test(dockerfile);
  const copyLines = [...dockerfile.matchAll(/^\s*(COPY|ADD)\s+(.+)$/gmi)];
  const copiesAppSource = copyLines.some((m) => {
    const target = m[2].trim();
    if (/--from=composer/i.test(target)) return false;
    if (/\bcomposer\b/i.test(target)) return false;
    return true;
  });

  if (hasAppCmd && !copiesAppSource) {
    issues.push({
      severity: 'warning',
      category: 'volume_shadowing',
      title: 'Environment-Only Dockerfile (No Source Code COPY)',
      message: 'Dockerfile ini tidak menyalin file kode aplikasi ke dalam container (tidak ada instruksi "COPY . /var/www/html"). 7Server akan otomatis me-mount source code host ke WORKDIR agar artisan dan kode aplikasi tersedia.',
      suggested_fix: 'Tambahkan "COPY . /var/www/html" ke Dockerfile agar container bersifat self-contained.',
      auto_fixable: false,
      file: 'Dockerfile'
    });
  }

  return { issues, recommendations };
}
