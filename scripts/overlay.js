const params = new URLSearchParams(window.location.search);
const refreshToken = params.get('refresh_token');
const CLIENT_ID = params.get('client_id');
const showAlbumArt = params.get('album_art') !== 'false';
const enableAutohide = params.get('autohide') !== 'false';
const bgColor = params.get('bg_color'); // e.g. ?bg_color=%23121212 or ?bg_color=rgba(0,0,0,0.5)
const customWidth = parseInt(params.get('width'), 10); // e.g. ?width=600 — width in px of the artist/title text area
const capsArtist = params.get('caps_artist') === 'true';
const capsTrack = params.get('caps_track') === 'true';
const flipOrder = params.get('flip') === 'true'; // ?flip=true swaps the vertical order of artist/track
const validTransitions = ['none', 'fade', 'bounce'];
const transitionStyle = validTransitions.includes(params.get('transition'))
  ? params.get('transition')
  : 'fade'; // ?transition=none|fade|bounce
// Only makes sense while the card stays on screen permanently, so it's
// ignored if autohide is on (the UI also disables the checkbox in that case).
const continuousScroll = params.get('continuous') === 'true' && !enableAutohide;
const continuousMode = params.get('continuous_mode') === 'song_length' ? 'song_length' : 'always'; // 'always' = title always continuously scrolls; 'song_length' = only when it's actually too long to fit
const enableArtistScroll = params.get('artist_scroll') !== 'false';

const POLL_INTERVAL = 10000;
const VISIBLE_DURATION = 7000;
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

if (!isNaN(customWidth) && customWidth > 0) {
  songTextEl.style.width = customWidth + 'px';
  songEl.style.maxWidth = 'none';
}

artistEl.classList.toggle('caps-text', capsArtist);
trackEl.classList.toggle('caps-text', capsTrack);
songTextEl.classList.toggle('song-flipped', flipOrder);
songEl.classList.add('transition-' + transitionStyle);

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
  }, VISIBLE_DURATION);
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
    return;
  }

  currentTrackId = NO_SONG_ID;

  artistEl.textContent = '';
  trackEl.textContent = NO_SONG_TEXT;
  albumArtEl.style.display = 'none';

  if (enableArtistScroll) {
    setupScrolling(artistEl);
  } else {
    resetScrolling(artistEl);
  }
  continuousScroll ? setupContinuousScrolling(trackEl, { onlyIfOverflowing: continuousMode === 'song_length' }) : setupScrolling(trackEl);

  showThenFade();
}

function resetScrolling(element) {
  element.classList.remove('scrolling', 'scrolling-continuous');
  element.style.removeProperty('--scroll-distance');
  element.style.removeProperty('--continuous-start');
  element.style.removeProperty('--continuous-end');
  element.style.removeProperty('animation-duration');
}

function setupScrolling(element) {
  resetScrolling(element);

  requestAnimationFrame(() => {
    if (element.scrollWidth > element.clientWidth) {
      const distance = element.scrollWidth - element.clientWidth;

      element.style.setProperty('--scroll-distance', `-${distance}px`);
      element.classList.add('scrolling');
    }
  });
}

function setupContinuousScrolling(element, { onlyIfOverflowing = false } = {}) {
  resetScrolling(element);

  requestAnimationFrame(() => {
    const windowWidth = element.clientWidth;
    const contentWidth = element.scrollWidth;

    if (onlyIfOverflowing && contentWidth <= windowWidth) {
      return;
    }

    const totalDistance = windowWidth + contentWidth;
    const duration = totalDistance / CONTINUOUS_SCROLL_SPEED_PX_PER_SEC;

    element.style.setProperty('--continuous-start', `${windowWidth}px`);
    element.style.setProperty('--continuous-end', `-${contentWidth}px`);
    element.style.setProperty('animation-duration', `${duration}s`);
    element.classList.add('scrolling-continuous');
  });
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

      if (enableArtistScroll) {
        setupScrolling(artistEl);
      } else {
        resetScrolling(artistEl);
      }
      continuousScroll ? setupContinuousScrolling(trackEl, { onlyIfOverflowing: continuousMode === 'song_length' }) : setupScrolling(trackEl);

      showThenFade();
    }
  } catch (e) {
    console.error('Spotify request error:', e);
  }
}

updateSong();
setInterval(updateSong, POLL_INTERVAL);