/**
 * Shell run by each build Job container (#83). Inputs arrive as env vars, never
 * interpolated into the script, so a repo URL or branch can't inject commands.
 * Every script uses POSIX sh (busybox in curl/git/buildkit images).
 */

/** Line the clone step prints so the pipeline can read the built commit from logs. */
export const COMMIT_MARKER = "PIER_COMMIT=";

/** Download the pinned Railpack CLI for this node's arch and verify its checksum. */
export const FETCH_SCRIPT = `set -eu
case "$(uname -m)" in
  x86_64|amd64) ARCH=x86_64; SUM="$RAILPACK_SHA256_X86_64" ;;
  aarch64|arm64) ARCH=arm64; SUM="$RAILPACK_SHA256_ARM64" ;;
  *) echo "Railpack has no build for $(uname -m)"; exit 1 ;;
esac
URL="https://github.com/railwayapp/railpack/releases/download/v$RAILPACK_VERSION/railpack-v$RAILPACK_VERSION-$ARCH-unknown-linux-musl.tar.gz"
echo "Fetching Railpack $RAILPACK_VERSION ($ARCH)"
mkdir -p /workspace/bin && cd /workspace
curl -fsSL --retry 3 -o railpack.tgz "$URL"
echo "$SUM  railpack.tgz" | sha256sum -c -
tar -xzf railpack.tgz -C bin railpack
rm railpack.tgz
`;

/**
 * Shallow-clone one branch. A token, when set, comes from a credential helper reading
 * env (never the URL, so it can't leak into logs or .git/config).
 */
export const CLONE_SCRIPT = `set -eu
export HOME=/workspace/home GIT_TERMINAL_PROMPT=0
mkdir -p "$HOME"
if [ -n "\${GIT_PASSWORD:-}" ]; then
  git config --global credential.helper '!f() { echo "username=$GIT_USERNAME"; echo "password=$GIT_PASSWORD"; }; f'
fi
echo "Cloning $GIT_REPO ($GIT_BRANCH)"
git clone --depth 1 --branch "$GIT_BRANCH" --single-branch -- "$GIT_REPO" /workspace/src
if [ ! -d "/workspace/src/$BUILD_FOLDER" ]; then
  echo "Folder not found in the repo: $BUILD_FOLDER"
  exit 2
fi
echo "${COMMIT_MARKER}$(git -C /workspace/src rev-parse HEAD)"
`;

/** Railpack: detect the stack and write the build plan the BuildKit frontend reads. */
export const PREPARE_SCRIPT = `set -eu
export HOME=/workspace/home
mkdir -p /workspace/plan
/workspace/bin/railpack prepare "/workspace/src/$BUILD_FOLDER" \\
  --plan-out /workspace/plan/railpack-plan.json \\
  --info-out /workspace/plan/railpack-info.json
`;

/**
 * Send the build to the shared BuildKit daemon and push the image. buildctl needs a
 * writable HOME/DOCKER_CONFIG because the pod runs as a non-root user.
 */
export const BUILD_SCRIPT = `set -eu
export HOME=/workspace/home DOCKER_CONFIG=/workspace/home/.docker
mkdir -p "$DOCKER_CONFIG"
CTX="/workspace/src/$BUILD_FOLDER"
if [ "$BUILD_METHOD" = railpack ]; then
  set -- --frontend gateway.v0 --opt "source=$RAILPACK_FRONTEND" \\
    --local "context=$CTX" --local dockerfile=/workspace/plan \\
    --opt "build-arg:cache-key=$CACHE_KEY"
else
  DF="$CTX/$DOCKERFILE"
  if [ ! -f "$DF" ]; then
    echo "Dockerfile not found: $DOCKERFILE (in $BUILD_FOLDER)"
    exit 2
  fi
  set -- --frontend dockerfile.v0 --local "context=$CTX" \\
    --local "dockerfile=$(dirname "$DF")" --opt "filename=$(basename "$DF")"
fi
echo "Building $IMAGE_REF"
exec buildctl --addr "$BUILDKIT_HOST" build --progress plain "$@" \\
  --output "type=image,name=$IMAGE_REF,push=true,registry.insecure=true"
`;
