#!/usr/bin/env bash
# Start a free, open-source AI model inside the GitHub runner (llama.cpp server, CPU only, no key needed).
#   MODEL_REPO   Hugging Face repo, e.g. google/gemma-4-12B-it-qat-q4_0-gguf
#   MODEL_FILE   file inside it, e.g. gemma-4-12b-it-qat-q4_0.gguf
#   LLM_CTX      context window (default 8192)      LLM_PORT (default 8080)
# Leaves the server running in the background and prints its URL. Exits non-zero if it cannot start.
set -euo pipefail
PORT=${LLM_PORT:-8080}; CTX=${LLM_CTX:-8192}; HOME_DIR=${LLM_HOME:-$HOME/.truth-llm}; mkdir -p "$HOME_DIR/models" "$HOME_DIR/bin"

if [ ! -x "$HOME_DIR/bin/llama-server" ]; then
  echo "::group::Install llama.cpp"
  # The project publishes several kinds of release; take the newest one that carries a Linux x64 CPU build.
  api="https://api.github.com/repos/ggml-org/llama.cpp/releases${LLAMA_TAG:+/tags/$LLAMA_TAG}${LLAMA_TAG:-?per_page=30}"
  curl -sSL -H "Accept: application/vnd.github+json" ${GITHUB_TOKEN:+-H "Authorization: Bearer $GITHUB_TOKEN"} "$api" -o /tmp/llama-release.json || { echo "release lookup failed"; exit 1; }
  url=$(node -e 'let j=JSON.parse(require("fs").readFileSync("/tmp/llama-release.json","utf8"));if(!Array.isArray(j))j=[j];const ok=a=>/(ubuntu|linux).*(x64|x86_64|amd64)/i.test(a.name)&&/\.(zip|tar\.gz|tgz|tar\.xz)$/i.test(a.name)&&!/vulkan|cuda|rocm|sycl|arm|aarch|s390|riscv|openvino|hip|opencl/i.test(a.name);for(const r of j){const pick=(r.assets||[]).filter(ok);if(pick.length){console.error("llama.cpp",r.tag_name,pick[0].name);console.log(pick[0].browser_download_url);process.exit(0)}}console.error("no linux x64 CPU build found. releases:",j.slice(0,8).map(r=>r.tag_name+" ["+(r.assets||[]).map(a=>a.name).slice(0,6).join(", ")+"]").join(" ; "));process.exit(1)')
  curl -fsSL "$url" -o /tmp/llama.pkg
  rm -rf /tmp/llama && mkdir -p /tmp/llama && (unzip -q /tmp/llama.pkg -d /tmp/llama 2>/dev/null || tar xf /tmp/llama.pkg -C /tmp/llama)
  srv=$(find /tmp/llama -type f -name llama-server | head -1); [ -n "$srv" ] || { echo "llama-server not found in package:"; find /tmp/llama -maxdepth 3 | head -30; exit 1; }
  src=$(dirname "$srv"); cp -a "$src"/. "$HOME_DIR/bin/"; chmod +x "$HOME_DIR/bin/llama-server"
  echo "::endgroup::"
fi

MODEL="$HOME_DIR/models/$MODEL_FILE"
if [ ! -s "$MODEL" ]; then
  echo "::group::Download $MODEL_REPO/$MODEL_FILE"
  code=$(curl -sL --retry 4 --retry-delay 5 -o "$MODEL.part" -w '%{http_code}' "https://huggingface.co/$MODEL_REPO/resolve/main/$MODEL_FILE" || true)
  [ "$code" = "200" ] || { echo "model download failed: HTTP $code for $MODEL_REPO/$MODEL_FILE"; head -c 300 "$MODEL.part" 2>/dev/null; exit 1; }
  mv "$MODEL.part" "$MODEL"; ls -la "$MODEL"
  echo "::endgroup::"
fi

export LD_LIBRARY_PATH="$HOME_DIR/bin:${LD_LIBRARY_PATH:-}"
nohup "$HOME_DIR/bin/llama-server" -m "$MODEL" --host 127.0.0.1 --port "$PORT" -c "$CTX" -t "$(nproc)" -np 1 --jinja --reasoning-budget 0 --no-webui ${LLM_ARGS:-} > "$HOME_DIR/server.log" 2>&1 &
echo $! > "$HOME_DIR/server.pid"
for i in $(seq 1 240); do
  if curl -sf "http://127.0.0.1:$PORT/health" > /dev/null 2>&1; then echo "model ready after $((i * 3))s: http://127.0.0.1:$PORT/v1"; exit 0; fi
  if ! kill -0 "$(cat "$HOME_DIR/server.pid")" 2>/dev/null; then echo "::error::model server exited"; tail -40 "$HOME_DIR/server.log"; exit 1; fi
  sleep 3
done
echo "::error::model server did not become ready"; tail -40 "$HOME_DIR/server.log"; exit 1
