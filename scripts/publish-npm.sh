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

publish_one() {
  local dir="$1"
  local name version tag args=()
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
  (cd "$dir" && npm "${args[@]}")
}

# npmjs shows packages/bundle/README.md, so keep it identical to the repo README.
cp README.md packages/bundle/README.md

for dir in "${packages[@]}"; do
  publish_one "$dir"
done
