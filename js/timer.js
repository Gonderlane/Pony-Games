/**
 * Jam Timer - js/timer.js
 *
 * Primary config source: data/jam-config.json
 * Fallback config below keeps the timer working if JSON fails to load.
 */

const JAM_CONFIG_FALLBACK = {
  state: "upcoming",
  lastJamUrl: "https://example.com/last-jam",
  lastJamLabel: "Spring Pony Jam 2025",
  startDate: "2026-06-15T00:00:00",
  endDate: "2026-06-22T23:59:59",
  currentJamUrl: "https://example.com/current-jam",
  currentJamLabel: "Summer Pony Jam 2026",
  messages: {
    none: "No jam running right now. Check back soon!",
    upcoming: "Next jam starts in",
    active: "Jam ends in",
    complete: "Jam is live!",
    ended: "Jam has ended!",
  },
};

const UNIT_CONFIG = [
  { key: "days", label: "Days", max: 365 },
  { key: "hours", label: "Hours", max: 24 },
  { key: "minutes", label: "Min", max: 60 },
  { key: "seconds", label: "Sec", max: 60 },
];

const RING_RADIUS = 36;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

async function loadJamConfig() {
  try {
    const response = await fetch("data/jam-config.json");
    if (!response.ok) throw new Error("bad response");
    const data = await response.json();
    return {
      ...JAM_CONFIG_FALLBACK,
      ...data,
      messages: {
        ...JAM_CONFIG_FALLBACK.messages,
        ...(data?.messages || {}),
      },
    };
  } catch (err) {
    console.warn("timer.js: using fallback config because jam-config.json failed to load.");
    return JAM_CONFIG_FALLBACK;
  }
}

function initJamTimer(config) {
  const container = document.getElementById("jam-timer");
  if (!container) return;

  const statusEl = container.querySelector(".jam-timer__status");
  const messageEl = container.querySelector(".jam-timer__message");
  const countdownEl = container.querySelector(".jam-timer__countdown");
  const linkEl = container.querySelector(".jam-timer__link");

  let intervalId = null;
  let initialDiff = null;
  let previousValues = {};

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function buildRingSVG() {
    return `
      <svg class="jam-timer__ring-svg" viewBox="0 0 80 80" aria-hidden="true">
        <circle class="jam-timer__ring-bg" cx="40" cy="40" r="${RING_RADIUS}" />
        <circle class="jam-timer__ring-progress" cx="40" cy="40" r="${RING_RADIUS}"
          stroke-dasharray="${RING_CIRCUMFERENCE}"
          stroke-dashoffset="${RING_CIRCUMFERENCE}" />
      </svg>
    `;
  }

  function buildCountdownShell() {
    countdownEl.innerHTML = `
      <div class="jam-timer__arc-wrap" aria-hidden="true">
        <svg class="jam-timer__arc" viewBox="0 0 200 100">
          <defs>
            <linearGradient id="jam-arc-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#f39c12" />
              <stop offset="50%" stop-color="#e94560" />
              <stop offset="100%" stop-color="#9b59b6" />
            </linearGradient>
          </defs>
          <path class="jam-timer__arc-track" d="M 20 90 A 80 80 0 0 1 180 90" />
          <path class="jam-timer__arc-fill" d="M 20 90 A 80 80 0 0 1 180 90"
            stroke="url(#jam-arc-gradient)" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" />
        </svg>
        <div class="jam-timer__arc-icon" aria-hidden="true">☀</div>
      </div>
      <div class="jam-timer__units">
        ${UNIT_CONFIG.map(
          (u) => `
          <div class="jam-timer__unit" data-unit="${u.key}">
            <div class="jam-timer__ring">
              ${buildRingSVG()}
              <span class="jam-timer__digit">00</span>
            </div>
            <span class="jam-timer__label">${u.label}</span>
          </div>
        `
        ).join("")}
      </div>
    `;
  }

  function updateRing(unitEl, value, max) {
    const ring = unitEl.querySelector(".jam-timer__ring-progress");
    if (!ring) return;
    const progress = Math.min(1, Math.max(0, value / max));
    ring.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - progress));
  }

  function updateFlipDigit(unitEl, unitKey, newValue, usePad) {
    const display = usePad ? pad(newValue) : String(newValue);
    if (previousValues[unitKey] === newValue) return;
    previousValues[unitKey] = newValue;
    const digitEl = unitEl.querySelector(".jam-timer__digit");
    if (!digitEl) return;
    digitEl.textContent = display;
  }

  function updateArc(diff) {
    const fill = countdownEl.querySelector(".jam-timer__arc-fill");
    const icon = countdownEl.querySelector(".jam-timer__arc-icon");
    if (!fill || initialDiff === null) return;

    const progress = Math.min(1, Math.max(0, 1 - diff / initialDiff));
    fill.style.strokeDashoffset = String(1 - progress);

    if (icon) {
      icon.textContent = progress > 0.5 ? "☀" : "☾";
      icon.style.opacity = String(0.5 + progress * 0.5);
      icon.style.transform = `rotate(${progress * 180}deg)`;
    }
  }

  function triggerComplete(state) {
    container.classList.add("jam-timer--complete");
    statusEl.textContent = state === "active" ? "Jam Live" : "Time's Up";
    messageEl.textContent =
      state === "active" ? config.messages.complete : config.messages.ended;
    countdownEl.classList.add("jam-timer__countdown--finished");

    if (state === "active" && config.currentJamUrl) {
      linkEl.hidden = false;
      linkEl.href = config.currentJamUrl;
      linkEl.textContent = `Go to ${config.currentJamLabel}`;
      linkEl.classList.add("jam-timer__link--pulse");
    }
  }

  function renderNoJam() {
    container.classList.remove("jam-timer--complete");
    countdownEl.hidden = true;
    countdownEl.classList.remove("jam-timer__countdown--finished");
    statusEl.textContent = "No Jam";
    messageEl.textContent = config.messages.none;
    linkEl.hidden = false;
    linkEl.href = config.lastJamUrl;
    linkEl.textContent = `View ${config.lastJamLabel}`;
    linkEl.classList.remove("jam-timer__link--pulse");
  }

  function renderCountdown(targetDate, statusLabel, messageText, linkConfig, completeState) {
    container.classList.remove("jam-timer--complete");
    countdownEl.hidden = false;
    countdownEl.classList.remove("jam-timer__countdown--finished");
    statusEl.textContent = statusLabel;
    messageEl.textContent = messageText;
    initialDiff = null;
    previousValues = {};

    if (linkConfig) {
      linkEl.hidden = false;
      linkEl.href = linkConfig.url;
      linkEl.textContent = linkConfig.label;
      linkEl.classList.remove("jam-timer__link--pulse");
    } else {
      linkEl.hidden = true;
      linkEl.classList.remove("jam-timer__link--pulse");
    }

    buildCountdownShell();
    let daysMax = 30;

    function tick() {
      const now = Date.now();
      const target = new Date(targetDate).getTime();
      const diff = target - now;

      if (diff <= 0) {
        clearInterval(intervalId);
        triggerComplete(completeState);
        return;
      }

      if (initialDiff === null) {
        initialDiff = diff;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        daysMax = Math.max(days, 1);
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);
      const values = { days, hours, minutes, seconds };

      UNIT_CONFIG.forEach((u) => {
        const unitEl = countdownEl.querySelector(`[data-unit="${u.key}"]`);
        if (!unitEl) return;
        const max = u.key === "days" ? daysMax : u.max;
        updateRing(unitEl, values[u.key], max);
        updateFlipDigit(unitEl, u.key, values[u.key], u.key !== "days");
      });

      updateArc(diff);
    }

    if (intervalId) clearInterval(intervalId);
    tick();
    intervalId = setInterval(tick, 1000);
  }

  switch (config.state) {
    case "none":
      renderNoJam();
      break;
    case "upcoming":
      renderCountdown(
        config.startDate,
        "Upcoming Jam",
        config.messages.upcoming,
        null,
        "upcoming"
      );
      break;
    case "active":
      renderCountdown(
        config.endDate,
        "Jam Active",
        config.messages.active,
        { url: config.currentJamUrl, label: `Go to ${config.currentJamLabel}` },
        "active"
      );
      break;
    default:
      console.warn(`timer.js: Unknown state "${config.state}". Falling back to "none".`);
      renderNoJam();
  }
}

loadJamConfig().then(initJamTimer);
