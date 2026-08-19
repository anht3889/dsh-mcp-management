#!/usr/bin/env bash
# Publish the three installable packages in dependency order.
# Skips a version that is already on the registry.
set -euo pipefail

if [[ -z "${NODE_AUTH_TOKEN:-}" && "${DRY_RUN:-false}" != "true" ]]; then
  echo "NODE_AUTH_TOKEN (NPM_TOKEN secret) is required to publish" >&2
  exit 1
fi

packages=(
  packages/mcp
  packages/mcp-oauth
  packages/bundle
)

# Restores any manifest a publish left pinned, including after an interrupt.
restore_manifests() {
  local dir
  for dir in "${packages[@]}"; do
    if [[ -f "${dir}/package.json.publish-backup" ]]; then
      mv "${dir}/package.json.publish-backup" "${dir}/package.json"
    fi
  done
}
trap restore_manifests EXIT

# Replaces pnpm's `workspace:` ranges with the versions this run publishes. npm
# uploads such a range verbatim, leaving a dependency no consumer can resolve,
# and pnpm publish rewrites them but leaves the registry readme empty.
pin_workspace_deps() {
  local dir="$1"
  cp "${dir}/package.json" "${dir}/package.json.publish-backup"
  PACKAGE_DIR="$dir" node --input-type=module -e '
    import { readdirSync, readFileSync, writeFileSync } from "node:fs"

    const read = (path) => JSON.parse(readFileSync(path, "utf8"))
    const versions = new Map(
      readdirSync("packages", { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => read(`packages/${entry.name}/package.json`))
        .map((manifest) => [manifest.name, manifest.version]),
    )

    const path = `${process.env.PACKAGE_DIR}/package.json`
    const manifest = read(path)
    for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
      for (const [name, range] of Object.entries(manifest[field] ?? {})) {
        if (!range.startsWith("workspace:")) continue
        const version = versions.get(name)
        if (version === undefined) throw new Error(`${name} carries ${range} but is not a workspace package`)
        manifest[field][name] = version
        console.log(`  pin ${name} ${range} -> ${version}`)
      }
    }
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`)
  '
}

publish_one() {
  local dir="$1"
  local name version tag args=() status=0
  name="$(node -p "require('./${dir}/package.json').name")"
  version="$(node -p "require('./${dir}/package.json').version")"

  if [[ "$version" == *-* ]]; then
    tag=next
  else
    tag=latest
  fi

  if npm view "${name}@${version}" version >/dev/null 2>&1; then
    echo "skip ${name}@${version} (already on npm)"
    return 0
  fi

  # Publish with npm from the package directory: pnpm publish can leave the
  # registry's top-level readme metadata empty, so the npmjs package page stays
  # blank even when README.md is in the tarball.
  args=(publish --access public --tag "$tag")
  if [[ "${DRY_RUN:-false}" == "true" ]]; then
    args+=(--dry-run)
  fi

  echo "publish ${name}@${version} (tag=${tag})"
  pin_workspace_deps "$dir"
  (cd "$dir" && npm "${args[@]}") || status=$?
  mv "${dir}/package.json.publish-backup" "${dir}/package.json"
  return "$status"
}

# npmjs shows packages/bundle/README.md, so keep it identical to the repo README.
cp README.md packages/bundle/README.md

for dir in "${packages[@]}"; do
  publish_one "$dir"
done
