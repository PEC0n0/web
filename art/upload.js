const repository = "PEC0n0/art";
const apiRoot = `https://api.github.com/repos/${repository}`;
const branchRef = "/git/ref/heads/main";
const destinations = {
  pose: { path: "动作参考/", replace: true },
  style: { path: "稳固画风/", replace: false },
  palette: { path: "色调、色温、滤镜参考.png", type: "image/png" },
  character: { path: "设定图.jpg", type: "image/jpeg" },
};
const imageExtensions = /\.(png|jpe?g|webp|gif)$/i;
const maxFileSize = 25 * 1024 * 1024;

const form = document.querySelector("#upload-form");
const fields = document.querySelector("#upload-fields");
const destination = document.querySelector("#destination");
const images = document.querySelector("#images");
const replaceFolder = document.querySelector("#replace-folder");
const replaceOption = document.querySelector("#replace-option");
const tokenInput = document.querySelector("#token");
const hint = document.querySelector("#file-hint");
const selectedFiles = document.querySelector("#selected-files");
const status = document.querySelector("#status");
const commitLink = document.querySelector("#commit-link");

function showStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
  commitLink.hidden = true;
}

function destinationPath(target, file) {
  return target.type ? target.path : target.path + file.name;
}

function showSelectedFiles() {
  const target = destinations[destination.value];
  const rows = Array.from(images.files, (file) => {
    const row = document.createElement("li");
    row.textContent = destinationPath(target, file);
    return row;
  });
  selectedFiles.replaceChildren(...rows);
  selectedFiles.hidden = rows.length === 0;
}

function updateDestination() {
  const target = destinations[destination.value];
  const folder = !target.type;
  images.value = "";
  images.multiple = folder;
  images.accept = target.type ?? "image/png,image/jpeg,image/webp,image/gif";
  replaceOption.hidden = !folder;
  replaceFolder.checked = target.replace ?? false;
  hint.textContent = folder
    ? "可以多选 PNG、JPG、WebP 或 GIF。同名文件会被更新。每张上限 25 MiB。"
    : `请选择一张 ${target.type === "image/png" ? "PNG" : "JPG"}，将以仓库中的固定文件名保存。`;
  showSelectedFiles();
  showStatus("");
}

async function validateImage(file, target) {
  if (!file.size || file.size > maxFileSize) {
    throw new Error(`「${file.name}」必须有内容且不超过 25 MiB。`);
  }
  if (!target.type && (!imageExtensions.test(file.name) || /[/\\\p{Cc}]/u.test(file.name))) {
    throw new Error(`「${file.name}」的文件名或扩展名无法使用。`);
  }

  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const text = String.fromCharCode(...bytes);
  const isPng = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte);
  const isJpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const isWebp = text.startsWith("RIFF") && text.slice(8, 12) === "WEBP";
  const isGif = text.startsWith("GIF87a") || text.startsWith("GIF89a");
  const expected = target.type ?? {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
  }[file.name.split(".").at(-1).toLowerCase()];
  const valid = {
    "image/png": isPng, "image/jpeg": isJpeg, "image/webp": isWebp, "image/gif": isGif,
  };
  if (!valid[expected]) {
    throw new Error(`「${file.name}」的内容与所需图片格式不符。`);
  }
}

async function github(token, path, method = "GET", data) {
  const response = await fetch(apiRoot + path, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      ...(data && { "Content-Type": "application/json" }),
    },
    body: data && JSON.stringify(data),
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
  });
  const result = await response.json();
  if (response.ok) return result;
  if (response.status === 401 || response.status === 404) {
    throw new Error("无法访问仓库。请检查令牌是否过期，以及是否已授权 PEC0n0/art。");
  }
  if (response.status === 403) {
    throw new Error(`GitHub 拒绝操作。请检查 Contents 写权限和 GitHub 限流状态（${result.message}）。`);
  }
  if (method === "PATCH" && (response.status === 409 || response.status === 422)) {
    throw new Error(`GitHub 拒绝更新 main 分支。请检查分支是否有新提交或保护规则（${result.message}）。`);
  }
  throw new Error(`GitHub 操作失败（${response.status}）${result.message ? `，${result.message}` : ""}。`);
}

function readBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result.split(",", 2)[1]));
    reader.addEventListener("error", () => reject(new Error(`无法读取「${file.name}」。`)));
    reader.readAsDataURL(file);
  });
}

async function upload(token, target, files, replace) {
  const paths = new Set(files.map((file) => destinationPath(target, file)));
  if (paths.size !== files.length) {
    throw new Error("选中的图片有重名，请修改文件名后重新选择。");
  }
  for (const file of files) await validateImage(file, target);

  const ref = await github(token, branchRef);
  const parent = ref.object.sha;
  const current = await github(token, `/git/commits/${parent}`);
  const entries = [];

  if (replace) {
    const existing = await github(token, `/git/trees/${current.tree.sha}?recursive=1`);
    if (existing.truncated) throw new Error("GitHub 未返回完整文件清单，请取消移除旧图后再上传。");
    for (const entry of existing.tree) {
      if (entry.type === "blob" && entry.path.startsWith(target.path) &&
          imageExtensions.test(entry.path) && !paths.has(entry.path)) {
        entries.push({ path: entry.path, mode: entry.mode, type: "blob", sha: null });
      }
    }
  }

  for (const [index, file] of files.entries()) {
    showStatus(`正在上传图片 ${index + 1}/${files.length}…`);
    const content = await readBase64(file);
    const blob = await github(token, "/git/blobs", "POST", { encoding: "base64", content });
    entries.push({ path: destinationPath(target, file), mode: "100644", type: "blob", sha: blob.sha });
  }

  showStatus("正在提交到 GitHub…");
  const tree = await github(token, "/git/trees", "POST", { base_tree: current.tree.sha, tree: entries });
  if (tree.sha === current.tree.sha) return null;
  const removed = entries.length - files.length;
  const commit = await github(token, "/git/commits", "POST", {
    message: `更新卡面素材 · ${target.path}`,
    tree: tree.sha,
    parents: [parent],
  });
  await github(token, "/git/refs/heads/main", "PATCH", { sha: commit.sha, force: false });
  return { sha: commit.sha, removed };
}

destination.addEventListener("change", updateDestination);
images.addEventListener("change", () => {
  showSelectedFiles();
  showStatus("");
});
window.addEventListener("pagehide", () => { tokenInput.value = ""; });

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const token = tokenInput.value.trim();
  const target = destinations[destination.value];
  const files = Array.from(images.files);
  if (!token || files.length === 0) {
    showStatus("请选择图片并填写 GitHub 访问令牌。", true);
    return;
  }
  fields.disabled = true;
  showStatus("正在检查图片和仓库…");
  try {
    const result = await upload(token, target, files, !target.type && replaceFolder.checked);
    if (result) {
      const removal = result.removed ? `，移除了 ${result.removed} 张旧图` : "";
      showStatus(`已提交 ${files.length} 张图片${removal}。`);
      commitLink.href = `https://github.com/${repository}/commit/${result.sha}`;
      commitLink.hidden = false;
    } else {
      showStatus("所选图片与仓库内容一致。");
    }
    images.value = "";
    showSelectedFiles();
  } catch (error) {
    showStatus(error instanceof TypeError ? "无法连接 GitHub，请检查网络后重试。" : error.message, true);
  } finally {
    fields.disabled = false;
  }
});

updateDestination();
