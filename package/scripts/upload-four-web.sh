#!/usr/bin/env bash
#
# 将本站「four」静态内容同步到远端目录（默认 docs/four -> root@主机:/root/web/four/）
#
# 用法：
#   export SSHPASS='你的密码'   # 仅在必须用密码登录时使用；更推荐 ssh-copy-id 配密钥
#   ./scripts/upload-four-web.sh
#
# 环境变量（均可选）：
#   UPLOAD_HOST          默认 82.156.14.216
#   UPLOAD_USER          默认 root
#   UPLOAD_REMOTE_PATH   默认 /root/web/four（会把本地目录「内容」同步到该路径下）
#   UPLOAD_LOCAL_DIR       默认 docs/four（相对仓库根目录）
#   UPLOAD_SSH_PORT        默认 2280
#   SSHPASS                sshpass 读取的密码（勿写入仓库）
#   UPLOAD_RSYNC_DELETE    设为 1 则在远端删除本地已删文件（慎用）
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

UPLOAD_HOST="${UPLOAD_HOST:-82.156.14.216}"
UPLOAD_USER="${UPLOAD_USER:-root}"
UPLOAD_REMOTE_PATH="${UPLOAD_REMOTE_PATH:-/root/web/four}"
UPLOAD_LOCAL_DIR="${UPLOAD_LOCAL_DIR:-docs/four}"
UPLOAD_SSH_PORT="${UPLOAD_SSH_PORT:-2280}"

LOCAL_ABS="${REPO_ROOT}/${UPLOAD_LOCAL_DIR}"
RSYNC_EXTRA=()
if [[ "${UPLOAD_RSYNC_DELETE:-0}" == "1" ]]; then
  RSYNC_EXTRA+=(--delete)
fi

if [[ ! -d "${LOCAL_ABS}" ]]; then
  echo "错误：本地目录不存在：${LOCAL_ABS}" >&2
  echo "可设置 UPLOAD_LOCAL_DIR 指向你的 four 目录。" >&2
  exit 1
fi

RSYNC_TARGET="${UPLOAD_USER}@${UPLOAD_HOST}:${UPLOAD_REMOTE_PATH}/"

if command -v sshpass >/dev/null 2>&1 && [[ -n "${SSHPASS:-}" ]]; then
  export SSHPASS
  RSYNC_RSH_CMD="sshpass -e ssh -p ${UPLOAD_SSH_PORT} -o StrictHostKeyChecking=accept-new"
elif [[ -n "${SSHPASS:-}" ]] && ! command -v sshpass >/dev/null 2>&1; then
  echo "已设置 SSHPASS 但未安装 sshpass。macOS: brew install sshpass" >&2
  exit 1
else
  RSYNC_RSH_CMD="ssh -p ${UPLOAD_SSH_PORT} -o StrictHostKeyChecking=accept-new"
  echo "提示：未使用 sshpass；将尝试交互式 SSH 密码或已配置的密钥。"
fi

echo "同步: ${LOCAL_ABS}/ -> ${RSYNC_TARGET}"
rsync -avz "${RSYNC_EXTRA[@]}" -e "${RSYNC_RSH_CMD}" "${LOCAL_ABS}/" "${RSYNC_TARGET}"

echo "完成。"
