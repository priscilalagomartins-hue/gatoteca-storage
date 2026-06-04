import { useEffect, useMemo, useRef, useState } from 'react';
import { clearStoredVideos, deleteStoredVideo, getStoredVideos, getUsedBytes, saveStoredVideo } from './lib/db';
import { downloadBlob, type DownloadHandle } from './lib/download';
import { formatBytes, formatDate } from './lib/format';
import { fetchVideoLibrary } from './lib/library';
import {
  DEFAULT_LIBRARY_URL,
  getLibraryUrl,
  getStorageLimit,
  saveLibraryUrl,
  saveStorageLimit,
  STORAGE_LIMIT_OPTIONS
} from './lib/settings';
import type { DownloadFailure, DownloadReport, StoredVideo, VideoItem } from './types/video';

type Screen = 'dashboard' | 'online' | 'downloads' | 'local' | 'settings' | 'install';

type QueueState = {
  isRunning: boolean;
  currentTitle: string;
  currentProgress: number;
  completed: number;
  total: number;
  failures: DownloadFailure[];
  report?: DownloadReport;
};

type DownloadPlan = {
  videos: VideoItem[];
  usedBytes: number;
  limitBytes: number;
  availableBytes: number;
  requiredBytes: number;
};

type PlayerState = {
  title: string;
  url: string;
};

const initialQueue: QueueState = {
  isRunning: false,
  currentTitle: '',
  currentProgress: 0,
  completed: 0,
  total: 0,
  failures: []
};

function App() {
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [storedVideos, setStoredVideos] = useState<StoredVideo[]>([]);
  const [onlineVideos, setOnlineVideos] = useState<VideoItem[]>([]);
  const [storageLimit, setStorageLimit] = useState(getStorageLimit);
  const [libraryUrl, setLibraryUrl] = useState(getLibraryUrl);
  const [customLimitGb, setCustomLimitGb] = useState((getStorageLimit() / 1024 / 1024 / 1024).toString());
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [message, setMessage] = useState('');
  const [queue, setQueue] = useState<QueueState>(initialQueue);
  const [pendingPlan, setPendingPlan] = useState<DownloadPlan | null>(null);
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const cancelRequested = useRef(false);
  const activeDownload = useRef<DownloadHandle | null>(null);

  const usedBytes = useMemo(() => getUsedBytes(storedVideos), [storedVideos]);
  const availableBytes = Math.max(storageLimit - usedBytes, 0);
  const downloadedIds = useMemo(() => new Set(storedVideos.map((video) => video.id)), [storedVideos]);
  const storagePercent = storageLimit > 0 ? Math.min((usedBytes / storageLimit) * 100, 100) : 0;

  useEffect(() => {
    refreshStoredVideos();
  }, []);

  useEffect(() => {
    const updateOnline = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  async function refreshStoredVideos() {
    try {
      setStoredVideos(await getStoredVideos());
    } catch {
      setMessage('Não foi possível abrir a cestinha local da Gatoteca.');
    }
  }

  async function loadOnlineLibrary(force = false): Promise<VideoItem[]> {
    if (!force && onlineVideos.length > 0) {
      return onlineVideos;
    }

    setIsLoadingLibrary(true);
    setMessage('');

    try {
      const videos = await fetchVideoLibrary(libraryUrl);
      setOnlineVideos(videos);
      return videos;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Não conseguimos carregar a biblioteca online.';
      setMessage(errorMessage);
      return [];
    } finally {
      setIsLoadingLibrary(false);
    }
  }

  function orderedCandidates(videos: VideoItem[]) {
    return videos
      .map((video, index) => ({ video, index }))
      .filter(({ video }) => !downloadedIds.has(video.id))
      .sort((left, right) => {
        const leftPriority = left.video.priority;
        const rightPriority = right.video.priority;

        if (leftPriority !== undefined && rightPriority !== undefined) {
          return leftPriority === rightPriority ? left.index - right.index : leftPriority - rightPriority;
        }

        if (leftPriority !== undefined) {
          return -1;
        }

        if (rightPriority !== undefined) {
          return 1;
        }

        return left.index - right.index;
      })
      .map(({ video }) => video);
  }

  async function prepareDownloadEverything() {
    const videos = await loadOnlineLibrary();
    if (videos.length === 0) {
      return;
    }

    await refreshStoredVideos();

    const freshVideos = await getStoredVideos();
    const freshUsedBytes = getUsedBytes(freshVideos);
    let remaining = Math.max(storageLimit - freshUsedBytes, 0);
    const freshDownloadedIds = new Set(freshVideos.map((video) => video.id));
    const selected: VideoItem[] = [];

    for (const video of orderedCandidates(videos).filter((video) => !freshDownloadedIds.has(video.id))) {
      if (video.sizeBytes <= remaining) {
        selected.push(video);
        remaining -= video.sizeBytes;
      }
    }

    if (selected.length === 0) {
      setMessage('Não encontramos vídeos novos que caibam no limite atual da Gatoteca.');
      return;
    }

    setPendingPlan({
      videos: selected,
      usedBytes: freshUsedBytes,
      limitBytes: storageLimit,
      availableBytes: Math.max(storageLimit - freshUsedBytes, 0),
      requiredBytes: selected.reduce((total, video) => total + video.sizeBytes, 0)
    });
  }

  async function startSingleDownload(video: VideoItem) {
    if (downloadedIds.has(video.id)) {
      setMessage('Esse vídeo já está salvo na Gatoteca.');
      return;
    }

    if (video.sizeBytes > availableBytes) {
      setMessage('Esse vídeo é grandinho demais para o limite livre de agora.');
      return;
    }

    await startQueue([video]);
  }

  async function startQueue(videos: VideoItem[]) {
    setScreen('downloads');
    setMessage('');
    setPendingPlan(null);
    cancelRequested.current = false;

    const failures: DownloadFailure[] = [];
    let succeeded = 0;
    let processed = 0;

    setQueue({
      isRunning: true,
      currentTitle: '',
      currentProgress: 0,
      completed: 0,
      total: videos.length,
      failures
    });

    for (const video of videos) {
      if (cancelRequested.current) {
        break;
      }

      try {
        setQueue((current) => ({
          ...current,
          currentTitle: video.title,
          currentProgress: 0
        }));

        const latestVideos = await getStoredVideos();
        const latestUsedBytes = getUsedBytes(latestVideos);

        if (latestVideos.some((stored) => stored.id === video.id)) {
          processed += 1;
          setQueue((current) => ({ ...current, completed: processed }));
          continue;
        }

        if (latestUsedBytes + video.sizeBytes > storageLimit) {
          throw new Error('Esse vídeo é grandinho demais para o limite livre de agora.');
        }

        const handle = downloadBlob(video.url, (progress) => {
          setQueue((current) => ({ ...current, currentProgress: progress }));
        });

        activeDownload.current = handle;
        const blob = await handle.promise;
        activeDownload.current = null;

        const actualSize = blob.size || video.sizeBytes;
        const usedAfterDownload = getUsedBytes(await getStoredVideos()) + actualSize;

        if (usedAfterDownload > storageLimit) {
          throw new Error('O arquivo baixado ficou maior que o espaço reservado para a Gatoteca.');
        }

        await saveStoredVideo({
          id: video.id,
          title: video.title,
          url: video.url,
          sizeBytes: actualSize,
          downloadedAt: new Date().toISOString(),
          blob
        });

        succeeded += 1;
      } catch (error) {
        activeDownload.current = null;

        if (cancelRequested.current) {
          break;
        }

        failures.push({
          id: video.id,
          title: video.title,
          message: error instanceof Error ? error.message : 'Download interrompido.'
        });
      } finally {
        if (!cancelRequested.current) {
          processed += 1;
          setQueue((current) => ({
            ...current,
            completed: processed,
            failures: [...failures]
          }));
        }
      }
    }

    const refreshed = await getStoredVideos();
    const report: DownloadReport = {
      succeeded,
      failed: [...failures],
      cancelled: cancelRequested.current,
      usedBytes: getUsedBytes(refreshed)
    };

    setStoredVideos(refreshed);
    setQueue({
      isRunning: false,
      currentTitle: '',
      currentProgress: 0,
      completed: processed,
      total: videos.length,
      failures: [...failures],
      report
    });
  }

  function cancelDownloads() {
    cancelRequested.current = true;
    activeDownload.current?.cancel();
    activeDownload.current = null;
  }

  async function playVideo(video: StoredVideo) {
    closePlayer();
    const objectUrl = URL.createObjectURL(video.blob);
    setPlayer({ title: video.title, url: objectUrl });
  }

  function closePlayer() {
    if (player) {
      URL.revokeObjectURL(player.url);
    }
    setPlayer(null);
  }

  async function removeVideo(video: StoredVideo) {
    if (!window.confirm('Tem certeza que deseja apagar este vídeo baixado pela Gatoteca?')) {
      return;
    }

    await deleteStoredVideo(video.id);
    await refreshStoredVideos();
  }

  async function removeAllVideos() {
    if (!window.confirm('Tem certeza que deseja apagar todos os vídeos baixados pela Gatoteca?')) {
      return;
    }

    await clearStoredVideos();
    await refreshStoredVideos();
  }

  function updateLimit(nextLimit: number) {
    setStorageLimit(nextLimit);
    setCustomLimitGb((nextLimit / 1024 / 1024 / 1024).toString());
    saveStorageLimit(nextLimit);
  }

  function saveCustomLimit() {
    const parsed = Number(customLimitGb.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setMessage('Escolha um limite personalizado maior que zero.');
      return;
    }

    updateLimit(parsed * 1024 * 1024 * 1024);
    setMessage('Limite personalizado salvo.');
  }

  function saveRemoteUrl() {
    const nextUrl = libraryUrl.trim() || DEFAULT_LIBRARY_URL;
    setLibraryUrl(nextUrl);
    saveLibraryUrl(nextUrl);
    setOnlineVideos([]);
    setMessage('URL da biblioteca online salva.');
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Gatoteca Storage PWA</p>
          <h1>Espaço para mais ronrons</h1>
        </div>
        <div className="paw-mark" aria-hidden="true">
          🐾
        </div>
      </header>

      {!isOnline && (
        <div className="offline-banner">
          Sem internet por agora. Seus vídeos baixados continuam disponíveis.
        </div>
      )}

      {message && (
        <div className="message" role="status">
          {message}
          <button type="button" onClick={() => setMessage('')} aria-label="Fechar aviso">
            ×
          </button>
        </div>
      )}

      <nav className="tab-bar" aria-label="Navegação principal">
        <TabButton active={screen === 'dashboard'} label="Início" icon="⌂" onClick={() => setScreen('dashboard')} />
        <TabButton active={screen === 'online'} label="Online" icon="↓" onClick={() => setScreen('online')} />
        <TabButton active={screen === 'downloads'} label="Fila" icon="↧" onClick={() => setScreen('downloads')} />
        <TabButton active={screen === 'local'} label="Meus Vídeos" icon="▶" onClick={() => setScreen('local')} />
        <TabButton active={screen === 'settings'} label="Ajustes" icon="⚙" onClick={() => setScreen('settings')} />
      </nav>

      <main>
        {screen === 'dashboard' && (
          <DashboardScreen
            count={storedVideos.length}
            usedBytes={usedBytes}
            storageLimit={storageLimit}
            storagePercent={storagePercent}
            onRefresh={refreshStoredVideos}
            onOpenOnline={() => setScreen('online')}
            onOpenLocal={() => setScreen('local')}
            onOpenSettings={() => setScreen('settings')}
          />
        )}

        {screen === 'online' && (
          <OnlineScreen
            videos={onlineVideos}
            downloadedIds={downloadedIds}
            availableBytes={availableBytes}
            isLoading={isLoadingLibrary}
            isDownloading={queue.isRunning}
            onLoad={() => loadOnlineLibrary(true)}
            onDownload={startSingleDownload}
            onDownloadEverything={prepareDownloadEverything}
          />
        )}

        {screen === 'downloads' && <DownloadQueueScreen queue={queue} onCancel={cancelDownloads} />}

        {screen === 'local' && (
          <LocalLibraryScreen videos={storedVideos} onPlay={playVideo} onDelete={removeVideo} onDeleteAll={removeAllVideos} />
        )}

        {screen === 'settings' && (
          <SettingsScreen
            storageLimit={storageLimit}
            customLimitGb={customLimitGb}
            libraryUrl={libraryUrl}
            onLimitChange={updateLimit}
            onCustomLimitChange={setCustomLimitGb}
            onSaveCustomLimit={saveCustomLimit}
            onLibraryUrlChange={setLibraryUrl}
            onSaveLibraryUrl={saveRemoteUrl}
            onInstallHelp={() => setScreen('install')}
          />
        )}

        {screen === 'install' && <InstallHelpScreen />}
      </main>

      {pendingPlan && (
        <ConfirmationModal
          plan={pendingPlan}
          onCancel={() => setPendingPlan(null)}
          onConfirm={() => startQueue(pendingPlan.videos)}
        />
      )}

      {player && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Player de vídeo">
          <section className="player-modal">
            <div className="modal-header">
              <h2>{player.title}</h2>
              <button type="button" className="icon-button" onClick={closePlayer} aria-label="Fechar player">
                ×
              </button>
            </div>
            <video src={player.url} controls autoPlay playsInline />
          </section>
        </div>
      )}
    </div>
  );
}

function TabButton(props: { active: boolean; label: string; icon: string; onClick: () => void }) {
  return (
    <button type="button" className={props.active ? 'tab active' : 'tab'} onClick={props.onClick}>
      <span aria-hidden="true">{props.icon}</span>
      {props.label}
    </button>
  );
}

function DashboardScreen(props: {
  count: number;
  usedBytes: number;
  storageLimit: number;
  storagePercent: number;
  onRefresh: () => void;
  onOpenOnline: () => void;
  onOpenLocal: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <section className="screen">
      <div className="metrics-grid">
        <MetricCard title="Vídeos baixados" value={String(props.count)} icon="▶" />
        <MetricCard title="Usado pela Gatoteca" value={formatBytes(props.usedBytes)} icon="🐾" />
        <MetricCard title="Limite configurado" value={formatBytes(props.storageLimit)} icon="▣" />
      </div>

      <div className="panel">
        <div className="panel-title">
          <h2>Cestinha dos gatinhos</h2>
          <span>{Math.round(props.storagePercent)}%</span>
        </div>
        <div className="meter" aria-label="Uso do armazenamento">
          <span style={{ width: `${props.storagePercent}%` }} />
        </div>
        <p>{formatBytes(Math.max(props.storageLimit - props.usedBytes, 0))} livres dentro do limite escolhido.</p>
      </div>

      <div className="action-grid">
        <button type="button" className="primary" onClick={props.onRefresh}>
          Atualizar
        </button>
        <button type="button" onClick={props.onOpenOnline}>
          Biblioteca Online
        </button>
        <button type="button" onClick={props.onOpenLocal}>
          Meus Vídeos
        </button>
        <button type="button" onClick={props.onOpenSettings}>
          Configurar limite
        </button>
      </div>
    </section>
  );
}

function MetricCard(props: { title: string; value: string; icon: string }) {
  return (
    <article className="metric-card">
      <span aria-hidden="true">{props.icon}</span>
      <p>{props.title}</p>
      <strong>{props.value}</strong>
    </article>
  );
}

function OnlineScreen(props: {
  videos: VideoItem[];
  downloadedIds: Set<string>;
  availableBytes: number;
  isLoading: boolean;
  isDownloading: boolean;
  onLoad: () => void;
  onDownload: (video: VideoItem) => void;
  onDownloadEverything: () => void;
}) {
  return (
    <section className="screen">
      <div className="screen-heading">
        <div>
          <p className="eyebrow">Biblioteca Online</p>
          <h2>Baixar vídeos que cabem</h2>
        </div>
        <button type="button" onClick={props.onLoad} disabled={props.isLoading}>
          Atualizar
        </button>
      </div>

      <button type="button" className="primary wide" onClick={props.onDownloadEverything} disabled={props.isDownloading || props.isLoading}>
        Baixar tudo que couber
      </button>

      {props.isLoading && <div className="loading">Carregando biblioteca online...</div>}

      <div className="video-list">
        {props.videos.map((video) => (
          <OnlineVideoCard
            key={video.id}
            video={video}
            status={getVideoStatus(video, props.downloadedIds, props.availableBytes)}
            isDownloading={props.isDownloading}
            onDownload={() => props.onDownload(video)}
          />
        ))}
      </div>

      {!props.isLoading && props.videos.length === 0 && (
        <EmptyState title="Nenhum vídeo carregado" text="Toque em Atualizar para buscar o JSON remoto." />
      )}
    </section>
  );
}

function getVideoStatus(video: VideoItem, downloadedIds: Set<string>, availableBytes: number) {
  if (downloadedIds.has(video.id)) {
    return 'Já baixado';
  }

  if (video.sizeBytes > availableBytes) {
    return 'Não cabe no limite';
  }

  return 'Disponível';
}

function OnlineVideoCard(props: {
  video: VideoItem;
  status: string;
  isDownloading: boolean;
  onDownload: () => void;
}) {
  const disabled = props.status === 'Já baixado' || props.isDownloading;

  return (
    <article className="video-card">
      <div className="thumbnail">
        {props.video.thumbnail ? <img src={props.video.thumbnail} alt="" loading="lazy" /> : <span>🐾</span>}
      </div>
      <div className="video-card-content">
        <h3>{props.video.title}</h3>
        <div className="video-meta">
          <span>{formatBytes(props.video.sizeBytes)}</span>
          <span className={`badge ${props.status === 'Disponível' ? 'ok' : props.status === 'Já baixado' ? 'saved' : 'warn'}`}>
            {props.status}
          </span>
        </div>
        <button type="button" onClick={props.onDownload} disabled={disabled}>
          Baixar
        </button>
      </div>
    </article>
  );
}

function DownloadQueueScreen(props: { queue: QueueState; onCancel: () => void }) {
  const overallProgress = props.queue.total > 0 ? ((props.queue.completed + props.queue.currentProgress) / props.queue.total) * 100 : 0;
  const remaining = Math.max(props.queue.total - props.queue.completed, 0);

  return (
    <section className="screen">
      <div className="screen-heading">
        <div>
          <p className="eyebrow">Fila de Downloads</p>
          <h2>Um vídeo por vez</h2>
        </div>
      </div>

      {props.queue.isRunning ? (
        <div className="panel stack">
          <ProgressBlock title="Progresso geral" value={overallProgress} text={`${props.queue.completed} concluídos, ${remaining} restantes`} />
          <ProgressBlock
            title={props.queue.currentTitle || 'Preparando próximo vídeo'}
            value={props.queue.currentProgress * 100}
            text={`${Math.round(props.queue.currentProgress * 100)}% deste vídeo`}
          />
          <button type="button" className="danger" onClick={props.onCancel}>
            Cancelar downloads
          </button>
        </div>
      ) : props.queue.report ? (
        <Report report={props.queue.report} />
      ) : (
        <EmptyState title="Nenhum download na fila" text="A fila aparece aqui quando você baixar vídeos." />
      )}
    </section>
  );
}

function ProgressBlock(props: { title: string; value: number; text: string }) {
  return (
    <div className="progress-block">
      <div className="panel-title">
        <h3>{props.title}</h3>
        <span>{Math.round(props.value)}%</span>
      </div>
      <div className="meter">
        <span style={{ width: `${Math.min(Math.max(props.value, 0), 100)}%` }} />
      </div>
      <p>{props.text}</p>
    </div>
  );
}

function Report(props: { report: DownloadReport }) {
  return (
    <div className="panel stack">
      <h2>{props.report.cancelled ? 'Downloads cancelados' : 'Relatório final'}</h2>
      <div className="metrics-grid">
        <MetricCard title="Sucessos" value={String(props.report.succeeded)} icon="✓" />
        <MetricCard title="Falhas" value={String(props.report.failed.length)} icon="!" />
        <MetricCard title="Uso atual" value={formatBytes(props.report.usedBytes)} icon="🐾" />
      </div>
      {props.report.failed.length > 0 && (
        <div className="failure-list">
          {props.report.failed.map((failure) => (
            <div key={failure.id}>
              <strong>{failure.title}</strong>
              <p>{failure.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LocalLibraryScreen(props: {
  videos: StoredVideo[];
  onPlay: (video: StoredVideo) => void;
  onDelete: (video: StoredVideo) => void;
  onDeleteAll: () => void;
}) {
  return (
    <section className="screen">
      <div className="screen-heading">
        <div>
          <p className="eyebrow">Meus Vídeos</p>
          <h2>Salvos na Gatoteca</h2>
        </div>
        {props.videos.length > 0 && (
          <button type="button" className="danger subtle" onClick={props.onDeleteAll}>
            Apagar todos
          </button>
        )}
      </div>

      <div className="video-list">
        {props.videos.map((video) => (
          <article className="local-card" key={video.id}>
            <h3>{video.title}</h3>
            <p>
              {formatBytes(video.sizeBytes)} · {formatDate(video.downloadedAt)}
            </p>
            <div className="row-actions">
              <button type="button" onClick={() => props.onPlay(video)}>
                Assistir
              </button>
              <button type="button" className="danger subtle" onClick={() => props.onDelete(video)}>
                Apagar
              </button>
            </div>
          </article>
        ))}
      </div>

      {props.videos.length === 0 && <EmptyState title="Nenhum vídeo baixado" text="Os vídeos salvos aparecem aqui e funcionam offline." />}
    </section>
  );
}

function SettingsScreen(props: {
  storageLimit: number;
  customLimitGb: string;
  libraryUrl: string;
  onLimitChange: (bytes: number) => void;
  onCustomLimitChange: (value: string) => void;
  onSaveCustomLimit: () => void;
  onLibraryUrlChange: (value: string) => void;
  onSaveLibraryUrl: () => void;
  onInstallHelp: () => void;
}) {
  const matchesPreset = STORAGE_LIMIT_OPTIONS.some((option) => option.value === props.storageLimit);

  return (
    <section className="screen">
      <div className="screen-heading">
        <div>
          <p className="eyebrow">Configuração</p>
          <h2>Limite da Gatoteca</h2>
        </div>
      </div>

      <div className="panel stack">
        <p>
          A PWA não consulta com precisão o espaço livre do aparelho. Escolha quanto a Gatoteca pode usar e ela controla
          apenas os vídeos que baixou.
        </p>

        <div className="limit-grid">
          {STORAGE_LIMIT_OPTIONS.map((option) => (
            <button
              type="button"
              className={props.storageLimit === option.value ? 'selected' : ''}
              key={option.value}
              onClick={() => props.onLimitChange(option.value)}
            >
              {option.label}
            </button>
          ))}
          <button type="button" className={!matchesPreset ? 'selected' : ''} onClick={props.onSaveCustomLimit}>
            Personalizado
          </button>
        </div>

        <label className="field">
          Limite personalizado em GB
          <input
            inputMode="decimal"
            value={props.customLimitGb}
            onChange={(event) => props.onCustomLimitChange(event.target.value)}
            placeholder="Ex.: 7.5"
          />
        </label>
        <button type="button" onClick={props.onSaveCustomLimit}>
          Salvar limite personalizado
        </button>
      </div>

      <div className="panel stack">
        <h2>JSON remoto</h2>
        <label className="field">
          URL da biblioteca online
          <input value={props.libraryUrl} onChange={(event) => props.onLibraryUrlChange(event.target.value)} />
        </label>
        <button type="button" onClick={props.onSaveLibraryUrl}>
          Salvar URL
        </button>
      </div>

      <button type="button" className="wide" onClick={props.onInstallHelp}>
        Como instalar na tela inicial
      </button>
    </section>
  );
}

function InstallHelpScreen() {
  return (
    <section className="screen">
      <div className="screen-heading">
        <div>
          <p className="eyebrow">Instalação</p>
          <h2>Adicionar à tela inicial</h2>
        </div>
      </div>

      <div className="panel stack">
        <h3>iPhone</h3>
        <p>Abra no Safari, toque em Compartilhar e escolha Adicionar à Tela de Início.</p>
      </div>

      <div className="panel stack">
        <h3>Android</h3>
        <p>Abra no Chrome e toque em Instalar Aplicativo quando a opção aparecer no menu.</p>
      </div>

      <div className="panel stack">
        <h3>Windows e Mac</h3>
        <p>No Chrome ou Edge, use o ícone de instalação na barra de endereço ou o menu do navegador.</p>
      </div>
    </section>
  );
}

function ConfirmationModal(props: { plan: DownloadPlan; onCancel: () => void; onConfirm: () => void }) {
  const afterDownload = props.plan.usedBytes + props.plan.requiredBytes;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Confirmar downloads">
      <section className="confirm-modal">
        <h2>Baixar tudo que couber</h2>
        <p>Encontramos {props.plan.videos.length} vídeos que cabem no limite escolhido.</p>
        <dl>
          <div>
            <dt>Limite configurado</dt>
            <dd>{formatBytes(props.plan.limitBytes)}</dd>
          </div>
          <div>
            <dt>Uso atual</dt>
            <dd>{formatBytes(props.plan.usedBytes)}</dd>
          </div>
          <div>
            <dt>Disponível para downloads</dt>
            <dd>{formatBytes(props.plan.availableBytes)}</dd>
          </div>
          <div>
            <dt>Espaço necessário</dt>
            <dd>{formatBytes(props.plan.requiredBytes)}</dd>
          </div>
          <div>
            <dt>Uso estimado após download</dt>
            <dd>{formatBytes(afterDownload)}</dd>
          </div>
        </dl>
        <p>Deseja baixar todos agora?</p>
        <div className="row-actions">
          <button type="button" onClick={props.onCancel}>
            Cancelar
          </button>
          <button type="button" className="primary" onClick={props.onConfirm}>
            Baixar {props.plan.videos.length} vídeos
          </button>
        </div>
      </section>
    </div>
  );
}

function EmptyState(props: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <span aria-hidden="true">🐾</span>
      <h3>{props.title}</h3>
      <p>{props.text}</p>
    </div>
  );
}

export default App;
