export interface DownloadHandle {
  promise: Promise<Blob>;
  cancel: () => void;
}

export function downloadBlob(url: string, onProgress: (progress: number) => void): DownloadHandle {
  const xhr = new XMLHttpRequest();

  const promise = new Promise<Blob>((resolve, reject) => {
    xhr.open('GET', url);
    xhr.responseType = 'blob';

    xhr.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(event.loaded / event.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300 && xhr.response instanceof Blob) {
        onProgress(1);
        resolve(xhr.response);
      } else {
        reject(new Error('O link desse vídeo parece inválido.'));
      }
    };

    xhr.onerror = () => reject(new Error('O download foi interrompido.'));
    xhr.onabort = () => reject(new Error('Downloads cancelados.'));
    xhr.send();
  });

  return {
    promise,
    cancel: () => xhr.abort()
  };
}
