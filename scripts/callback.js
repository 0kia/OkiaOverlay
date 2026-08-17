const CLIENT_ID = localStorage.getItem('spotify_client_id');
const REDIRECT_URI = 'https://0kia.github.io/OkiaOverlay/pages/callback.html';
const OVERLAY_URL = 'https://0kia.github.io/OkiaOverlay/pages/overlay.html';

const statusEl = document.getElementById('status');
const optionsPanel = document.getElementById('options-panel');
const previewSection = document.getElementById('preview-section');
const previewReplayButton = document.getElementById('preview-replay');
const previewSongEl = document.getElementById('song');
const previewSongTextEl = document.getElementById('song-text');
const previewAlbumArtEl = document.getElementById('album-art');
const previewArtistEl = document.getElementById('artist');
const previewTrackEl = document.getElementById('track');

// Mirrors overlay.js's resetScrolling/setupScrolling/setupContinuousScrolling/
// applyScroll exactly, just operating on the preview's own elements — kept
// here (rather than including overlay.js on this page) since overlay.js also
// polls the real Spotify API, which we don't want running on this page.
const previewScroll = {
  reset(element) {
    element.classList.remove('scrolling', 'scrolling-continuous');
    element.style.removeProperty('--scroll-distance');
    element.style.removeProperty('--continuous-start');
    element.style.removeProperty('--continuous-end');
    element.style.removeProperty('animation-duration');
  },

  setupShuttle(element, { onlyIfOverflowing = true, duration = null } = {}) {
    this.reset(element);

    requestAnimationFrame(() => {
      const distance = Math.max(0, element.scrollWidth - element.clientWidth);

      if (onlyIfOverflowing && distance === 0) {
        return;
      }

      element.style.setProperty('--scroll-distance', `-${distance}px`);

      if (duration !== null) {
        element.style.setProperty('animation-duration', `${duration}s`);
      }

      element.classList.add('scrolling');
    });
  },

  setupContinuous(element, { onlyIfOverflowing = false } = {}) {
    this.reset(element);

    requestAnimationFrame(() => {
      const windowWidth = element.clientWidth;
      const contentWidth = element.scrollWidth;

      if (onlyIfOverflowing && contentWidth <= windowWidth) {
        return;
      }

      const totalDistance = windowWidth + contentWidth;
      const duration = totalDistance / 80; // px/sec, matches CONTINUOUS_SCROLL_SPEED_PX_PER_SEC in overlay.js

      element.style.setProperty('--continuous-start', `${windowWidth}px`);
      element.style.setProperty('--continuous-end', `-${contentWidth}px`);
      element.style.setProperty('animation-duration', `${duration}s`);
      element.classList.add('scrolling-continuous');
    });
  },

  apply(element, enabled, type, trigger, autohideOn, duration) {
    if (autohideOn) {
      this.setupShuttle(element, { duration });
      return;
    }

    if (!enabled) {
      this.reset(element);
      return;
    }

    const onlyIfOverflowing = trigger === 'song_length';

    if (type === 'continuous') {
      this.setupContinuous(element, { onlyIfOverflowing });
    } else {
      this.setupShuttle(element, { onlyIfOverflowing });
    }
  }
};

// display album art option
const showAlbumArtCheckbox = document.getElementById('show-album-art');
// auto-hide option
const enableAutohideCheckbox = document.getElementById('enable-autohide');
// transition style option (only usable while autohide is on)
const transitionStyleSelect = document.getElementById('transition-style');
const transitionOption = document.getElementById('transition-option');
// autohide duration option (only usable while autohide is on)
const autohideDurationInput = document.getElementById('autohide-duration');
const durationOption = document.getElementById('duration-option');
// background color option
const enableBgColorCheckbox = document.getElementById('enable-bg-color');
const bgColorPicker = document.getElementById('bg-color-picker');
// text area width option
const textWidthInput = document.getElementById('text-width');
// capitalize options
const capsArtistCheckbox = document.getElementById('caps-artist');
const capsTrackCheckbox = document.getElementById('caps-track');
// flip order option
const flipOrderCheckbox = document.getElementById('flip-order');

// Title/artist scroll options: each is enable + Scroll Type (Shuttle/
// Continuous) + Trigger (Song length/Always), and all of it is only usable
// while autohide is off — while autohide is on these get disabled and the
// Scroll Type resets to Shuttle (see syncScrollFieldAvailability below).
const scrollFields = [
  {
    prefix: 'title',
    enableCheckbox: document.getElementById('title-scroll'),
    enableOption: document.getElementById('title-scroll-option'),
    typeSelect: document.getElementById('title-scroll-type'),
    typeOption: document.getElementById('title-scroll-type-option'),
    triggerSelect: document.getElementById('title-trigger'),
    triggerOption: document.getElementById('title-trigger-option')
  },
  {
    prefix: 'artist',
    enableCheckbox: document.getElementById('artist-scroll'),
    enableOption: document.getElementById('artist-scroll-option'),
    typeSelect: document.getElementById('artist-scroll-type'),
    typeOption: document.getElementById('artist-scroll-type-option'),
    triggerSelect: document.getElementById('artist-trigger'),
    triggerOption: document.getElementById('artist-trigger-option')
  }
];

const titleField = scrollFields.find(f => f.prefix === 'title');
const artistField = scrollFields.find(f => f.prefix === 'artist');

const params = new URLSearchParams(window.location.search);
const code = params.get('code');

let overlayUrl = '';

async function exchangeCodeForToken(code) {
  const verifier = localStorage.getItem('pkce_verifier');

  if (!verifier) {
    statusEl.textContent =
      'Login failed — PKCE verifier not found. Please go back and try again.';
    return;
  }

  const tokenParams = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier
  });

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: tokenParams.toString()
  });

  if (!res.ok) {
    statusEl.textContent =
      'Login failed — check your Client ID and redirect URI.';
    return;
  }

  const data = await res.json();

  function updateOverlayUrl() {
    const urlParams = {
      refresh_token: data.refresh_token,
      client_id: CLIENT_ID,
      album_art: showAlbumArtCheckbox.checked,
      autohide: enableAutohideCheckbox.checked
    };

    if (enableBgColorCheckbox.checked) {
      urlParams.bg_color = bgColorPicker.value;
    }

    const widthValue = parseInt(textWidthInput.value, 10);
    if (!isNaN(widthValue) && widthValue !== 400) {
      urlParams.width = widthValue;
    }

    if (capsArtistCheckbox.checked) {
      urlParams.caps_artist = true;
    }

    if (capsTrackCheckbox.checked) {
      urlParams.caps_track = true;
    }

    if (transitionStyleSelect.value !== 'fade') {
      urlParams.transition = transitionStyleSelect.value;
    }

    const durationValue = parseFloat(autohideDurationInput.value);
    if (!isNaN(durationValue) && durationValue !== 7) {
      urlParams.autohide_duration = durationValue;
    }

    if (flipOrderCheckbox.checked) {
      urlParams.flip = true;
    }

    scrollFields.forEach(field => {
      urlParams[`${field.prefix}_scroll`] = field.enableCheckbox.checked;

      if (field.enableCheckbox.checked && !enableAutohideCheckbox.checked) {
        if (field.typeSelect.value !== 'shuttle') {
          urlParams[`${field.prefix}_scroll_type`] = field.typeSelect.value;
        }

        if (field.triggerSelect.value !== 'song_length') {
          urlParams[`${field.prefix}_trigger`] = field.triggerSelect.value;
        }
      }
    });

    overlayUrl = OVERLAY_URL + '?' + new URLSearchParams(urlParams).toString();

    updatePreview();
  }

  function updatePreview() {
    const widthValue = parseInt(textWidthInput.value, 10);
    const durationValue = parseFloat(autohideDurationInput.value);
    const duration = (!isNaN(durationValue) && durationValue > 0) ? durationValue : 7;

    previewSongEl.style.backgroundColor = enableBgColorCheckbox.checked ? bgColorPicker.value : 'transparent';

    if (!isNaN(widthValue) && widthValue > 0) {
      previewSongTextEl.style.width = widthValue + 'px';
      previewSongEl.style.maxWidth = 'none';
    } else {
      previewSongTextEl.style.width = '400px';
      previewSongEl.style.maxWidth = '600px';
    }

    previewAlbumArtEl.style.display = showAlbumArtCheckbox.checked ? 'block' : 'none';

    previewArtistEl.classList.toggle('caps-text', capsArtistCheckbox.checked);
    previewTrackEl.classList.toggle('caps-text', capsTrackCheckbox.checked);

    previewSongTextEl.classList.toggle('song-flipped', flipOrderCheckbox.checked);

    previewSongEl.classList.remove('transition-none', 'transition-fade', 'transition-bounce');
    previewSongEl.classList.add('transition-' + transitionStyleSelect.value);

    const autohideOn = enableAutohideCheckbox.checked;

    previewScroll.apply(previewArtistEl, artistField.enableCheckbox.checked, artistField.typeSelect.value, artistField.triggerSelect.value, autohideOn, duration);
    previewScroll.apply(previewTrackEl, titleField.enableCheckbox.checked, titleField.typeSelect.value, titleField.triggerSelect.value, autohideOn, duration);
  }

  let previewLoopTimer = null;
  let previewLoopRunning = false;

  function stopPreviewLoop() {
    clearTimeout(previewLoopTimer);
    previewLoopTimer = null;
    previewLoopRunning = false;
  }

  function replayPreviewEntrance() {
    // Temporarily disable the transition so removing is-visible snaps
    // instantly to the fully hidden state, instead of starting an
    // interruptible exit animation that we then only let run for ~1 frame
    // — that was the cause of the tiny/incomplete bounce: the entrance was
    // animating from wherever the exit transition had gotten to after 32ms,
    // not from the true starting position.
    previewSongEl.style.transition = 'none';
    previewSongEl.classList.remove('is-visible');
    void previewSongEl.offsetWidth; // commit the instant jump to the hidden state

    previewSongEl.style.transition = ''; // hand control back to the CSS class's transition

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        previewSongEl.classList.add('is-visible');
      });
    });
  }

  function runPreviewCycle() {
    if (!enableAutohideCheckbox.checked) {
      previewLoopRunning = false;
      return;
    }

    replayPreviewEntrance();

    const durationValue = parseFloat(autohideDurationInput.value);
    const visibleDuration = (!isNaN(durationValue) && durationValue > 0) ? durationValue : 7;

    previewLoopTimer = setTimeout(() => {
      previewSongEl.classList.remove('is-visible');

      // Small fixed pause so the exit transition actually finishes playing
      // before the next entrance starts, rather than cutting it off.
      previewLoopTimer = setTimeout(runPreviewCycle, 600);
    }, visibleDuration * 1000);
  }

  function startPreviewLoop() {
    if (previewLoopRunning) {
      return;
    }

    previewLoopRunning = true;
    runPreviewCycle();
  }

  optionsPanel.classList.remove('hidden');
  previewSection.classList.remove('hidden');

  updateOverlayUrl();

  if (enableAutohideCheckbox.checked) {
    startPreviewLoop();
  } else {
    replayPreviewEntrance();
  }

  previewReplayButton.addEventListener('click', () => {
    if (enableAutohideCheckbox.checked) {
      stopPreviewLoop();
      startPreviewLoop();
    } else {
      replayPreviewEntrance();
    }
  });

  function syncScrollFieldAvailability(field) {
    const autohideOn = enableAutohideCheckbox.checked;

    field.enableCheckbox.disabled = autohideOn;
    field.enableOption.classList.toggle('option-row--disabled', autohideOn);

    if (autohideOn) {
      field.enableCheckbox.checked = false;
      field.typeSelect.value = 'shuttle';
    }

    const nestedVisible = field.enableCheckbox.checked && !autohideOn;
    field.typeOption.classList.toggle('hidden', !nestedVisible);
    field.triggerOption.classList.toggle('hidden', !nestedVisible);
  }

  function syncAutohideDependents() {
    transitionOption.classList.toggle('hidden', !enableAutohideCheckbox.checked);
    durationOption.classList.toggle('hidden', !enableAutohideCheckbox.checked);
    scrollFields.forEach(syncScrollFieldAvailability);
  }

  syncAutohideDependents();

  // Every simple option just needs to regenerate the link on change/input.
  [showAlbumArtCheckbox, capsArtistCheckbox, capsTrackCheckbox, flipOrderCheckbox]
    .forEach(el => el.addEventListener('change', updateOverlayUrl));

  transitionStyleSelect.addEventListener('change', () => {
    updateOverlayUrl();

    // Force the newly selected transition to actually play immediately,
    // instead of sitting inert until the next scheduled autohide cycle.
    if (enableAutohideCheckbox.checked) {
      stopPreviewLoop();
      startPreviewLoop();
    } else {
      replayPreviewEntrance();
    }
  });

  autohideDurationInput.addEventListener('input', updateOverlayUrl);

  enableAutohideCheckbox.addEventListener('change', () => {
    syncAutohideDependents();
    updateOverlayUrl();

    if (enableAutohideCheckbox.checked) {
      startPreviewLoop();
    } else {
      stopPreviewLoop();
      replayPreviewEntrance();
    }
  });

  scrollFields.forEach(field => {
    field.enableCheckbox.addEventListener('change', () => {
      syncScrollFieldAvailability(field);
      updateOverlayUrl();
    });
    field.typeSelect.addEventListener('change', updateOverlayUrl);
    field.triggerSelect.addEventListener('change', updateOverlayUrl);
  });

  bgColorPicker.addEventListener('input', updateOverlayUrl);
  textWidthInput.addEventListener('input', updateOverlayUrl);

  enableBgColorCheckbox.addEventListener('change', () => {
    bgColorPicker.disabled = !enableBgColorCheckbox.checked;
    updateOverlayUrl();
  });

  statusEl.innerHTML =
    'Paste this into your OBS browser source (DO NOT LEAK):<br><br>' +
    '<code id="overlay-link">' +
    '*'.repeat(40) +
    '</code><br><br>' +
    '<button id="copy-link">Copy link</button>';

  document.getElementById('copy-link').addEventListener('click', () => {
    navigator.clipboard.writeText(overlayUrl);
  });

  window.history.replaceState({}, document.title, REDIRECT_URI);
}

if (!CLIENT_ID) {
  statusEl.textContent =
    'No Spotify Client ID found — go back and enter your Client ID.';
} else if (code) {
  exchangeCodeForToken(code);
} else {
  statusEl.textContent =
    'No login code found — go back to the home page and log in again.';
}