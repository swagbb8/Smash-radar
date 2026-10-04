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
  api="https://api.github.com/repos/ggml-org/llama.cpp/releases/${LLAMA_TAG:+tags/}${LLAMA_TAG:-latest}"
  url=$(curl -fsSL ${GITHUB_TOKEN:+-H "Authorization: Bearer $GITHUB_TOKEN"} "$api" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const a=(j.assets||[]).filter(a=>/ubuntu-x64/.test(a.name)&&!/vulkan|cuda|rocm|sycl|arm|s390|riscv|openvino/i.test(a.name));if(!a.length){console.error("no ubuntu x64 asset in",j.tag_name);process.exit(1)}console.error("llama.cpp",j.tag_name,a[0].name);console.log(a[0].browser_download_url)})')
  curl -fsSL "$url" -o /tmp/llama.pkg
  rm -rf /tmp/llama && mkdir -p /tmp/llama && (unzip -q /tmp/llama.pkg -d /tmp/llama 2>/dev/null || tar xzf /tmp/llama.pkg -C /tmp/llama)
  src=$(dirname "$(find /tmp/llama -type f -name llama-server | head -1)"); cp -a "$src"/. "$HOME_DIR/bin/"; chmod +x "$HOME_DIR/bin/llama-server"
  echo "::endgroup::"
fi

MODEL="$HOME_DIR/models/$MODEL_FILE"
if [ ! -s "$MODEL" ]; then
  echo "::group::Download $MODEL_REPO/$MODEL_FILE"
  curl -fL --retry 4 --retry-delay 5 -o "$MODEL.part" "https://huggingface.co/$MODEL_REPO/resolve/main/$MODEL_FILE" 2>&1 | tail -2
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
