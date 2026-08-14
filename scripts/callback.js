const CLIENT_ID = localStorage.getItem('spotify_client_id');
const REDIRECT_URI = 'https://0kia.github.io/OkiaOverlay/pages/callback.html';
const OVERLAY_URL = 'https://0kia.github.io/OkiaOverlay/pages/overlay.html';

const statusEl = document.getElementById('status');
const optionsPanel = document.getElementById('options-panel');
// display album art option
const showAlbumArtCheckbox = document.getElementById('show-album-art');
// auto-hide option
const enableAutohideCheckbox = document.getElementById('enable-autohide');
// transition style option
const transitionStyleSelect = document.getElementById('transition-style');
const transitionOption = document.getElementById('transition-option');
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
// continuous scroll option (only usable while autohide is off)
const continuousScrollCheckbox = document.getElementById('continuous-scroll');

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

    if (flipOrderCheckbox.checked) {
      urlParams.flip = true;
    }

    if (continuousScrollCheckbox.checked && !enableAutohideCheckbox.checked) {
      urlParams.continuous = true;
    }

    overlayUrl = OVERLAY_URL + '?' + new URLSearchParams(urlParams).toString();
  }

  updateOverlayUrl();

  optionsPanel.classList.remove('hidden');

  function syncAutohideDependents() {
    transitionOption.classList.toggle('hidden', !enableAutohideCheckbox.checked);
    continuousScrollCheckbox.disabled = enableAutohideCheckbox.checked;
  }

  syncAutohideDependents();

  // Every option just needs to regenerate the link on change/input, except
  // the bg-color checkbox which also enables/disables the color picker.
  [showAlbumArtCheckbox, enableAutohideCheckbox, capsArtistCheckbox, capsTrackCheckbox, flipOrderCheckbox, transitionStyleSelect, continuousScrollCheckbox]
    .forEach(el => el.addEventListener('change', updateOverlayUrl));

  enableAutohideCheckbox.addEventListener('change', syncAutohideDependents);

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