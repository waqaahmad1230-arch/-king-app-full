export const saveToHistory = (video: any) => {
  if (!video) return;
  const history = JSON.parse(localStorage.getItem('king_watch_history') || '[]');
  
  const videoId = video.id || video.videoId || video.public_id || (video.videoUrl ? String(video.videoUrl) : String(Date.now()));
  const title = video.title || video.name || 'Untitled Video';
  const videoUrl = video.videoUrl || video.url || '';
  const thumbnailUrl = video.thumbnailUrl || video.thumbnail || video.img || (videoUrl ? videoUrl.replace(/\.[^/.]+$/, ".jpg") : '');

  const historyItem = {
    videoId,
    title,
    thumbnailUrl,
    videoUrl,
    watchedAt: new Date().toISOString(),
  };

  // Remove if exists to re-add to front (most recent)
  const filteredHistory = history.filter((item: any) => item.videoId !== historyItem.videoId);
  
  const newHistory = [historyItem, ...filteredHistory];
  localStorage.setItem('king_watch_history', JSON.stringify(newHistory));
  
  console.log("Video Added To History", historyItem);
};

export const getHistory = () => {
  const history = JSON.parse(localStorage.getItem('king_watch_history') || '[]');
  console.log("History Loaded", history);
  console.log("Total History Items", history.length);
  return history;
};

export const clearHistory = () => {
  localStorage.removeItem('king_watch_history');
  console.log("History Loaded", []);
  console.log("Total History Items", 0);
};
