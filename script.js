/* =============================================
   Peco's Personal Website - Enhanced Script
   ============================================= */

// --- Global configuration ---
const CONFIG = {
  transitionDuration: 400,
  pageTransitionEnabled: true,
};

// =============================================
// PAGE TRANSITION
// =============================================
function navigateTo(url) {
  if (!CONFIG.pageTransitionEnabled) {
    window.location.href = url;
    return;
  }
  const overlay = document.getElementById("pageTransition");
  if (overlay) {
    overlay.classList.add("active");
    overlay.style.pointerEvents = "auto";
    setTimeout(function () {
      window.location.href = url;
    }, CONFIG.transitionDuration);
  } else {
    window.location.href = url;
  }
}

// =============================================
// INTERSECTION OBSERVER (reveal animations)
// =============================================
function initRevealAnimations() {
  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
  );

  document.querySelectorAll(".reveal").forEach(function (el) {
    observer.observe(el);
  });
}

// =============================================
// SKELETON LOADER
// =============================================
function showSkeleton(container, count) {
  if (!container) return;
  container.innerHTML = "";
  for (var i = 0; i < (count || 3); i++) {
    var skeleton = document.createElement("div");
    skeleton.className = "skeleton-item";
    skeleton.style.cssText =
      "height:60px; background:linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%); background-size:200% 100%; animation:skeletonShimmer 1.5s ease-in-out infinite; border-radius:8px; margin-bottom:8px;";
    container.appendChild(skeleton);
  }
}

// =============================================
// LIKE BUTTON
// =============================================
function initLikeButton(pageId) {
  var likeBtn = document.getElementById("likeBtn");
  var likeCount = document.getElementById("likeCount");
  if (!likeBtn || !likeCount) return;

  function loadLikes() {
    fetch("/api/like?page_id=" + pageId)
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        likeCount.textContent = data.count || 0;
      })
      .catch(function (e) {
        console.error("Load likes error:", e);
      });
  }

  var isLiking = false;
  likeBtn.onclick = function () {
    if (isLiking) return;
    isLiking = true;

    fetch("/api/like?page_id=" + pageId, { method: "POST" })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        likeCount.textContent = data.count;
        likeBtn.style.transform = "scale(0.9)";
        setTimeout(function () {
          likeBtn.style.transform = "";
          isLiking = false;
        }, 200);
      })
      .catch(function (e) {
        console.error("Like error:", e);
        isLiking = false;
      });
  };

  loadLikes();
}

// =============================================
// BIRTHDAY BALLOONS
// =============================================
function launchBalloons(count) {
  count = count || 10;
  var colors = [
    "#ff6b6b",
    "#fdcb6e",
    "#74b9ff",
    "#55efc4",
    "#a29bfe",
    "#fd79a8",
    "#e17055",
    "#00b894",
  ];
  for (var i = 0; i < count; i++) {
    var delay = i * 200 + Math.random() * 300;
    (function (d) {
      setTimeout(function () {
        var b = document.createElement("div");
        b.className = "balloon";
        b.style.left = (Math.random() * 90 + 5).toFixed(1) + "vw";
        b.style.backgroundColor =
          colors[Math.floor(Math.random() * colors.length)];
        b.style.animationDuration = (Math.random() * 4 + 4).toFixed(1) + "s";
        var w = (35 + Math.random() * 20).toFixed(1);
        b.style.width = w + "px";
        b.style.height = (parseFloat(w) * 1.3).toFixed(1) + "px";
        document.body.appendChild(b);
        setTimeout(function () {
          if (b.parentNode) b.remove();
        }, 12000);
      }, d);
    })(delay);
  }
}

// =============================================
// CONFETTI
// =============================================
function launchConfetti(count) {
  count = count || 50;
  var container = document.createElement("div");
  container.className = "confetti-container";
  document.body.appendChild(container);

  var colors = [
    "#ff6b6b",
    "#fdcb6e",
    "#74b9ff",
    "#55efc4",
    "#a29bfe",
    "#fd79a8",
    "#ffe66d",
  ];

  for (var i = 0; i < count; i++) {
    var piece = document.createElement("div");
    piece.className = "confetti-piece";
    piece.style.left = Math.random() * 100 + "vw";
    piece.style.backgroundColor =
      colors[Math.floor(Math.random() * colors.length)];
    piece.style.width = (6 + Math.random() * 8).toFixed(1) + "px";
    piece.style.height = (6 + Math.random() * 8).toFixed(1) + "px";
    piece.style.borderRadius = Math.random() > 0.5 ? "50%" : "2px";
    piece.style.animationDuration = (2 + Math.random() * 3).toFixed(1) + "s";
    piece.style.animationDelay = (Math.random() * 2).toFixed(1) + "s";
    container.appendChild(piece);
  }

  setTimeout(function () {
    if (container.parentNode) container.remove();
  }, 7000);
}

// =============================================
// SPARKLE EFFECT (birthday)
// =============================================
function launchSparkles(count) {
  count = count || 15;
  for (var i = 0; i < count; i++) {
    (function (delay) {
      setTimeout(function () {
        var s = document.createElement("div");
        s.className = "sparkle";
        s.style.left = Math.random() * 100 + "vw";
        s.style.top = Math.random() * 100 + "vh";
        document.body.appendChild(s);
        setTimeout(function () {
          if (s.parentNode) s.remove();
        }, 1500);
      }, delay);
    })(i * 100 + Math.random() * 200);
  }
}

// =============================================
// PARALLAX CURSOR TRAIL (index page)
// =============================================
function initCursorTrail() {
  var container = document.createElement("div");
  container.className = "cursor-trail-container";
  container.style.cssText =
    "position:fixed; inset:0; pointer-events:none; z-index:9995;";
  document.body.appendChild(container);

  var isMouse = false;
  var trails = [];

  document.addEventListener("mousemove", function (e) {
    isMouse = true;
    createTrail(e.clientX, e.clientY);
  });

  document.addEventListener("touchmove", function (e) {
    var touch = e.touches[0];
    createTrail(touch.clientX, touch.clientY);
  });

  function createTrail(x, y) {
    var dot = document.createElement("div");
    dot.style.cssText =
      "position:absolute; width:6px; height:6px; border-radius:50%; " +
      "background:var(--color-primary, #ff6b6b); opacity:0.4; " +
      "transform:translate(-50%,-50%); transition:opacity 0.6s ease, transform 0.6s ease; " +
      "left:" +
      x +
      "px; top:" +
      y +
      "px;";
    container.appendChild(dot);
    trails.push(dot);

    if (trails.length > 20) {
      var old = trails.shift();
      if (old.parentNode) old.remove();
    }

    setTimeout(function () {
      dot.style.opacity = "0";
      dot.style.transform = "translate(-50%,-50%) scale(0.3)";
      setTimeout(function () {
        if (dot.parentNode) dot.remove();
      }, 600);
    }, 100);
  }
}

// =============================================
// PARALLAX ON SCROLL (hero gradient)
// =============================================
function initParallaxGradient() {
  var hero = document.querySelector(".hero-section");
  if (!hero) return;

  window.addEventListener(
    "scroll",
    function () {
      var scrollY = window.scrollY;
      var maxScroll = window.innerHeight;
      var progress = Math.min(scrollY / maxScroll, 1);
      hero.style.backgroundPosition = "center " + progress * -10 + "px";
    },
    { passive: true }
  );
}

// =============================================
// VERSION BADGE (optional)
// =============================================
function showVersion(badgeText) {
  if (!badgeText) badgeText = "v2.0";
  var badge = document.createElement("div");
  badge.style.cssText =
    "position:fixed; bottom:70px; right:10px; font-size:0.6rem; " +
    "color:var(--color-text-light, #b2bec3); opacity:0.3; z-index:1; " +
    "pointer-events:none; user-select:none;";
  badge.textContent = badgeText;
  document.body.appendChild(badge);
}

// =============================================
// CUSTOM EXIT PAGE (beforeunload)
// =============================================
function initExitLink(selector, targetUrl) {
  var links = document.querySelectorAll(selector);
  links.forEach(function (link) {
    link.addEventListener("click", function (e) {
      e.preventDefault();
      navigateTo(targetUrl);
    });
  });
}

// =============================================
// INIT ON DOM READY
// =============================================
document.addEventListener("DOMContentLoaded", function () {
  initRevealAnimations();
});
