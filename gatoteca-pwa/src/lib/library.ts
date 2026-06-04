import type { VideoItem } from '../types/video';

const LIBRARY_URL = '/library.json';

function isValidVideoItem(item: unknown): item is VideoItem {
  if (!item || typeof item !== 'object') {
    return false;
  }

  const video = item as VideoItem;
  return (
    typeof video.id === 'string' &&
    typeof video.title === 'string' &&
    typeof video.url === 'string' &&
    typeof video.sizeBytes === 'number' &&
    Number.isFinite(video.sizeBytes) &&
    video.sizeBytes > 0
  );
}

export async function fetchVideoLibrary(): Promise<VideoItem[]> {
  let response: Response;

  try {
    response = await fetch(LIBRARY_URL, { cache: 'no-store' });
  } catch {
    throw new Error('Sem internet ou lista online indisponivel por agora.');
  }

  if (!response.ok) {
    throw new Error('A lista online de videos nao respondeu como esperado.');
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new Error('A lista online veio em um formato que a Gatoteca nao reconhece.');
  }

  if (!Array.isArray(json)) {
    throw new Error('A lista online precisa ser um array de videos.');
  }

  const videos = json.filter(isValidVideoItem);
  if (videos.length === 0) {
    throw new Error('A lista online esta vazia por enquanto.');
  }

  return videos;
}
