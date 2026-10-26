// Choose the widget size before the deferred Turnstile script renders it.
const verificationWidget = document.querySelector('.cf-turnstile');
if (verificationWidget && verificationWidget.getBoundingClientRect().width < 300) {
  verificationWidget.dataset.size = 'compact';
}
let activePage = "page3";
const ADMIN_NAMES = ["peco", "小熊猫peco"];
const EMOJI_MAP = {
  YES_IMG: "4.jpg",
  NO_IMG: "3.jpg",
  WAIT_IMG: "2.jpg",
  QUES_IMG: "5.jpg",
  SAD_IMG: "6.jpg",
  BIRTH_IMG: "0.jpg",
};

const urlParams = new URLSearchParams(window.location.search);
const adminToken = urlParams.get("admin");

async function getDeviceInfo() {
  let info = { model: "未知设备", os: "未知系统" };
  try {
    if (
      navigator.userAgentData &&
      navigator.userAgentData.getHighEntropyValues
    ) {
      const hints = await navigator.userAgentData.getHighEntropyValues([
        "model",
        "platform",
        "platformVersion",
      ]);
      info.model = hints.model || "通用设备";
      info.os =
        `${hints.platform || ""} ${hints.platformVersion || ""}`.trim() ||
        "未知系统";
    } else {
      const ua = navigator.userAgent;
      if (/iPhone|iPad|iPod/i.test(ua)) info.model = "iOS Device";
      else if (/Android/i.test(ua)) info.model = "Android Device";
      info.os = navigator.platform;
    }
  } catch (e) {
    console.warn("抓取设备信息失败:", e);
  }
  return info;
}

function switchMode(mode) {
  activePage = mode;
  const app = document.getElementById("mainApp");
  document
    .querySelectorAll(".tab-item")
    .forEach((el) => el.classList.remove("active"));
  document
    .getElementById("tab-" + (mode === "page3" ? "page3" : "treehole"))
    .classList.add("active");
  document.querySelectorAll('.tab-item').forEach(tab => tab.setAttribute('aria-selected', String(tab.id === 'tab-' + mode)));
  document.getElementById('modeDescription').textContent = mode === 'treehole' ? '这里可以匿名表达，不显示昵称，也不支持回复。' : '聊聊近况、交换灵感，或只是来打个招呼。';
  cancelReply();
  if (mode === "treehole") {
    app.classList.add("tree-hole-mode");
    document.body.classList.add("tree-hole-bg");
    document.getElementById("formTitle").innerHTML =
      "投递匿名树洞";
    document.getElementById("listTitle").innerText =
      "树洞里的回声";
  } else {
    app.classList.remove("tree-hole-mode");
    document.body.classList.remove("tree-hole-bg");
    document.getElementById("formTitle").innerHTML =
      "留下一点声音";
    document.getElementById("listTitle").innerText = "留言墙";
  }
  loadComments();
}

function parseContent(rawStr) {
  let safeHtml = escapeHtml(rawStr);
  for (let code in EMOJI_MAP) {
    if (safeHtml.includes(code)) {
      safeHtml = safeHtml
        .split(code)
        .join(
          `<img src="${EMOJI_MAP[code]}" class="emoji-img" alt="emoji">`
        );
    }
  }
  return safeHtml;
}

async function loadComments() {
  try {
    const res = await fetch(`/api/comment?page_id=${activePage}`);
    const data = await res.json();
    const list = document.getElementById("commentList");
    const drawerWrapper = document.getElementById("drawerWrapper");
    drawerWrapper.innerHTML = "";

    if (!data || data.length === 0) {
      list.innerHTML =
        '<div class="empty-state"><div class="empty-icon">💭</div>这里暂时空空如也...</div>';
      return;
    }

    const drawerNode = data.find((item) =>
      item.content.startsWith("[抽屉名称:")
    );
    if (drawerNode && activePage === "page3") {
      const drawerName =
        drawerNode.content.match(/\[抽屉名称:(.*?)\]/)[1] || "精选留言";
      const drawerUI = document.createElement("div");
      drawerUI.className = "curated-drawer";
      drawerUI.innerHTML = `<div class="drawer-bar" onclick="this.parentElement.classList.toggle('open')">✨ ${escapeHtml(drawerName)}</div><div class="drawer-content" id="drawerInner"></div>`;
      drawerWrapper.appendChild(drawerUI);

      const inner = drawerUI.querySelector("#drawerInner");
      const curated = data.filter(
        (item) => item.parent_id === drawerNode.id
      );
      const others = data.filter(
        (item) =>
          item.id !== drawerNode.id && item.parent_id !== drawerNode.id
      );

      curated
        .sort((a, b) => b.id - a.id)
        .forEach((item) => renderSingleItem(item, inner, false));
      list.innerHTML = "";
      processTree(others, list);
    } else {
      list.innerHTML = "";
      processTree(data, list);
    }
  } catch (e) {
    console.error("加载失败", e);
    document.getElementById('commentList').innerHTML = '<div class="empty-state">暂时没有连上留言墙。<br><button class="text-link" type="button" onclick="loadComments()">重新加载 ↗</button></div>';
  }
}

function processTree(data, container) {
  const commentMap = {};
  data.forEach((item) => {
    item.replies = [];
    commentMap[item.id] = item;
  });
  const roots = [];
  data.forEach((item) => {
    if (item.parent_id && commentMap[item.parent_id])
      commentMap[item.parent_id].replies.push(item);
    else roots.push(item);
  });
  roots.sort((a, b) => b.id - a.id);
  renderTree(roots, container);
}

function renderSingleItem(item, container, isReply = false) {
  const div = document.createElement("div");
  div.className = isReply ? "comment-item reply-item" : "comment-item";
  const isAdmin = ADMIN_NAMES.includes(item.nickname);
  const deleteLink = adminToken
    ? `<span class="delete-btn" onclick="deleteComment(${item.id})">删除</span>`
    : "";

  div.innerHTML = `<div class="comment-body">
    <div class="comment-header">
      <strong>${escapeHtml(item.nickname)}</strong>${
    isAdmin ? '<span class="admin-badge">小熊猫</span>' : ""
  }
      <small>${item.created_at}</small>${deleteLink}
    </div>
    <p>${parseContent(item.content)}</p>
  </div>
  <button class="reply-btn" type="button">回复</button>`;
  div.querySelector('.reply-btn')?.addEventListener('click', () => prepareReply(item.id, item.nickname));
  container.appendChild(div);
  return div;
}

function renderTree(items, container) {
  items.forEach((item) => {
    renderSingleItem(item, container, !!item.parent_id);
    if (item.replies && item.replies.length > 0) {
      item.replies.sort((a, b) => a.id - b.id);
      renderTree(item.replies, container);
    }
  });
}

async function submitComment() {
  const btn = document.getElementById("submitBtn");
  const nickname =
    activePage === "treehole"
      ? "匿名"
      : document.getElementById("nicknameInput").value.trim();
  const content = document.getElementById("contentInput").value.trim();
  const turnstileToken = document.querySelector(
    '[name="cf-turnstile-response"]'
  )?.value;

  if (!nickname || !content || !turnstileToken) {
    return Swal.fire({
      title: "等一下！",
      text: "名字内容和验证都得填哦~",
      imageUrl: EMOJI_MAP.NO_IMG,
      imageWidth: 150,
      imageAlt: "Error",
    });
  }

  btn.disabled = true;
  try {
    const deviceInfo = await getDeviceInfo();
    const res = await fetch(
      `/api/comment?page_id=${activePage}${
        adminToken ? "&admin_token=" + adminToken : ""
      }`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname,
          content,
          parent_id: window.currentParentId,
          cf_token: turnstileToken,
          device_model: deviceInfo.model,
          device_os: deviceInfo.os,
        }),
      }
    );

    if (res.ok) {
      await Swal.fire({
        title: "提交成功！",
        text: "留言已经传达给小熊猫啦~",
        imageUrl: EMOJI_MAP.YES_IMG,
        imageWidth: 150,
        timer: 2000,
        showConfirmButton: false,
      });
      document.getElementById("contentInput").value = "";
      if (typeof turnstile !== "undefined") turnstile.reset();
      loadComments();
      cancelReply();
    } else {
      const errorText = await res.text();
      Swal.fire({
        title: "提交失败",
        text: errorText,
        imageUrl: EMOJI_MAP.NO_IMG,
        imageWidth: 150,
      });
    }
  } catch (e) {
    Swal.fire({
      title: "系统错误",
      text: "请检查网络连接",
      imageUrl: EMOJI_MAP.NO_IMG,
      imageWidth: 150,
    });
  }
  btn.disabled = false;
}

function prepareReply(id, name) {
  if (activePage === "treehole") return;
  document.getElementById("replyBar").style.display = "block";
  document.getElementById("targetUser").innerText = name;
  window.currentParentId = id;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function cancelReply() {
  document.getElementById("replyBar").style.display = "none";
  window.currentParentId = null;
}

async function deleteComment(id) {
  if (
    (
      await Swal.fire({
        title: "确定删除？",
        imageUrl: EMOJI_MAP.QUES_IMG || "",
        imageWidth: 100,
        showCancelButton: true,
      })
    ).isConfirmed
  ) {
    await fetch(`/api/comment?id=${id}&admin_token=${adminToken}`, {
      method: "DELETE",
    });
    loadComments();
  }
}

function escapeHtml(str) {
  var d = document.createElement("div");
  d.appendChild(document.createTextNode(str));
  return d.innerHTML;
}
document.getElementById('contentInput').addEventListener('input', event => {
  document.getElementById('characterCount').textContent = event.target.value.length;
});
loadComments();
