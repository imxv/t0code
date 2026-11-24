#!/bin/bash
set -euo pipefail

version=${1:-}
if [[ ! "$version" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
  echo "Usage: bash scripts/release-local-macos.sh <major.minor.patch>" >&2
  exit 2
fi

cd "$(dirname "${BASH_SOURCE[0]}")/.."
export PATH="$PWD/node_modules/.bin:$PATH"
update_dir="$HOME/Library/Application Support/T3 Code Local Updates"
feed_dir="$update_dir/feed"
keychain="$update_dir/signing.keychain-db"
port=47637
test -d "$feed_dir"

publish_lock="$update_dir/publish.lock"
if ! mkdir "$publish_lock"; then
  echo "A local desktop release is already running." >&2
  exit 1
fi
trap 'rmdir "$publish_lock"' EXIT

if [[ -f "$feed_dir/latest-mac.yml" ]]; then
  node --input-type=module - "$version" "$feed_dir/latest-mac.yml" <<'JS'
import { readFileSync } from "node:fs";
const [next, manifest] = process.argv.slice(2);
const current = readFileSync(manifest, "utf8").match(/^version: (\d+\.\d+\.\d+)$/m)?.[1];
if (!current) throw new Error("Cannot read the current local release version");
const currentParts = current.split(".");
const difference = next
  .split(".")
  .map((part, index) => BigInt(part) - BigInt(currentParts[index]))
  .find((part) => part !== 0n);
if (difference === undefined || difference < 0n) {
  throw new Error(`Choose a version higher than ${current}`);
}
JS
fi

security unlock-keychain -p "$(cat "$update_dir/signing-password")" "$keychain"
unset CSC_LINK CSC_NAME CSC_KEY_PASSWORD
# Prefer an Apple Development identity: its team ID keeps keychain access across rebuilds.
apple_identity=$(security find-identity -v -p codesigning | awk '/"Apple Development: / { print $2; exit }')
if [[ -n "$apple_identity" ]]; then
  echo "Signing with Apple Development identity $apple_identity"
else
  echo "No Apple Development identity found; signing with the local self-signed certificate"
fi
T3CODE_DESKTOP_LOCAL_SIGNING_IDENTITY="$apple_identity" \
  T3CODE_DESKTOP_LOCAL_SIGNING_KEYCHAIN="$keychain" \
  T3CODE_DESKTOP_VERSION="$version" \
  RUSTUP_TOOLCHAIN="${RUSTUP_TOOLCHAIN:-1.95.0}" \
  ELECTRON_GET_USE_PROXY="${ELECTRON_GET_USE_PROXY:-1}" \
  vp run dist:desktop:dmg:arm64 --signed --mock-updates --mock-update-server-port "$port"

artifact="T0-Code-$version-arm64"
grep -Fxq "version: $version" release-mock/latest-mac.yml
for suffix in dmg dmg.blockmap zip zip.blockmap; do
  cp "release-mock/$artifact.$suffix" "$feed_dir/$artifact.$suffix"
done
cp release-mock/latest-mac.yml "$feed_dir/.latest-mac.yml.pending"
mv "$feed_dir/.latest-mac.yml.pending" "$feed_dir/latest-mac.yml"
echo "T3 Code $version is available at http://localhost:$port/latest-mac.yml"
