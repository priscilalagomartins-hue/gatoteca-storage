import type { StoredVideo } from '../types/video';

const DB_NAME = 'gatoteca-storage';
const DB_VERSION = 1;
const VIDEO_STORE = 'videos';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(VIDEO_STORE)) {
        db.createObjectStore(VIDEO_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Falha ao abrir IndexedDB.'));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Falha no IndexedDB.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Falha na transação do IndexedDB.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Transação do IndexedDB cancelada.'));
  });
}

export async function getStoredVideos(): Promise<StoredVideo[]> {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(VIDEO_STORE, 'readonly');
    const store = transaction.objectStore(VIDEO_STORE);
    const videos = await requestToPromise<StoredVideo[]>(store.getAll());
    return videos.sort((a, b) => Date.parse(b.downloadedAt) - Date.parse(a.downloadedAt));
  } finally {
    db.close();
  }
}

export async function getStoredVideo(id: string): Promise<StoredVideo | undefined> {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(VIDEO_STORE, 'readonly');
    const store = transaction.objectStore(VIDEO_STORE);
    return await requestToPromise<StoredVideo | undefined>(store.get(id));
  } finally {
    db.close();
  }
}

export async function saveStoredVideo(video: StoredVideo): Promise<void> {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(VIDEO_STORE, 'readwrite');
    transaction.objectStore(VIDEO_STORE).put(video);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function deleteStoredVideo(id: string): Promise<void> {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(VIDEO_STORE, 'readwrite');
    transaction.objectStore(VIDEO_STORE).delete(id);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function clearStoredVideos(): Promise<void> {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(VIDEO_STORE, 'readwrite');
    transaction.objectStore(VIDEO_STORE).clear();
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export function getUsedBytes(videos: StoredVideo[]): number {
  return videos.reduce((total, video) => total + video.sizeBytes, 0);
}
