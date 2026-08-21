const params = new URLSearchParams(window.location.search);
const refreshToken = params.get('refresh_token');
const CLIENT_ID = params.get('client_id');
const showAlbumArt = params.get('album_art') !== 'false';
const enableAutohide = params.get('autohide') !== 'false';
const bgColor = params.get('bg_color'); // e.g. ?bg_color=%23121212 or ?bg_color=rgba(0,0,0,0.5)
const customBorderRadius = parseInt(params.get('border_radius'), 10); // px, only meaningful alongside bg_color
const customWidth = parseInt(params.get('width'), 10); // e.g. ?width=600 — width in px of the artist/title text area
const capsArtist = params.get('caps_artist') === 'true';
const capsTrack = params.get('caps_track') === 'true';
const flipOrder = params.get('flip') === 'true'; // ?flip=true swaps the vertical order of artist/track
const validTransitions = ['none', 'fade', 'bounce'];
const transitionStyle = validTransitions.includes(params.get('transition'))
  ? params.get('transition')
  : 'fade'; // ?transition=none|fade|bounce

// Loaded on demand from Google Fonts rather than relying on whatever's
// installed locally — system font availability varies a lot across
// Windows/macOS/Linux, so this keeps the look identical everywhere.
const FONT_OPTIONS = {
  default: { family: null, googleParam: null },
  montserrat: { family: 'Montserrat', googleParam: 'Montserrat:wght@400;500;600;700' },
  poppins: { family: 'Poppins', googleParam: 'Poppins:wght@400;500;600;700' },
  roboto: { family: 'Roboto', googleParam: 'Roboto:wght@400;500;700' },
  inter: { family: 'Inter', googleParam: 'Inter:wght@400;500;600;700' },
  bebas: { family: 'Bebas Neue', googleParam: 'Bebas+Neue' },
  oswald: { family: 'Oswald', googleParam: 'Oswald:wght@400;500;600;700' }
};
const fontChoice = Object.prototype.hasOwnProperty.call(FONT_OPTIONS, params.get('font'))
  ? params.get('font')
  : 'default'; // ?font=montserrat|poppins|roboto|inter|bebas|oswald

// Per-field scroll config. Each field (title/artist) is independently:
// enabled or static, Shuttle (back-and-forth) or Continuous (one-way
// ticker), and triggered Always or only when the text is too long to fit.
// All of this is ignored while autohide is on — see applyScroll() below.
const titleScrollEnabled = params.get('title_scroll') !== 'false';
const titleScrollType = params.get('title_scroll_type') === 'continuous' ? 'continuous' : 'shuttle';
const titleTrigger = params.get('title_trigger') === 'always' ? 'always' : 'song_length';

const artistScrollEnabled = params.get('artist_scroll') !== 'false';
const artistScrollType = params.get('artist_scroll_type') === 'continuous' ? 'continuous' : 'shuttle';
const artistTrigger = params.get('artist_trigger') === 'always' ? 'always' : 'song_length';

const parsedAutohideDuration = parseFloat(params.get('autohide_duration'));
const AUTOHIDE_DURATION = (!isNaN(parsedAutohideDuration) && parsedAutohideDuration > 0)
  ? parsedAutohideDuration
  : 7; // seconds — how long the card stays visible, and (while autohide is on) how long one shuttle-scroll cycle takes

const POLL_INTERVAL = 10000;
const CONTINUOUS_SCROLL_SPEED_PX_PER_SEC = 80; // constant travel speed regardless of title length
const NO_SONG_ID = '__no_song__'; // sentinel currentTrackId used for the empty state, distinct from any real Spotify track id and from the initial null
const NO_SONG_TEXT = 'No song playing';

const songEl = document.getElementById('song');
const songTextEl = document.getElementById('song-text');
const albumArtEl = document.getElementById('album-art');
const artistEl = document.getElementById('artist');
const trackEl = document.getElementById('track');

if (bgColor) {
  songEl.style.backgroundColor = bgColor;
}

if (!isNaN(customBorderRadius) && customBorderRadius >= 0) {
  songEl.style.borderRadius = customBorderRadius + 'px';
}

if (!isNaN(customWidth) && customWidth > 0) {
  songTextEl.style.width = customWidth + 'px';
  // The default max-width on #song is sized for the default 400px text
  // area; a custom width can legitimately need more (or less) room, so
  // let #song size itself to its content instead of being capped.
  songEl.style.maxWidth = 'none';
}

artistEl.classList.toggle('caps-text', capsArtist);
trackEl.classList.toggle('caps-text', capsTrack);
songTextEl.classList.toggle('song-flipped', flipOrder);
songEl.classList.add('transition-' + transitionStyle);

if (fontChoice !== 'default') {
  const font = FONT_OPTIONS[fontChoice];
  const fontLink = document.createElement('link');
  fontLink.rel = 'stylesheet';
  fontLink.href = `https://fonts.googleapis.com/css2?family=${font.googleParam}&display=swap`;
  document.head.appendChild(fontLink);
  songEl.style.fontFamily = `'${font.family}', sans-serif`;
}

// Force a reflow here so the browser fully commits the starting
// opacity:0/pre-transition state as a real rendered frame before anything
// else happens. Without this, on the very first load some browser engines
// (notably CEF, which OBS's Browser Source uses) can bundle the transition
// class and the first opacity change into the same initial paint, skipping
// the animation entirely — every change after that works fine because a
// real "opacity:0" frame has definitely been rendered by then.
void songEl.offsetWidth;

let hideTimer = null;
let currentTrackId = null;

let accessToken = null;
let accessTokenExpires = 0;

function showThenFade() {
  songEl.classList.add('is-visible');
  clearTimeout(hideTimer);

  if (!enableAutohide) {
    return;
  }

  hideTimer = setTimeout(() => {
    songEl.classList.remove('is-visible');
  }, AUTOHIDE_DURATION * 1000);
}

function showError(message) {
  artistEl.textContent = '';
  trackEl.textContent = message;
  albumArtEl.style.display = 'none';

  songEl.classList.add('is-visible');
  clearTimeout(hideTimer);
}

function showNoSongPlaying() {
  if (currentTrackId === NO_SONG_ID) {
    return; // already showing this state, don't restart the fade timer every poll
  }

  currentTrackId = NO_SONG_ID;

  artistEl.textContent = '';
  trackEl.textContent = NO_SONG_TEXT;
  albumArtEl.style.display = 'none';

  applyScroll(artistEl, artistScrollEnabled, artistScrollType, artistTrigger);
  applyScroll(trackEl, titleScrollEnabled, titleScrollType, titleTrigger);

  showThenFade();
}

function resetScrolling(element) {
  element.classList.remove('scrolling', 'scrolling-continuous');
  element.style.removeProperty('--scroll-distance');
  element.style.removeProperty('--continuous-start');
  element.style.removeProperty('--continuous-end');
  element.style.removeProperty('animation-duration');
}

function setupScrolling(element, { onlyIfOverflowing = true, duration = null } = {}) {
  resetScrolling(element);

  requestAnimationFrame(() => {
    const distance = Math.max(0, element.scrollWidth - element.clientWidth);

    if (onlyIfOverflowing && distance === 0) {
      return; // fits fine — leave it static instead of scrolling
    }

    element.style.setProperty('--scroll-distance', `-${distance}px`);

    if (duration !== null) {
      element.style.setProperty('animation-duration', `${duration}s`);
    }

    element.classList.add('scrolling');
  });
}

function setupContinuousScrolling(element, { onlyIfOverflowing = false } = {}) {
  resetScrolling(element);

  requestAnimationFrame(() => {
    // Starts fully off the right edge of the text area (element.clientWidth,
    // since the element's own box stays at its set width even though the
    // overflowing text paints past it) and ends fully off the left edge
    // (-element.scrollWidth), then jumps back to the start and repeats.
    const windowWidth = element.clientWidth;
    const contentWidth = element.scrollWidth;

    if (onlyIfOverflowing && contentWidth <= windowWidth) {
      return; // fits fine — leave it static instead of scrolling
    }

    const totalDistance = windowWidth + contentWidth;
    const duration = totalDistance / CONTINUOUS_SCROLL_SPEED_PX_PER_SEC;

    element.style.setProperty('--continuous-start', `${windowWidth}px`);
    element.style.setProperty('--continuous-end', `-${contentWidth}px`);
    element.style.setProperty('animation-duration', `${duration}s`);
    element.classList.add('scrolling-continuous');
  });
}

// Single entry point used for both fields. While autohide is on, all the
// per-field config is ignored entirely and both fields just get the
// original simple behavior: shuttle-scroll if (and only if) the text
// overflows, on the fixed 8s cycle defined in Overlay.css.
function applyScroll(element, enabled, type, trigger) {
  if (enableAutohide) {
    setupScrolling(element, { duration: AUTOHIDE_DURATION });
    return;
  }

  if (!enabled) {
    resetScrolling(element);
    return;
  }

  const onlyIfOverflowing = trigger === 'song_length';

  if (type === 'continuous') {
    setupContinuousScrolling(element, { onlyIfOverflowing });
  } else {
    setupScrolling(element, { onlyIfOverflowing });
  }
}


async function refreshAccessToken() {
  if (!refreshToken || !CLIENT_ID) {
    return null;
  }

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  });

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  if (!res.ok) {
    console.error('Refresh token request failed:', res.status);
    return null;
  }

  const data = await res.json();

  accessToken = data.access_token;
  accessTokenExpires = Date.now() + data.expires_in * 1000;

  return accessToken;
}

async function getValidToken() {
  if (accessToken && Date.now() < accessTokenExpires - 5000) {
    return accessToken;
  }

  return refreshAccessToken();
}

async function updateSong() {
  const token = await getValidToken();

  if (!token) {
    showError('Unable to authenticate with Spotify.');
    return;
  }

  try {
    const res = await fetch(
      'https://api.spotify.com/v1/me/player/currently-playing',
      {
        headers: {
          Authorization: 'Bearer ' + token
        }
      }
    );

    if (res.status === 204) {
      showNoSongPlaying();
      return;
    }

    if (!res.ok) {
      showError('Spotify request failed (' + res.status + ').');
      return;
    }

    const data = await res.json();

    if (!data || !data.item) {
      showNoSongPlaying();
      return;
    }

    if (data.item.id !== currentTrackId) {
      currentTrackId = data.item.id;

      artistEl.textContent = data.item.artists
        .map(a => a.name)
        .join(', ');

      trackEl.textContent = data.item.name;

      if (showAlbumArt) {
        const albumArt = data.item.album?.images?.[0]?.url;

        if (albumArt) {
          albumArtEl.src = albumArt;
          albumArtEl.style.display = 'block';
        } else {
          albumArtEl.style.display = 'none';
        }
      } else {
        albumArtEl.style.display = 'none';
      }

      applyScroll(artistEl, artistScrollEnabled, artistScrollType, artistTrigger);
      applyScroll(trackEl, titleScrollEnabled, titleScrollType, titleTrigger);

      showThenFade();
    }
  } catch (e) {
    console.error('Spotify request error:', e);
  }
}

updateSong();
setInterval(updateSong, POLL_INTERVAL);