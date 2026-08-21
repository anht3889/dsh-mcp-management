/**
 * Build for this package's two halves: the Node entry points the harness Loader
 * imports, and the browser bundle the web shell's module loader fetches.
 *
 * The harness ships an equivalent preset at `packages/client/tsdown.client.ts`,
 * but it is unpublished and locates a package's manifest by globbing the
 * package directories of its own checkout, so it cannot describe a package
 * outside that repository. What must match is the browser artifact format,
 * because the shell's loader defines it:
 *
 * - the bundle is one CJS closure handed to
 *   `window.__ModuleLoader__.load({ id, factory })`, and every specifier the
 *   shell shares arrives through the injected `require`;
 * - specifiers the shell shares stay external and everything else inlines — a
 *   `require` the module table cannot answer throws when the plugin loads;
 * - a `.module.css` import compiles to a hashed class map and injects a tagged
 *   `<style data-plugin-css>` when the factory runs, so styles arrive with the
 *   plugin instead of through the shell's stylesheet pipeline.
 *
 * Revisit this file when the harness changes that format.
 */
import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { isBuiltin } from 'node:module'
import { basename, dirname, relative, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transform } from 'lightningcss'
import type { UserConfig } from 'tsdown'

/** The manifest fields this build reads from the package it builds. */
interface PackageManifest {
  readonly name: string
  /** Sections a real install materializes on disk beside the built package. */
  readonly dependencies?: Record<string, string>
  readonly peerDependencies?: Record<string, string>
  readonly optionalDependencies?: Record<string, string>
  readonly dsh?: { readonly client?: { readonly external?: readonly string[] } }
}

const PACKAGE_ROOT = fileURLToPath(new URL('.', import.meta.url))

const manifest = JSON.parse(
  readFileSync(resolvePath(PACKAGE_ROOT, 'package.json'), 'utf8'),
) as PackageManifest

/**
 * Specifiers the web shell shares through its module table, mirroring
 * `PLATFORM_MODULES` and `PRELOADED_CLIENT_EXTERNALS` in the harness's
 * `packages/client/web/src/platform.ts`. The shell owns these instances, so an
 * inlined copy would hand this plugin a second React or a second cordis.
 */
const SHELL_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-runtime/client',
] as const

/**
 * Module-table rows this bundle resolves through the injected `require`: the
 * shell baseline plus whatever the manifest requests, which is also what the
 * loader reads to decide the rows it must provide.
 */
const sharedModules = new Set<string>([
  ...SHELL_MODULES,
  ...manifest.dsh?.client?.external ?? [],
])

/** Whether the shell answers this specifier, rather than the bundle carrying it. */
function isShared(specifier: string): boolean {
  return sharedModules.has(specifier)
}

const productionPatterns = [...new Set([
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.peerDependencies ?? {}),
  ...Object.keys(manifest.optionalDependencies ?? {}),
])].sort().map(name => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/|$)`))

/** Whether a specifier names a production dependency of this package, subpaths included. */
function isProductionDependency(specifier: string): boolean {
  return productionPatterns.some(pattern => pattern.test(specifier))
}

/**
 * Virtual-id wrapper keeping stylesheets away from tsdown's own CSS pipeline,
 * which requires `@tsdown/css`. The suffix matters: tsdown's guard matches ids
 * ending in `.css`, so the virtual id must not. Ids stay package-relative
 * because rolldown prints them into the artifact, which would otherwise record
 * the absolute path of whoever built it.
 */
const CSS_MODULE_PREFIX = '\0dsh-css:'
const GLOBAL_CSS_PREFIX = '\0dsh-global-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

/** Name a stylesheet import as the virtual module carrying its compiled text. */
function cssVirtualId(prefix: string, source: string, importer: string): string {
  return prefix + relative(PACKAGE_ROOT, resolvePath(dirname(importer), source)) + CSS_VIRTUAL_SUFFIX
}

/** Recover the stylesheet a virtual id names. */
function cssFilePath(prefix: string, virtualId: string): string {
  return resolvePath(PACKAGE_ROOT, virtualId.slice(prefix.length, -CSS_VIRTUAL_SUFFIX.length))
}

/**
 * Emit one plugin-owned style injector, plus the class map for a CSS Module.
 * @param fileId - absolute path of the stylesheet, which names the style tag.
 * @param css - compiled stylesheet text.
 * @param classMap - local-to-hashed class names, omitted for a global sheet.
 * @returns module source injecting the sheet when the plugin factory runs.
 */
function styleInjectionModule(
  fileId: string,
  css: string,
  classMap?: Readonly<Record<string, string>>,
): string {
  const tagId = `${manifest.name}/${basename(fileId)}`
  const source = [
    `const css = ${JSON.stringify(css)};`,
    `const tagId = ${JSON.stringify(tagId)};`,
    'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
    '  const tag = document.createElement(\'style\');',
    `  tag.dataset.plugin = ${JSON.stringify(manifest.name)};`,
    '  tag.dataset.pluginCss = tagId;',
    '  tag.textContent = css;',
    '  document.head.appendChild(tag);',
    '}',
    classMap === undefined ? 'export {};' : `export default ${JSON.stringify(classMap)};`,
  ]
  return source.join('\n')
}

const nodeEnvironment = process.env.NODE_ENV ?? 'production'

/**
 * Public build values the browser artifact may embed. The empty `process.env`
 * fallback makes an unset static read evaluate to `undefined` without giving
 * the browser a `process` global; exact substitutions stay longer matches.
 */
const publicEnvironmentDefines = Object.fromEntries(Object.entries(process.env)
  .filter(([name, value]) => name.startsWith('DSH_CLIENT_') && value !== undefined)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([name, value]) => [`process.env.${name}`, JSON.stringify(value)]))

/** The Node half: entry points the harness Loader imports from a real install. */
const nodeLibrary: UserConfig = {
  name: manifest.name,
  entry: ['lib/types/index.js', 'lib/types/invariant.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  deps: {
    // A production dependency is on disk beside this package and stays an
    // import; everything else inlines. Stating both halves keeps the artifact
    // off tsdown's production-dependency fallback, where moving a dependency
    // between npm sections would silently re-bundle it. Builtins keep tsdown's
    // own handling, so neither side claims them.
    neverBundle: isProductionDependency,
    alwaysBundle: (specifier: string) => !isBuiltin(specifier) && !isProductionDependency(specifier),
  },
}

/** The browser half: the loader closure factory the web shell fetches. */
const clientBundle: UserConfig = {
  name: `${manifest.name}/client`,
  entry: { client: 'src/client/index.ts' },
  // Lands beside the Node half, so clean must stay off or it would wipe the
  // output emitted above.
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  // Types ship from lib/types via tsc; emitting them here would wrap the
  // banner and footer into a .d.cts and break parsing.
  dts: false,
  // Plugin code is fetched outside the shell's module graph, so this bundle
  // carries the only mapping back to its own TypeScript sources. The map's
  // source paths stay relative to the artifact and its sourcesContent carries
  // the code, since the shell serves no route for this repository's tree.
  sourcemap: true,
  clean: false,
  deps: {
    neverBundle: isShared,
    alwaysBundle: (specifier: string) => !isShared(specifier),
  },
  // Inlined dependencies written for Node read process.env, and an ESM
  // dependency may probe import.meta.env, which a CJS output cannot carry.
  // Both keys honor the build's NODE_ENV; artifacts default to production. The
  // bare import.meta.env key is required alongside the precise MODE key,
  // because a truthiness probe would otherwise survive as an empty import.meta.
  define: {
    'process.env': '{}',
    ...publicEnvironmentDefines,
    'process.env.NODE_ENV': JSON.stringify(nodeEnvironment),
    'import.meta.env.MODE': JSON.stringify(nodeEnvironment),
    'import.meta.env': JSON.stringify({ MODE: nodeEnvironment }),
  },
  plugins: [{
    // Build-time mirror of the loader's module edges: a value import of another
    // plugin's package either inlines a duplicate runtime instance or asks the
    // module table for a row it cannot answer. Cross-plugin collaboration goes
    // through cordis services instead.
    name: 'mcp-mgmt-bundle-purity',
    resolveId(source: string) {
      if (!source.startsWith('@deepseek-ai/') || isShared(source)) return null
      throw new Error(
        `client bundle purity: "${source}" is neither shared by the shell nor requested in `
        + `${manifest.name}'s dsh.client.external, so this bundle cannot import its values `
        + '(type-only imports are erased and never reach this check)',
      )
    },
  }, {
    name: 'mcp-mgmt-css-modules',
    resolveId(source: string, importer: string | undefined) {
      if (!source.endsWith('.module.css') || importer === undefined) return null
      return cssVirtualId(CSS_MODULE_PREFIX, source, importer)
    },
    async load(this: { addWatchFile(file: string): void }, virtualId: string) {
      if (!virtualId.startsWith(CSS_MODULE_PREFIX)) return null
      const fileId = cssFilePath(CSS_MODULE_PREFIX, virtualId)
      // The virtual id otherwise hides the stylesheet from rolldown's watch graph.
      this.addWatchFile(fileId)
      const { code, exports: cssExports } = transform({
        // lightningcss derives [hash] from this name, so a package-relative one
        // keeps the emitted class names identical across checkouts.
        filename: relative(PACKAGE_ROOT, fileId),
        code: await readFile(fileId),
        cssModules: { pattern: '[hash]_[local]' },
        minify: true,
      })
      const classMap: Record<string, string> = {}
      for (const [local, exported] of Object.entries(cssExports ?? {}).sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0)) {
        classMap[local] = exported.name
      }
      return styleInjectionModule(fileId, code.toString(), classMap)
    },
  }, {
    name: 'mcp-mgmt-css-global',
    resolveId(source: string, importer: string | undefined) {
      if (!source.endsWith('.css') || source.endsWith('.module.css') || importer === undefined) return null
      return cssVirtualId(GLOBAL_CSS_PREFIX, source, importer)
    },
    async load(this: { addWatchFile(file: string): void }, virtualId: string) {
      if (!virtualId.startsWith(GLOBAL_CSS_PREFIX)) return null
      const fileId = cssFilePath(GLOBAL_CSS_PREFIX, virtualId)
      this.addWatchFile(fileId)
      const { code } = transform({
        filename: relative(PACKAGE_ROOT, fileId),
        code: await readFile(fileId),
        minify: true,
      })
      return styleInjectionModule(fileId, code.toString())
    },
  }],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(manifest.name)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default [nodeLibrary, clientBundle]
