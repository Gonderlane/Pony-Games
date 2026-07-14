const POSTS_PER_PAGE = 10;
const TAG_PRIORITY = { warning: 0, black: 1, genre: 2, other: 3 };

// Data has mixed casing ("Genre", "Black Tags"); keep the keys lowercase
// to match TAG_PRIORITY and the .tag--* classes.
function normalizeTagType(type) {
  const t = String(type || "").toLowerCase().trim();
  if (t.startsWith("black")) return "black";
  if (t === "warning" || t === "genre") return t;
  return "other";
}

// Download/source entry classification (see openPanel downloads rendering).
const DOWNLOAD_BUTTON_TEXT = { source: "Author Site", web: "Play", download: "Download" };
const DOWNLOAD_TYPE_ORDER = { source: 0, web: 1, download: 2 };

function classifyDownloadEntry(d) {
  if (d.type && DOWNLOAD_BUTTON_TEXT[d.type]) return d.type;
  const text = `${d.label || ""} ${d.url || ""}`.toLowerCase();
  const looksLikeFile = /\.(zip|exe|apk|rar|7z|dmg|tar\.gz)(\?|$)/.test(text);
  if (!looksLikeFile && /steam|itch\.io\/?(\s|$)|author|website|homepage|source/.test(text)) return "source";
  if (/web|browser|html5/.test(text)) return "web";
  return "download";
}

/* ==========================================================================
   Utility
   ========================================================================== */
async function fetchJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}`);
  return response.json();
}

function normalizeListData(data, key) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data[key])) return data[key];
  return [];
}

function formatDate(dateString) {
  // timeZone: UTC matters. "YYYY-MM-DD" parses as UTC midnight, so local
  // rendering shows the previous day for anyone west of Greenwich.
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

// releaseDate comes in three precisions: "YYYY-MM-DD", bare "YYYY", or
// empty/missing when unknown. Returns null when there's nothing to show.
function formatReleaseDate(releaseDate) {
  if (!releaseDate) return null;
  const value = String(releaseDate).trim();
  if (!value) return null;

  if (/^\d{4}$/.test(value)) return value;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return formatDate(value);
  }

  console.warn(`releaseDate "${releaseDate}" is not YYYY-MM-DD or YYYY, hiding it`);
  return null;
}

// Comparable timestamp for sorting: full dates use their exact time,
// year-only uses Jan 1 of that year, unknown returns null so callers can
// sort those to the end instead of treating them as the oldest/newest.
function releaseDateValue(releaseDate) {
  const value = String(releaseDate || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const t = Date.parse(`${value}T00:00:00Z`);
    return Number.isNaN(t) ? null : t;
  }
  if (/^\d{4}$/.test(value)) return Date.UTC(Number(value), 0, 1);
  return null;
}

// direction 1 = oldest first, -1 = newest first. Unknown release dates
// always sort last regardless of direction, so reversing for "newest"
// can't be done by just swapping arguments (that would also flip which
// end the unknowns land on) — direction only flips the known-vs-known
// comparison.
function compareReleaseDates(a, b, direction) {
  const av = releaseDateValue(a.releaseDate);
  const bv = releaseDateValue(b.releaseDate);
  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;
  return (av - bv) * direction;
}

function formatRelativeDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? "" : "s"} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  if (diffWeek < 5) return `${diffWeek} week${diffWeek === 1 ? "" : "s"} ago`;
  if (diffMonth < 12) return `${diffMonth} month${diffMonth === 1 ? "" : "s"} ago`;
  if (diffYear >= 1) return `${diffYear} year${diffYear === 1 ? "" : "s"} ago`;
  return formatDate(dateString);
}

function sortTagsByPriority(tags) {
  return [...tags].sort((a, b) => {
    const typeA = typeof a === "string" ? "other" : normalizeTagType(a.type);
    const typeB = typeof b === "string" ? "other" : normalizeTagType(b.type);
    return (TAG_PRIORITY[typeA] ?? 99) - (TAG_PRIORITY[typeB] ?? 99);
  });
}

function renderGameTag(tag) {
  if (typeof tag === "string") {
    return `<span class="tag">${tag}</span>`;
  }
  return `<span class="tag tag--${normalizeTagType(tag.type)}">${tag.label}</span>`;
}

function createTagElements(tags) {
  return sortTagsByPriority(tags).map(renderGameTag).join("");
}

function pickRandomItems(array, count) {
  const pool = [...array];
  const picked = [];
  while (pool.length > 0 && picked.length < count) {
    const index = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}

// author is a plain string in old entries, an array in newer ones
function getAuthors(item) {
  if (Array.isArray(item.author)) return item.author.filter(Boolean);
  if (item.author) return [item.author];
  return [];
}

function renderAuthorLinks(item, className) {
  return getAuthors(item)
    .map((a) => `<button type="button" class="${className}" data-author="${a}">${a}</button>`)
    .join(", ");
}

function isNsfwItem(item) {
  return (item.tags || []).some(
    (t) => t && typeof t === "object" && normalizeTagType(t.type) === "warning"
  );
}

function getPlaytimeLevel(playtime) {
  if (!playtime || playtime === "N/A") return 0;
  const lower = playtime.toLowerCase();
  const hoursMatch = lower.match(/(\d+)/);
  if (lower.includes("hour")) {
    const h = hoursMatch ? parseInt(hoursMatch[1], 10) : 1;
    return h >= 3 ? 4 : 3;
  }
  if (lower.includes("90") || lower.includes("60") || lower.includes("45")) return 2;
  return 1;
}

function animateCount(el, target, noun = "game") {
  if (!el) return;
  const start = parseInt(el.dataset.count, 10) || 0;
  if (start === target) {
    el.textContent = `${target} ${noun}${target === 1 ? "" : "s"}`;
    return;
  }

  const duration = 350;
  const startTime = performance.now();

  function frame(now) {
    const t = Math.min(1, (now - startTime) / duration);
    const eased = 1 - (1 - t) ** 3;
    const current = Math.round(start + (target - start) * eased);
    el.textContent = `${current} ${noun}${current === 1 ? "" : "s"}`;
    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      el.dataset.count = String(target);
      el.textContent = `${target} ${noun}${target === 1 ? "" : "s"}`;
    }
  }

  requestAnimationFrame(frame);
}

function renderSkeletonCards(count = 6) {
  return Array.from({ length: count }, () => `
    <div class="skeleton-card" aria-hidden="true">
      <div class="skeleton skeleton--thumb"></div>
      <div class="skeleton skeleton--line skeleton--title"></div>
      <div class="skeleton skeleton--line skeleton--short"></div>
      <div class="skeleton skeleton--line skeleton--medium"></div>
    </div>
  `).join("");
}

function renderSkeletonPosts(count = 3) {
  return Array.from({ length: count }, () => `
    <div class="skeleton-post" aria-hidden="true">
      <div class="skeleton skeleton--line skeleton--short"></div>
      <div class="skeleton skeleton--line skeleton--title"></div>
      <div class="skeleton skeleton--line"></div>
      <div class="skeleton skeleton--line skeleton--medium"></div>
    </div>
  `).join("");
}

function renderSkeletonJamHistory(count = 4) {
  return Array.from({ length: count }, () => `
    <div class="skeleton-jam" aria-hidden="true">
      <div class="skeleton skeleton--jam-img"></div>
      <div class="skeleton skeleton--line skeleton--short"></div>
    </div>
  `).join("");
}

function renderSkeletonSidebar(count = 3) {
  return Array.from({ length: count }, () => `
    <div class="skeleton-sidebar-item" aria-hidden="true">
      <div class="skeleton skeleton--avatar"></div>
      <div class="skeleton-sidebar-item__lines">
        <div class="skeleton skeleton--line skeleton--short"></div>
        <div class="skeleton skeleton--line skeleton--medium"></div>
      </div>
    </div>
  `).join("");
}

function staggerCards(grid) {
  const cards = grid.querySelectorAll(".card");
  // cap the stagger so big grids don't spend seconds animating in
  const MAX_STAGGER_MS = 450;
  cards.forEach((card, i) => {
    card.classList.add("card--enter");
    card.style.animationDelay = `${Math.min(i * 45, MAX_STAGGER_MS)}ms`;
  });
}

/* ==========================================================================
   Global UI polish
   ========================================================================== */
function initAuthorSearch() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-author]");
    if (!btn) return;
    e.stopPropagation();
    const author = btn.dataset.author;
    const searchInput = document.getElementById("filter-search");
    if (searchInput) {
      // We're already on the games page
      searchInput.value = author;
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      searchInput.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      // Navigate to games page with search param
      window.location.href = `games.html?search=${encodeURIComponent(author)}`;
    }
  });
}

function initGlobalJuice() {
  const header = document.querySelector(".site-header");
  const logo = document.querySelector(".site-logo");

  if (header) {
    const onScroll = () => {
      header.classList.toggle("is-scrolled", window.scrollY > 8);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  if (logo) {
    logo.addEventListener("click", (e) => {
      if (sessionStorage.getItem("logo-sparkle")) return;
      sessionStorage.setItem("logo-sparkle", "1");
      logo.classList.add("site-logo--sparkle");
      setTimeout(() => logo.classList.remove("site-logo--sparkle"), 1200);
    });
  }

  document.querySelectorAll(".game-sidebar__column-title").forEach((title, i) => {
    title.style.animationDelay = `${i * 120}ms`;
    title.classList.add("game-sidebar__column-title--enter");
  });
}

function initSearchShortcut() {
  const searchInput = document.getElementById("filter-search");
  if (!searchInput) return;

  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    e.preventDefault();
    searchInput.focus();
    searchInput.classList.add("input--focus-flash");
    setTimeout(() => searchInput.classList.remove("input--focus-flash"), 600);
  });
}

/* ==========================================================================
   News Blog
   ========================================================================== */
async function initNewsBlog() {
  const blogContainer = document.getElementById("news-blog");
  const prevBtn = document.getElementById("blog-prev");
  const nextBtn = document.getElementById("blog-next");
  const pageInfo = document.getElementById("blog-page-info");

  if (!blogContainer) return;

  blogContainer.innerHTML = renderSkeletonPosts(4);

  let posts = [];
  let currentPage = 1;

  try {
    posts = normalizeListData(await fetchJSON("data/posts.json"), "posts");
    posts.sort((a, b) => new Date(b.date) - new Date(a.date));
  } catch (err) {
    blogContainer.innerHTML = `<p>Unable to load news posts.</p>`;
    console.error(err);
    return;
  }

  function renderPage(page) {
    const totalPages = Math.max(1, Math.ceil(posts.length / POSTS_PER_PAGE));
    currentPage = Math.min(Math.max(1, page), totalPages);

    const start = (currentPage - 1) * POSTS_PER_PAGE;
    const pagePosts = posts.slice(start, start + POSTS_PER_PAGE);

    blogContainer.innerHTML = pagePosts
      .map(
        (post, i) => `
        <article class="news-post news-post--enter" style="animation-delay: ${i * 60}ms">
          <button class="news-post__header" type="button" aria-expanded="false">
            <div class="news-post__header-text">
              <time class="news-post__date" datetime="${post.date}" title="${formatDate(post.date)}">${formatRelativeDate(post.date)}</time>
              <h3 class="news-post__title">${post.title}</h3>
            </div>
            <span class="news-post__chevron" aria-hidden="true">▾</span>
          </button>
          <div class="news-post__body" hidden>
            ${post.image ? `<img class="news-post__image" src="${post.image}" alt="${post.title}" loading="lazy" />` : ""}
            <p class="news-post__excerpt">${post.excerpt}</p>
          </div>
        </article>
      `
      )
      .join("");

    blogContainer.querySelectorAll(".news-post__header").forEach((btn) => {
      btn.addEventListener("click", () => {
        const article = btn.closest(".news-post");
        const body = article.querySelector(".news-post__body");
        const expanded = btn.getAttribute("aria-expanded") === "true";
        btn.setAttribute("aria-expanded", String(!expanded));
        body.hidden = expanded;
        article.classList.toggle("news-post--open", !expanded);
      });
    });

    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
    if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
  }

  if (prevBtn) prevBtn.addEventListener("click", () => renderPage(currentPage - 1));
  if (nextBtn) nextBtn.addEventListener("click", () => renderPage(currentPage + 1));

  renderPage(1);
}

/* ==========================================================================
   Detail Panel
   ========================================================================== */
function initDetailPanel(options = {}) {
  const panel = document.getElementById("detail-panel");
  if (!panel) return null;

  const closeBtn = panel.querySelector(".detail-panel__close");
  const content = panel.querySelector(".detail-panel__content");
  const isGame = options.isGame ?? false;

  function closePanel() {
    panel.classList.remove("is-open");
    content.classList.remove("detail-panel__content--visible");
    document.body.style.overflow = "";
    if (isGame) {
      const url = new URL(window.location);
      url.searchParams.delete("game");
      history.replaceState(null, "", url);
    }
  }

  function openPanel(item) {
    // Carousel
    const carousel = panel.querySelector(".detail-panel__carousel");
    const track = panel.querySelector(".carousel__track");
    const dotsEl = panel.querySelector(".carousel__dots");
    const prevBtn = panel.querySelector(".carousel__btn--prev");
    const nextBtn = panel.querySelector(".carousel__btn--next");
    const screenshots = item.screenshots && item.screenshots.length ? item.screenshots : [];

    // thumbnail is the first slide, screenshots follow
    const allImages = [item.thumbnail, ...(item.screenshots || [])];
    const hasMultiple = allImages.length > 1;

    if (carousel) {
      carousel.hidden = false;
      let current = 0;

      track.innerHTML = allImages.map((src, i) => `
        <img class="carousel__img${i === 0 ? " carousel__img--active" : ""}" src="${src}" alt="${item.title}${i === 0 ? "" : ` screenshot ${i}`}" loading="lazy" />
      `).join("");

      if (prevBtn) prevBtn.hidden = !hasMultiple;
      if (nextBtn) nextBtn.hidden = !hasMultiple;

      dotsEl.innerHTML = hasMultiple ? allImages.map((_, i) => `
        <button type="button" class="carousel__dot${i === 0 ? " carousel__dot--active" : ""}" data-index="${i}" aria-label="${i === 0 ? "Cover" : `Screenshot ${i}`}"></button>
      `).join("") : "";

      function goTo(n) {
        const imgs = track.querySelectorAll(".carousel__img");
        const dots = dotsEl.querySelectorAll(".carousel__dot");
        imgs[current].classList.remove("carousel__img--active");
        if (dots[current]) dots[current].classList.remove("carousel__dot--active");
        current = (n + allImages.length) % allImages.length;
        imgs[current].classList.add("carousel__img--active");
        if (dots[current]) dots[current].classList.add("carousel__dot--active");
      }

      if (prevBtn) prevBtn.onclick = () => goTo(current - 1);
      if (nextBtn) nextBtn.onclick = () => goTo(current + 1);
      dotsEl.querySelectorAll(".carousel__dot").forEach((dot) => {
        dot.onclick = () => goTo(Number(dot.dataset.index));
      });

      // the panel is reused between opens, clear any leftover NSFW overlay
      const oldOverlay = carousel.querySelector(".detail-panel__nsfw-overlay");
      if (oldOverlay) oldOverlay.remove();
      carousel.classList.remove("detail-panel__carousel--nsfw-blurred");
      if (isNsfwItem(item)) {
        carousel.classList.add("detail-panel__carousel--nsfw-blurred");
        const overlayBtn = document.createElement("button");
        overlayBtn.type = "button";
        overlayBtn.className = "detail-panel__nsfw-overlay";
        overlayBtn.textContent = "🔞 NSFW, click to reveal";
        overlayBtn.addEventListener("click", () => {
          carousel.classList.remove("detail-panel__carousel--nsfw-blurred");
          overlayBtn.remove();
        });
        carousel.appendChild(overlayBtn);
      }
    }

    panel.querySelector(".detail-panel__thumb").hidden = true;
    panel.querySelector(".detail-panel__thumb").src = item.thumbnail;
    panel.querySelector(".detail-panel__thumb").alt = item.title;
    panel.querySelector(".detail-panel__title").textContent = item.title;
    panel.querySelector(".detail-panel__tags").innerHTML = createTagElements(item.tags);
    panel.querySelector(".detail-panel__description").textContent = item.fullDescription;
    const downloadsEl = panel.querySelector(".detail-panel__downloads");
    if (downloadsEl) {
      // item.url is the author/source page, item.downloads are the build
      // files. Both show when both exist, source first.
      const sourceEntry = item.url
        ? [{ label: item.platform || "Source", version: item.version, url: item.url, type: "source" }]
        : [];
      const buildEntries = (item.downloads || []).filter((d) => d.url !== item.url);
      const rawEntries = [...sourceEntry, ...buildEntries];
      // explicit d.type wins, otherwise guess from the label/url
      const entries = rawEntries
        .map((d) => ({ ...d, _type: classifyDownloadEntry(d) }))
        .sort((a, b) => (DOWNLOAD_TYPE_ORDER[a._type] ?? 3) - (DOWNLOAD_TYPE_ORDER[b._type] ?? 3));
      // mirrors = same build hosted elsewhere (telegram, backup server)
      downloadsEl.innerHTML = entries.map(d => `
        <div class="download-row">
          <div class="download-row__btns">
            <a class="download-row__btn" href="${d.url}" target="_blank" rel="noopener noreferrer">${d.buttonText || DOWNLOAD_BUTTON_TEXT[d._type] || "Download"}</a>
            ${(d.mirrors || []).map((m) => `
              <a class="download-row__btn download-row__btn--mirror" href="${m.url}" target="_blank" rel="noopener noreferrer" title="${m.label}">${m.label}</a>
            `).join("")}
          </div>
          <span class="download-row__info">
            <span class="download-row__label">${d.label}</span>
            ${d.version ? `<span class="download-row__version">${d.version}</span>` : ""}
          </span>
        </div>
      `).join("");
    }

    const playtimeEl = panel.querySelector(".detail-panel__playtime");
    const playtimeWrap = panel.querySelector(".detail-panel__playtime-wrap");
    if (playtimeWrap && playtimeEl) {
      if (item.playtime && item.playtime !== "N/A") {
        playtimeEl.textContent = item.playtime;
        playtimeWrap.hidden = false;
      } else {
        playtimeWrap.hidden = true;
      }
    }

    const authorEl = panel.querySelector(".detail-panel__author");

    if (authorEl) {
      const authors = getAuthors(item);
      if (authors.length) {
        authorEl.innerHTML = `By ${renderAuthorLinks(item, "author-link")}`;
        authorEl.hidden = false;
      } else {
        authorEl.hidden = true;
      }
    }

    const releaseEl = panel.querySelector(".detail-panel__release");
    if (releaseEl) {
      const releaseText = formatReleaseDate(item.releaseDate);
      if (releaseText) {
        releaseEl.textContent = `Released ${releaseText}`;
        releaseEl.hidden = false;
      } else {
        releaseEl.hidden = true;
      }
    }

    if (isGame && item.id) {
      const url = new URL(window.location);
      url.searchParams.set("game", item.id);
      history.replaceState(null, "", url);
    }
    panel.classList.add("is-open");
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => {
      content.classList.add("detail-panel__content--visible");
      closeBtn.focus();
    });
  }

  closeBtn.addEventListener("click", closePanel);
  panel.addEventListener("click", (e) => {
    if (e.target === panel) closePanel();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel.classList.contains("is-open")) closePanel();
  });

  return { openPanel, closePanel, isGame };
}

function bindCardInteractions(grid, itemMap, detail) {
  grid.addEventListener("click", (e) => {
    const card = e.target.closest(".card");
    if (!card) return;
    const item = itemMap.get(String(card.dataset.id));
    if (item) detail.openPanel(item);
  });

  grid.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const card = e.target.closest(".card");
    if (!card) return;
    e.preventDefault();
    const item = itemMap.get(String(card.dataset.id));
    if (item) detail.openPanel(item);
  });
}

/* ==========================================================================
   Game Sidebar
   ========================================================================== */
function renderSidebarGame(game, index = 0) {
  return `
    <button type="button" class="sidebar-game sidebar-game--enter" data-id="${game.id}" style="animation-delay: ${index * 80}ms">
      <img
        class="sidebar-game__thumb"
        src="${game.thumbnail}"
        alt="${game.title} thumbnail"
        loading="lazy"
      />
      <div class="sidebar-game__info">
        <p class="sidebar-game__name">${game.title}</p>
        <p class="sidebar-game__desc">${game.shortDescription}</p>
      </div>
    </button>
  `;
}

async function initGameSidebar() {
  const recentContainer = document.getElementById("sidebar-recent");
  const randomContainer = document.getElementById("sidebar-random");
  const shuffleBtn = document.getElementById("sidebar-shuffle");
  if (!recentContainer || !randomContainer) return;

  const detail = initDetailPanel({ isGame: true });
  if (!detail) return;

  recentContainer.innerHTML = renderSkeletonSidebar(3);
  randomContainer.innerHTML = renderSkeletonSidebar(3);

  let games = [];
  let sorted = [];
  let remainingPool = [];
  let itemMap = new Map();

  try {
    games = normalizeListData(await fetchJSON("data/games.json"), "games");
    sorted = [...games].sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
    itemMap = new Map(games.map((g) => [String(g.id), g]));
    remainingPool = sorted.slice(3);
  } catch (err) {
    recentContainer.innerHTML = `<p>Unable to load games.</p>`;
    console.error(err);
    return;
  }

  function renderRecent() {
    const recent = sorted.slice(0, 3);
    recentContainer.innerHTML = recent.length
      ? recent.map((g, i) => renderSidebarGame(g, i)).join("")
      : `<p class="sidebar-empty">No games yet.</p>`;
  }

  function renderRandom(animate = true) {
    const random = pickRandomItems(remainingPool, 3);
    randomContainer.innerHTML = random.length
      ? random.map((g, i) => renderSidebarGame(g, i)).join("")
      : `<p class="sidebar-empty">No more games to discover.</p>`;

    if (animate) {
      randomContainer.classList.add("sidebar-random--shuffle");
      setTimeout(() => randomContainer.classList.remove("sidebar-random--shuffle"), 500);
    }
  }

  function handleSidebarClick(e) {
    const btn = e.target.closest(".sidebar-game");
    if (!btn) return;
    const item = itemMap.get(String(btn.dataset.id));
    if (item) detail.openPanel(item);
  }

  recentContainer.addEventListener("click", handleSidebarClick);
  randomContainer.addEventListener("click", handleSidebarClick);

  if (shuffleBtn) {
    shuffleBtn.addEventListener("click", () => {
      shuffleBtn.classList.add("is-spinning");
      renderRandom(true);
      setTimeout(() => shuffleBtn.classList.remove("is-spinning"), 500);
    });
  }

  renderRecent();
  renderRandom(false);
}

/* ==========================================================================
   Game Cards
   ========================================================================== */
function renderGameCard(item) {
  const sorted = sortTagsByPriority(item.tags);
  const tagsDefault = sorted.slice(0, 3).map(renderGameTag).join("");
  const tagsHover = sorted.map(renderGameTag).join("");

  const nsfw = isNsfwItem(item);

  return `
    <article class="card card--game" data-id="${item.id}" tabindex="0" role="button" aria-label="View details for ${item.title}">
      <div class="card__thumb-wrap">
        <img class="card__thumb${nsfw ? " card__thumb--nsfw" : ""}" src="${item.thumbnail}" alt="${item.title} thumbnail" loading="lazy" />
        ${nsfw ? `<span class="card__nsfw-badge" title="NSFW, hover to preview">🔞</span>` : ""}
      </div>
      <div class="card__body">
        <h3 class="card__title">${item.title}</h3>
        <p class="card__author">${renderAuthorLinks(item, "card__author--link")}</p>
        <p class="card__short-desc">${item.shortDescription}</p>
        <div class="card__tags card__tags--default">${tagsDefault}</div>
        <div class="card__extra">
          <p class="card__playtime">${item.playtime}</p>
          <div class="card__tags card__tags--hover">${tagsHover}</div>
        </div>
      </div>
    </article>
  `;
}

function renderResourceCard(item) {
  const tagsPreview = item.tags
    .slice(0, 3)
    .map((t) => `<span class="tag">${t}</span>`)
    .join("");

  return `
    <article class="card" data-id="${item.id}" tabindex="0" role="button" aria-label="View details for ${item.title}">
      <div class="card__thumb-wrap">
        <img class="card__thumb" src="${item.thumbnail}" alt="${item.title} thumbnail" loading="lazy" />
      </div>
      <div class="card__body">
        <h3 class="card__title">${item.title}</h3>
        <p class="card__short-desc">${item.shortDescription}</p>
        <div class="card__extra">
          <p class="card__playtime">${item.playtime}</p>
          <div class="card__tags-preview">${tagsPreview}</div>
        </div>
      </div>
    </article>
  `;
}

/* ==========================================================================
   Games Page - search & multi-select filter
   ========================================================================== */

function parseMinutes(playtime) {
  if (!playtime) return 0;
  const s = playtime.toLowerCase();
  // buckets: <5 min, 5m-30m, 30m-2h, 2h-4h, 4h-10h, 10h+
  if (s.startsWith("<5")) return 0;
  if (s.startsWith("5m")) return 5;
  if (s.startsWith("30m")) return 30;
  if (s.startsWith("2h")) return 120;
  if (s.startsWith("4h")) return 240;
  if (s.startsWith("10h")) return 600;
  // Fallback for legacy values
  const n = parseInt(s.match(/\d+/)?.[0] || "0", 10);
  if (s.includes("hour") || s.includes("h")) return n * 60;
  return n;
}

function buildTagFilterChips(containerId, values, activeSet, onToggle, sortFn) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const sorted = sortFn ? [...values].sort(sortFn) : [...values].sort();
  container.innerHTML = sorted.map((val) => `
    <button type="button" class="tag-filter-chip ${activeSet.has(val) ? "tag-filter-chip--active" : ""}" data-value="${val}">
      ${val}
    </button>
  `).join("");
  container.querySelectorAll(".tag-filter-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const v = btn.dataset.value;
      if (activeSet.has(v)) activeSet.delete(v);
      else activeSet.add(v);
      btn.classList.toggle("tag-filter-chip--active", activeSet.has(v));
      onToggle();
    });
  });
}

function gameMatchesFilters(game, filters) {
  const { search, genres, tags, playtimes, statuses, engines, platforms, showNsfw } = filters;

  // NSFW-gated = any tag with type "warning", whatever its label says
  if (isNsfwItem(game) && !showNsfw) return false;

  if (search) {
    const terms = search.toLowerCase().split(/[\s,]+/).filter(Boolean);
    const authorText = getAuthors(game).join(" ").toLowerCase();
    const matchesTerm = (term) =>
      game.title.toLowerCase().includes(term) ||
      authorText.includes(term) ||
      game.tags.some((t) => t.label.toLowerCase().includes(term)) ||
      (game.characters || []).some((c) => c.toLowerCase().includes(term));
    // every word must match somewhere, or multi-word authors match too loosely
    if (!terms.every(matchesTerm)) return false;
  }
  if (genres.size && !game.tags.some((t) => normalizeTagType(t.type) === "genre" && genres.has(t.label))) return false;
  if (tags.size && !game.tags.some((t) => tags.has(t.label))) return false;
  if (playtimes.size && !playtimes.has(game.playtime)) return false;
  if (statuses.size && !statuses.has(game.status)) return false;
  if (engines.size && !engines.has(game.engine)) return false;
  if (platforms.size && !(game.platforms || []).some((p) => platforms.has(p))) return false;

  return true;
}

async function initGamesPage() {
  const grid = document.getElementById("card-grid");
  const filterForm = document.getElementById("games-filter");
  if (!grid || !filterForm) return;

  const detail = initDetailPanel({ isGame: true });
  if (!detail) return;

  grid.innerHTML = renderSkeletonCards(6);

  let allGames = [];
  try {
    allGames = normalizeListData(await fetchJSON("data/games.json"), "games");
  } catch (err) {
    grid.innerHTML = `<p>Unable to load games.</p>`;
    console.error(err);
    return;
  }

  const itemMap = new Map(allGames.map((g) => [String(g.id), g]));

  const genreSet = new Set();
  const tagSet = new Set();
  const playtimeSet = new Set();
  const statusSet = new Set();
  const engineSet = new Set();
  const platformSet = new Set();

  const PLAYTIME_ORDER = ["<5 min", "5m-30m", "30m-2h", "2h-4h", "4h-10h", "10h+"];

  allGames.forEach((game) => {
    (game.tags || []).forEach((t) => {
      // genres have their own filter section, keep them out of the tag chips
      if (normalizeTagType(t.type) === "genre") genreSet.add(t.label);
      else tagSet.add(t.label);
    });
    if (game.playtime) playtimeSet.add(game.playtime);
    if (game.status) statusSet.add(game.status);
    if (game.engine) engineSet.add(game.engine);
    (game.platforms || []).forEach((p) => platformSet.add(p));
  });

  // Active selections (Sets for multi-select)
  const active = {
    genres: new Set(),
    tags: new Set(),
    playtimes: new Set(),
    statuses: new Set(),
    engines: new Set(),
    platforms: new Set(),
  };

  const searchInput = document.getElementById("filter-search");
  const resultsEl = document.getElementById("filter-results");
  const clearBtn = document.getElementById("filter-clear");
  const nsfwToggle = document.getElementById("filter-nsfw");
  const sortSelect = document.getElementById("filter-sort");
  const perPageSelect = document.getElementById("filter-perpage");
  const paginationNav = document.getElementById("games-pagination");
  const prevPageBtn = document.getElementById("games-prev");
  const nextPageBtn = document.getElementById("games-next");
  const pageInfoEl = document.getElementById("games-page-info");

  let currentPage = 1;

  function getPerPage() {
    const v = perPageSelect ? perPageSelect.value : "50";
    return v === "all" ? Infinity : parseInt(v, 10);
  }

  function getFilters() {
    return {
      search: searchInput ? searchInput.value.trim() : "",
      genres: active.genres,
      tags: active.tags,
      playtimes: active.playtimes,
      statuses: active.statuses,
      engines: active.engines,
      platforms: active.platforms,
      showNsfw: nsfwToggle ? nsfwToggle.checked : false,
    };
  }

  function hasActiveFilters() {
    const f = getFilters();
    return f.search || f.genres.size || f.tags.size || f.playtimes.size
      || f.statuses.size || f.engines.size || f.platforms.size;
  }

  function clearAllFilters() {
    if (searchInput) searchInput.value = "";
    Object.values(active).forEach((s) => s.clear());
    buildTagFilterChips("filter-genre-chips", genreSet, active.genres, applyFilters);
    buildTagFilterChips("filter-tag-chips", tagSet, active.tags, applyFilters);
    buildTagFilterChips("filter-playtime-chips", playtimeSet, active.playtimes, applyFilters, playtimeSort);
    buildTagFilterChips("filter-status-chips", statusSet, active.statuses, applyFilters);
    buildTagFilterChips("filter-engine-chips", engineSet, active.engines, applyFilters);
    buildTagFilterChips("filter-platform-chips", platformSet, active.platforms, applyFilters);
    applyFilters();
  }

  function renderGrid(games, animate = false) {
    if (games.length === 0) {
      grid.innerHTML = `
        <div class="games-empty games-empty--friendly">
          <p class="games-empty__title">No games match your filters</p>
          <p class="games-empty__text">Try removing some filters.</p>
          <button type="button" class="games-empty__btn" id="empty-clear-filters">Clear filters</button>
        </div>
      `;
      document.getElementById("empty-clear-filters")?.addEventListener("click", clearAllFilters);
      if (paginationNav) paginationNav.hidden = true;
    } else {
      const perPage = getPerPage();
      const totalPages = Math.max(1, Math.ceil(games.length / perPage));
      currentPage = Math.min(currentPage, totalPages);
      const start = (currentPage - 1) * perPage;
      const pageGames = Number.isFinite(perPage) ? games.slice(start, start + perPage) : games;

      grid.innerHTML = pageGames.map(renderGameCard).join("");
      if (animate) staggerCards(grid);

      if (paginationNav) {
        paginationNav.hidden = totalPages <= 1;
        if (prevPageBtn) prevPageBtn.disabled = currentPage <= 1;
        if (nextPageBtn) nextPageBtn.disabled = currentPage >= totalPages;
        if (pageInfoEl) pageInfoEl.textContent = `Page ${currentPage} of ${totalPages}`;
      }
    }
    animateCount(resultsEl, games.length);
    if (clearBtn) clearBtn.hidden = !hasActiveFilters();
  }

  function sortGames(games) {
    const sort = sortSelect ? sortSelect.value : "newest";
    const sorted = [...games];
    // bad dates parse to NaN and NaN comparisons no-op the sort, so pin
    // them to epoch 0 instead
    const parseDateSafe = (d) => {
      const t = new Date(d).getTime();
      return Number.isNaN(t) ? 0 : t;
    };
    switch (sort) {
      case "newest":  return sorted.sort((a, b) => parseDateSafe(b.dateAdded) - parseDateSafe(a.dateAdded));
      case "oldest":  return sorted.sort((a, b) => parseDateSafe(a.dateAdded) - parseDateSafe(b.dateAdded));
      case "az":      return sorted.sort((a, b) => a.title.localeCompare(b.title));
      case "za":      return sorted.sort((a, b) => b.title.localeCompare(a.title));
      case "release-newest": return sorted.sort((a, b) => compareReleaseDates(a, b, -1));
      case "release-oldest": return sorted.sort((a, b) => compareReleaseDates(a, b, 1));
      case "playtime-asc":  return sorted.sort((a, b) => parseMinutes(a.playtime) - parseMinutes(b.playtime));
      case "playtime-desc": return sorted.sort((a, b) => parseMinutes(b.playtime) - parseMinutes(a.playtime));
      default: return sorted;
    }
  }

  function applyFilters(animate = false, resetPage = true) {
    if (resetPage) currentPage = 1;
    const filtered = sortGames(allGames.filter((g) => gameMatchesFilters(g, getFilters())));
    renderGrid(filtered, animate);
  }

  function goToPage(page) {
    currentPage = page;
    applyFilters(false, false);
    grid.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // values not in PLAYTIME_ORDER ("Unknown" etc) go last
  const playtimeIndex = (v) => {
    const i = PLAYTIME_ORDER.indexOf(v);
    return i === -1 ? PLAYTIME_ORDER.length : i;
  };
  const playtimeSort = (a, b) => playtimeIndex(a) - playtimeIndex(b);

  buildTagFilterChips("filter-genre-chips", genreSet, active.genres, applyFilters);
  buildTagFilterChips("filter-tag-chips", tagSet, active.tags, applyFilters);
  buildTagFilterChips("filter-playtime-chips", playtimeSet, active.playtimes, applyFilters, playtimeSort);
  buildTagFilterChips("filter-status-chips", statusSet, active.statuses, applyFilters);
  buildTagFilterChips("filter-engine-chips", engineSet, active.engines, applyFilters);
  buildTagFilterChips("filter-platform-chips", platformSet, active.platforms, applyFilters);

  filterForm.addEventListener("submit", (e) => e.preventDefault());
  filterForm.addEventListener("input", () => applyFilters(false));
  filterForm.addEventListener("keyup", () => applyFilters(false));
  // "change" is needed for the <select>s, they don't always fire "input"
  filterForm.addEventListener("change", () => applyFilters(false));
  if (clearBtn) clearBtn.addEventListener("click", clearAllFilters);

  if (prevPageBtn) prevPageBtn.addEventListener("click", () => goToPage(currentPage - 1));
  if (nextPageBtn) nextPageBtn.addEventListener("click", () => goToPage(currentPage + 1));

  // Pre-fill search from URL param (e.g. clicking author from another page)
  const urlSearch = new URLSearchParams(window.location.search).get("search");
  if (urlSearch && searchInput) {
    searchInput.value = urlSearch;
  }

  bindCardInteractions(grid, itemMap, detail);
  // first render goes through applyFilters so the default sort applies
  applyFilters(true);

  // Auto-open panel from ?game=ID
  const urlGameId = new URLSearchParams(window.location.search).get("game");
  if (urlGameId) {
    const game = itemMap.get(String(urlGameId));
    if (game) detail.openPanel(game);
  }
}

/* ==========================================================================
   Resources Card Grid
   ========================================================================== */
async function initCardGrid(jsonPath) {
  const grid = document.getElementById("card-grid");
  if (!grid) return;

  const detail = initDetailPanel();
  if (!detail) return;

  grid.innerHTML = renderSkeletonCards(6);

  let items = [];
  try {
    items = normalizeListData(await fetchJSON(jsonPath), "resources");
  } catch (err) {
    grid.innerHTML = `<p>Unable to load content.</p>`;
    console.error(err);
    return;
  }

  const itemMap = new Map(items.map((item) => [String(item.id), item]));

  const searchInput = document.getElementById("resources-search");
  const resultsEl = document.getElementById("resource-filter-results");
  const clearBtn = document.getElementById("resource-filter-clear");
  const sortSelect = document.getElementById("resource-sort");

  const activeTags = new Set();
  const activeTypes = new Set();
  const activeLicenses = new Set();

  const allTags = new Set();
  const allTypes = new Set();
  const allLicenses = new Set();
  items.forEach((item) => {
    (item.tags || []).forEach((t) => allTags.add(t));
    if (item.type) allTypes.add(item.type);
    if (item.license) allLicenses.add(item.license);
  });

  function sortItems(list) {
    const sort = sortSelect ? sortSelect.value : "az";
    const sorted = [...list];
    switch (sort) {
      case "az":   return sorted.sort((a, b) => a.title.localeCompare(b.title));
      case "za":   return sorted.sort((a, b) => b.title.localeCompare(a.title));
      default:     return sorted;
    }
  }

  function hasActive() {
    return (searchInput?.value.trim()) || activeTags.size || activeTypes.size || activeLicenses.size;
  }

  function applyFilters(animate = false) {
    const q = searchInput ? searchInput.value.trim().toLowerCase() : "";
    const filtered = sortItems(items.filter((item) => {
      if (q) {
        const terms = q.split(/[\s,]+/).filter(Boolean);
        const matchesTerm = (term) =>
          item.title.toLowerCase().includes(term) ||
          (item.shortDescription || "").toLowerCase().includes(term) ||
          (item.tags || []).some((t) => t.toLowerCase().includes(term)) ||
          (item.type || "").toLowerCase().includes(term);
        if (!terms.every(matchesTerm)) return false;
      }
      if (activeTags.size && !(item.tags || []).some((t) => activeTags.has(t))) return false;
      if (activeTypes.size && !activeTypes.has(item.type)) return false;
      if (activeLicenses.size && !activeLicenses.has(item.license)) return false;
      return true;
    }));

    if (filtered.length) {
      grid.innerHTML = filtered.map(renderResourceCard).join("");
    } else if (items.length === 0) {
      // nothing published yet, different message than "filters matched nothing"
      grid.innerHTML = `
        <div class="games-empty games-empty--friendly">
          <p class="games-empty__title">Resources are coming soon!</p>
          <p class="games-empty__text">Check back later for free sprites, tilesets, music, and more.</p>
        </div>
      `;
    } else {
      grid.innerHTML = `<p style="color:var(--color-text-muted)">No resources match your filters.</p>`;
    }
    if (animate) staggerCards(grid);
    bindCardInteractions(grid, itemMap, detail);
    if (resultsEl) animateCount(resultsEl, filtered.length, "resource");
    if (clearBtn) clearBtn.hidden = !hasActive();
  }

  buildTagFilterChips("filter-resource-type-chips", allTypes, activeTypes, () => applyFilters(false));
  buildTagFilterChips("filter-resource-tag-chips", allTags, activeTags, () => applyFilters(false));
  buildTagFilterChips("filter-resource-license-chips", allLicenses, activeLicenses, () => applyFilters(false));

  if (searchInput) searchInput.addEventListener("input", () => applyFilters(false));
  if (sortSelect) sortSelect.addEventListener("change", () => applyFilters(false));
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      activeTags.clear();
      activeTypes.clear();
      activeLicenses.clear();
      buildTagFilterChips("filter-resource-type-chips", allTypes, activeTypes, () => applyFilters(false));
      buildTagFilterChips("filter-resource-tag-chips", allTags, activeTags, () => applyFilters(false));
      buildTagFilterChips("filter-resource-license-chips", allLicenses, activeLicenses, () => applyFilters(false));
      applyFilters(false);
    });
  }

  applyFilters(true);
}

/* ==========================================================================
   Jam History
   ========================================================================== */
async function initJamHistory() {
  const container = document.getElementById("jam-history");
  if (!container) return;

  container.innerHTML = renderSkeletonJamHistory(5);

  try {
    const jams = await fetchJSON("data/jams.json");

    container.innerHTML = jams
      .map(
        (jam, i) => `
        <a href="${jam.url}" class="jam-history__item jam-history__item--enter" style="animation-delay: ${i * 70}ms" target="_blank" rel="noopener noreferrer" title="${jam.name}">
          <img src="${jam.image}" alt="${jam.name}" loading="lazy" />
          <span class="jam-history__name">${jam.name}</span>
        </a>
      `
      )
      .join("");
  } catch (err) {
    container.innerHTML = `<p>Unable to load jam history.</p>`;
    console.error(err);
  }
}

/* ==========================================================================
   Mascot Lightbox (about.html)
   ========================================================================== */
function initMascotLightbox() {
  const trigger = document.querySelector(".about-mascot");
  const lightbox = document.getElementById("mascot-lightbox");
  if (!trigger || !lightbox) return;

  const closeBtn = lightbox.querySelector(".mascot-lightbox__close");

  function open() {
    lightbox.hidden = false;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => lightbox.classList.add("is-open"));
  }

  function close() {
    lightbox.classList.remove("is-open");
    document.body.style.overflow = "";
    setTimeout(() => { lightbox.hidden = true; }, 250);
  }

  trigger.addEventListener("click", open);
  trigger.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  });
  if (closeBtn) closeBtn.addEventListener("click", close);
  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && lightbox.classList.contains("is-open")) close();
  });
}

/* ==========================================================================
   Page Initialization
   ========================================================================== */
document.addEventListener("DOMContentLoaded", () => {
  const currentPage = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".site-nav a").forEach((link) => {
    const href = link.getAttribute("href");
    if (href === currentPage || (currentPage === "" && href === "index.html")) {
      link.classList.add("active");
    }
  });

  initGlobalJuice();
  initAuthorSearch();
  initSearchShortcut();
  initNewsBlog();
  initGameSidebar();
  initJamHistory();
  initMascotLightbox();

  if (document.getElementById("card-grid")?.dataset.type === "games") {
    initGamesPage();
  }

  if (document.getElementById("card-grid")?.dataset.type === "resources") {
    initCardGrid("data/resources.json");
  }
});
