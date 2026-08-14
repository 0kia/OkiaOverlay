const CLIENT_ID = localStorage.getItem('spotify_client_id');
const REDIRECT_URI = 'https://0kia.github.io/OkiaOverlay/pages/callback.html';
const OVERLAY_URL = 'https://0kia.github.io/OkiaOverlay/pages/overlay.html';

const statusEl = document.getElementById('status');
const optionsPanel = document.getElementById('options-panel');
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
  }

  updateOverlayUrl();

  optionsPanel.classList.remove('hidden');

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
  [showAlbumArtCheckbox, capsArtistCheckbox, capsTrackCheckbox, flipOrderCheckbox, transitionStyleSelect]
    .forEach(el => el.addEventListener('change', updateOverlayUrl));

  autohideDurationInput.addEventListener('input', updateOverlayUrl);

  enableAutohideCheckbox.addEventListener('change', () => {
    syncAutohideDependents();
    updateOverlayUrl();
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