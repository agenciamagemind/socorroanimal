const videos = [...document.querySelectorAll('.hero__video-player')];
const mobile = matchMedia('(max-width: 768px)');

// Only the player visible at the current breakpoint should keep playing.
videos.forEach(video => video.addEventListener('play', () => {
  videos.forEach(other => { if (other !== video) other.pause(); });
}));
mobile.addEventListener('change', () => {
  videos.forEach(video => {
    const isMobilePlayer = Boolean(video.closest('.hero__media-card--mobile'));
    if (isMobilePlayer !== mobile.matches) video.pause();
  });
});
