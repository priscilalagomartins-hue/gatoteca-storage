import { useEffect, useMemo, useRef, useState } from 'react';
import packageJson from '../package.json';
import { clearStoredVideos, deleteStoredVideo, getStoredVideos, getUsedBytes, saveStoredVideo } from './lib/db';
import { downloadBlob, type DownloadHandle } from './lib/download';
import { formatBytes, formatDate } from './lib/format';
import { fetchVideoLibrary } from './lib/library';
import { readStorageEstimate, STORAGE_SAFETY_MARGIN_BYTES, type StorageEstimateSnapshot } from './lib/storageEstimate';
import type { DownloadFailure, DownloadReport, StoredVideo, VideoItem } from './types/video';

type Screen = 'dashboard' | 'online' | 'downloads' | 'local' | 'help';

type QueueState = {
  isRunning: boolean;
  currentTitle: string;
  currentProgress: number;
  completed: number;
  total: number;
  failures: DownloadFailure[];
  copiesCreated: number;
  currentUsedBytes: number;
  estimatedRemainingBytes: null | number;
  report?: DownloadReport;
};

type CopyPlan = {
  baseVideo: VideoItem;
  estimatedAvailableBytes: null | number;
  estimatedRemainingBytes: null | number;
  estimatedCopies: null | number;
};

type DeleteAllPlan = {
  count: number;
  bytesToFree: number;
};

type PlayerState = {
  title: string;
  url: string;
};

type NavItem = {
  screen: Screen;
  label: string;
  icon: IconName;
};

type IconName = 'home' | 'paw' | 'box' | 'film' | 'help' | 'cat' | 'basket' | 'sparkle' | 'refresh' | 'phone';

const APP_VERSION = packageJson.version;
const NAV_ITEMS: NavItem[] = [
  { screen: 'dashboard', label: 'Casinha dos Ronrons', icon: 'home' },
  { screen: 'online', label: 'Buscar Gatinhos', icon: 'paw' },
  { screen: 'downloads', label: 'Ninhada de Downloads', icon: 'box' },
  { screen: 'local', label: 'Gatoteca Local', icon: 'film' },
  { screen: 'help', label: 'Informacoes', icon: 'help' }
];

const initialQueue: QueueState = {
  isRunning: false,
  currentTitle: '',
  currentProgress: 0,
  completed: 0,
  total: 0,
  failures: [],
  copiesCreated: 0,
  currentUsedBytes: 0,
  estimatedRemainingBytes: null
};

function App() {
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [storedVideos, setStoredVideos] = useState<StoredVideo[]>([]);
  const [onlineVideos, setOnlineVideos] = useState<VideoItem[]>([]);
  const [storageEstimate, setStorageEstimate] = useState<StorageEstimateSnapshot>({
    quotaBytes: 0,
    usageBytes: 0,
    availableBytes: 0,
    remainingBytes: 0,
    supported: false
  });
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [message, setMessage] = useState('');
  const [queue, setQueue] = useState<QueueState>(initialQueue);
  const [pendingCopyPlan, setPendingCopyPlan] = useState<CopyPlan | null>(null);
  const [pendingDeleteAllPlan, setPendingDeleteAllPlan] = useState<DeleteAllPlan | null>(null);
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const cancelRequested = useRef(false);
  const activeDownload = useRef<DownloadHandle | null>(null);

  const usedBytes = getUsedBytes(storedVideos);
  const downloadedIds = useMemo(() => new Set(storedVideos.map((video) => video.id)), [storedVideos]);
  const storagePercent =
    storageEstimate.availableBytes && storageEstimate.availableBytes > 0
      ? Math.min((usedBytes / storageEstimate.availableBytes) * 100, 100)
      : 0;

  useEffect(() => {
    void refreshAll();
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

  useEffect(() => {
    if (screen === 'online' && onlineVideos.length === 0 && !isLoadingLibrary) {
      void loadOnlineLibrary(true);
    }
  }, [screen, onlineVideos.length, isLoadingLibrary]);

  function handleTabChange(nextScreen: Screen) {
    setScreen(nextScreen);
  }

  async function refreshAll() {
    try {
      const refreshedVideos = await getStoredVideos();
      setStoredVideos(refreshedVideos);
      setStorageEstimate(await readStorageEstimate());
    } catch {
      setMessage('Nao foi possivel abrir a cestinha local da Gatoteca.');
    }
  }

  async function refreshEstimateOnly(nextVideos?: StoredVideo[]) {
    void nextVideos;
    setStorageEstimate(await readStorageEstimate());
  }

  async function loadOnlineLibrary(force = false): Promise<VideoItem[]> {
    if (!force && onlineVideos.length > 0) {
      return onlineVideos;
    }

    setIsLoadingLibrary(true);
    setMessage('');

    try {
      const videos = await fetchVideoLibrary();
      setOnlineVideos(videos);
      return videos;
    } catch {
      setMessage('Nao foi possivel carregar a biblioteca de videos da Gatoteca.');
      return [];
    } finally {
      setIsLoadingLibrary(false);
    }
  }

  async function startSingleDownload(video: VideoItem) {
    if (downloadedIds.has(video.id)) {
      setMessage('Esse gatinho de video ja esta salvo na Gatoteca.');
      return;
    }

    await startSequentialDownloads([video]);
  }

  async function prepareFillAvailableSpace() {
    const videos = await loadOnlineLibrary(true);
    if (videos.length === 0) {
      return;
    }

    const firstVideo = videos[0];
    const refreshedVideos = await getStoredVideos();
    const refreshedEstimate = await readStorageEstimate();
    setStoredVideos(refreshedVideos);
    setStorageEstimate(refreshedEstimate);

    const remainingBytes = refreshedEstimate.remainingBytes;
    const estimatedCopies =
      remainingBytes !== null && firstVideo.sizeBytes > 0 ? Math.max(Math.floor(remainingBytes / firstVideo.sizeBytes), 0) : null;

    setPendingCopyPlan({
      baseVideo: firstVideo,
      estimatedAvailableBytes: refreshedEstimate.availableBytes,
      estimatedRemainingBytes: remainingBytes,
      estimatedCopies
    });
  }

  async function startSequentialDownloads(videos: VideoItem[]) {
    setScreen('downloads');
    setMessage('');
    setPendingCopyPlan(null);
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
      failures,
      copiesCreated: 0,
      currentUsedBytes: usedBytes,
      estimatedRemainingBytes: storageEstimate.remainingBytes,
      report: undefined
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

        if ((await getStoredVideos()).some((stored) => stored.id === video.id)) {
          processed += 1;
          setQueue((current) => ({ ...current, completed: processed }));
          continue;
        }

        const handle = downloadBlob(video.url, (progress) => {
          setQueue((current) => ({ ...current, currentProgress: progress }));
        });

        activeDownload.current = handle;
        const blob = await handle.promise;
        activeDownload.current = null;

        await saveStoredVideo({
          id: video.id,
          title: video.title,
          url: video.url,
          sizeBytes: blob.size || video.sizeBytes,
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
          const refreshed = await getStoredVideos();
          const refreshedUsedBytes = getUsedBytes(refreshed);
          const refreshedEstimate = await readStorageEstimate();
          setStoredVideos(refreshed);
          setStorageEstimate(refreshedEstimate);
          setQueue((current) => ({
            ...current,
            completed: processed,
            failures: [...failures],
            currentUsedBytes: refreshedUsedBytes,
            estimatedRemainingBytes: refreshedEstimate.remainingBytes
          }));
        }
      }
    }

    const refreshed = await getStoredVideos();
    const refreshedUsedBytes = getUsedBytes(refreshed);
    const refreshedEstimate = await readStorageEstimate();
    const report: DownloadReport = {
      succeeded,
      failed: [...failures],
      cancelled: cancelRequested.current,
      usedBytes: refreshedUsedBytes,
      initialEstimatedBytes: storageEstimate.remainingBytes,
      stopReason: cancelRequested.current ? 'cancelled' : 'finished'
    };

    setStoredVideos(refreshed);
    setStorageEstimate(refreshedEstimate);
    setQueue({
      isRunning: false,
      currentTitle: '',
      currentProgress: 0,
      completed: processed,
      total: videos.length,
      failures: [...failures],
      copiesCreated: 0,
      currentUsedBytes: refreshedUsedBytes,
      estimatedRemainingBytes: refreshedEstimate.remainingBytes,
      report
    });

  }

  async function fillAvailableSpaceWithCopies(plan: CopyPlan) {
    const { baseVideo } = plan;
    setScreen('downloads');
    setMessage('');
    setPendingCopyPlan(null);
    cancelRequested.current = false;

    let downloadBlobOnce: Blob | null = null;
    const failures: DownloadFailure[] = [];
    let copiesCreated = 0;
    let stopReason: DownloadReport['stopReason'] = 'finished';
    const initialEstimatedBytes = plan.estimatedRemainingBytes;

    setQueue({
      isRunning: true,
      currentTitle: baseVideo.title,
      currentProgress: 0,
      completed: 0,
      total: Math.max(plan.estimatedCopies ?? 0, 1),
      failures,
      copiesCreated: 0,
      currentUsedBytes: usedBytes,
      estimatedRemainingBytes: storageEstimate.remainingBytes,
      report: undefined
    });

    try {
      const handle = downloadBlob(baseVideo.url, (progress) => {
        setQueue((current) => ({ ...current, currentProgress: progress }));
      });
      activeDownload.current = handle;
      downloadBlobOnce = await handle.promise;
      activeDownload.current = null;
    } catch (error) {
      activeDownload.current = null;
      setQueue({
        ...initialQueue,
        report: {
          succeeded: 0,
          failed: [
            {
              id: baseVideo.id,
              title: baseVideo.title,
              message: error instanceof Error ? error.message : 'Nao foi possivel baixar o video base.'
            }
          ],
          cancelled: false,
          usedBytes,
          copiesCreated: 0,
          stopReason: 'finished'
        }
      });
      return;
    }

    while (!cancelRequested.current && downloadBlobOnce) {
      const refreshedVideos = await getStoredVideos();
      const refreshedUsedBytes = getUsedBytes(refreshedVideos);
      const refreshedEstimate = await readStorageEstimate();
      const blobSize = downloadBlobOnce.size || baseVideo.sizeBytes;
      const nextCopyNumber = copiesCreated + 1;
      const nextId = `${baseVideo.id}-copy-${String(nextCopyNumber).padStart(6, '0')}`;

      try {
        await saveStoredVideo({
          id: nextId,
          title: `${baseVideo.title} (copia ${String(nextCopyNumber).padStart(6, '0')})`,
          url: baseVideo.url,
          sizeBytes: blobSize,
          downloadedAt: new Date().toISOString(),
          blob: downloadBlobOnce
        });

        copiesCreated += 1;
        const afterSaveVideos = await getStoredVideos();
        const afterSaveUsedBytes = getUsedBytes(afterSaveVideos);
        const afterSaveEstimate = await readStorageEstimate();
        setStoredVideos(afterSaveVideos);
        setStorageEstimate(afterSaveEstimate);
        setQueue((current) => ({
          ...current,
          currentProgress: 1,
          completed: copiesCreated,
          total: Math.max(current.total, copiesCreated),
          copiesCreated,
          currentUsedBytes: afterSaveUsedBytes,
          estimatedRemainingBytes: afterSaveEstimate.remainingBytes
        }));
      } catch (error) {
        const messageText = error instanceof Error ? error.message : 'O navegador recusou mais armazenamento.';
        failures.push({
          id: nextId,
          title: baseVideo.title,
          message: messageText
        });
        stopReason = isQuotaError(error) ? 'quota' : 'finished';
        break;
      }
    }

    if (cancelRequested.current) {
      stopReason = 'cancelled';
    }

    const refreshed = await getStoredVideos();
    const refreshedUsedBytes = getUsedBytes(refreshed);
    const refreshedEstimate = await readStorageEstimate();
    setStoredVideos(refreshed);
    setStorageEstimate(refreshedEstimate);
    setQueue({
      isRunning: false,
      currentTitle: '',
      currentProgress: 0,
      completed: copiesCreated,
      total: Math.max(plan.estimatedCopies ?? copiesCreated, copiesCreated),
      failures: [...failures],
      copiesCreated,
      currentUsedBytes: refreshedUsedBytes,
      estimatedRemainingBytes: refreshedEstimate.remainingBytes,
      report: {
        succeeded: copiesCreated,
        failed: [...failures],
        cancelled: stopReason === 'cancelled',
        usedBytes: refreshedUsedBytes,
        copiesCreated,
        initialEstimatedBytes,
        stopReason
      }
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
    if (!window.confirm('Tem certeza que deseja soltar este gatinho da Gatoteca?')) {
      return;
    }

    await deleteStoredVideo(video.id);
    const refreshed = await getStoredVideos();
    setStoredVideos(refreshed);
    await refreshEstimateOnly(refreshed);
    setOnlineVideos((current) => [...current]);
  }

  function prepareDeleteAll() {
    if (storedVideos.length === 0) {
      return;
    }

    setPendingDeleteAllPlan({
      count: storedVideos.length,
      bytesToFree: usedBytes
    });
  }

  async function confirmDeleteAll() {
    await clearStoredVideos();
    setPendingDeleteAllPlan(null);
    const refreshed: StoredVideo[] = [];
    setStoredVideos(refreshed);
    await refreshEstimateOnly(refreshed);
    setOnlineVideos((current) => [...current]);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="hero-copy">
          <p className="eyebrow">Gatoteca Storage PWA</p>
          <h1>Um cantinho fofo para guardar seus ronrons em video</h1>
          <p className="hero-subtitle">Leve, rapido e so com o espacinho local da sua propria Gatoteca.</p>
        </div>
        <div className="paw-mark" aria-hidden="true">
          <CatIcon name="cat" />
        </div>
      </header>

      {!isOnline && <div className="offline-banner">Sem internet por agora. Seus gatinhos baixados continuam por aqui.</div>}

      {!storageEstimate.supported && (
        <div className="offline-banner">Nao foi possivel estimar o espaco disponivel neste navegador.</div>
      )}

      {message && (
        <div className="message" role="status">
          <span>{message}</span>
          <button type="button" className="icon-button" onClick={() => setMessage('')} aria-label="Fechar aviso">
            x
          </button>
        </div>
      )}

      <nav className="tab-bar" aria-label="Navegacao principal">
        {NAV_ITEMS.map((item) => (
          <TabButton
            key={item.screen}
            active={screen === item.screen}
            label={item.label}
            icon={item.icon}
            onClick={() => handleTabChange(item.screen)}
          />
        ))}
      </nav>

      <main>
        {screen === 'dashboard' && (
          <DashboardScreen
            count={storedVideos.length}
            usedBytes={usedBytes}
            estimate={storageEstimate}
            storagePercent={storagePercent}
            onRefresh={refreshAll}
            onOpenOnline={() => handleTabChange('online')}
            onOpenLocal={() => handleTabChange('local')}
            onOpenHelp={() => handleTabChange('help')}
          />
        )}

        {screen === 'online' && (
          <OnlineScreen
            videos={onlineVideos}
            downloadedIds={downloadedIds}
            estimate={storageEstimate}
            isLoading={isLoadingLibrary}
            isDownloading={queue.isRunning}
            onLoad={async () => {
              await loadOnlineLibrary(true);
            }}
            onDownload={startSingleDownload}
            onDownloadEverything={prepareFillAvailableSpace}
          />
        )}

        {screen === 'downloads' && <DownloadQueueScreen queue={queue} onCancel={cancelDownloads} />}

        {screen === 'local' && (
          <LocalLibraryScreen videos={storedVideos} onPlay={playVideo} onDelete={removeVideo} onDeleteAll={prepareDeleteAll} />
        )}

        {screen === 'help' && (
          <HelpScreen
            version={APP_VERSION}
            onShowInstall={() => window.alert('No iPhone, abra a Gatoteca no Safari, toque em Compartilhar e escolha Adicionar a Tela de Inicio.')}
          />
        )}
      </main>

      {pendingCopyPlan && (
        <CopyConfirmationModal
          plan={pendingCopyPlan}
          onCancel={() => setPendingCopyPlan(null)}
          onConfirm={() => void fillAvailableSpaceWithCopies(pendingCopyPlan)}
        />
      )}

      {pendingDeleteAllPlan && (
        <DeleteAllConfirmationModal
          plan={pendingDeleteAllPlan}
          onCancel={() => setPendingDeleteAllPlan(null)}
          onConfirm={() => void confirmDeleteAll()}
        />
      )}

      {player && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Player de video">
          <section className="player-modal">
            <div className="modal-header">
              <h2>{player.title}</h2>
              <button type="button" className="icon-button" onClick={closePlayer} aria-label="Fechar player">
                x
              </button>
            </div>
            <video src={player.url} controls autoPlay playsInline />
          </section>
        </div>
      )}
    </div>
  );
}

function isQuotaError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { name?: string; message?: string };
  return candidate.name === 'QuotaExceededError' || candidate.message?.toLowerCase().includes('quota') === true;
}

function TabButton(props: { active: boolean; label: string; icon: IconName; onClick: () => void }) {
  return (
    <button type="button" className={props.active ? 'tab active' : 'tab'} onClick={props.onClick}>
      <CatIcon name={props.icon} />
      <span>{props.label}</span>
    </button>
  );
}

function DashboardScreen(props: {
  count: number;
  usedBytes: number;
  estimate: StorageEstimateSnapshot;
  storagePercent: number;
  onRefresh: () => void | Promise<void>;
  onOpenOnline: () => void;
  onOpenLocal: () => void;
  onOpenHelp: () => void;
}) {
  return (
    <section className="screen">
      <div className="metrics-grid">
        <MetricCard title="Gatinhos Adotados" value={String(props.count)} icon="cat" accent="rose" />
        <MetricCard title="Espaco Ocupado" value={formatBytes(props.usedBytes)} icon="paw" accent="peach" />
        <MetricCard
          title="Espaco disponivel para a Gatoteca"
          value={props.estimate.availableBytes !== null ? formatBytes(props.estimate.availableBytes) : 'Nao informado'}
          icon="sparkle"
          accent="gold"
        />
        <MetricCard
          title="Cestinha Livre"
          value={props.estimate.remainingBytes !== null ? formatBytes(props.estimate.remainingBytes) : 'Nao informado'}
          icon="basket"
          accent="cream"
        />
      </div>

      <div className="panel cozy-panel">
        <div className="panel-title">
          <h2>Cestinha dos gatinhos</h2>
          <span className="progress-chip">{Math.round(props.storagePercent)}%</span>
        </div>
        <div className="meter" aria-label="Uso do armazenamento">
          <span style={{ width: `${props.storagePercent}%` }} />
        </div>
        <p>
          Espaco restante estimado para a Gatoteca:{' '}
          <strong>{props.estimate.remainingBytes !== null ? formatBytes(props.estimate.remainingBytes) : 'Nao informado'}</strong>
        </p>
        <p className="helper-copy">A Gatoteca usa apenas armazenamento local da PWA e cuida so dos videos que ela mesma guarda.</p>
        <p className="helper-copy">Estimado pelo navegador.</p>
      </div>

      <div className="action-grid">
        <button type="button" className="primary fluffy-button" onClick={props.onRefresh}>
          <CatIcon name="refresh" />
          <span>Procurar Ronrons</span>
        </button>
        <button type="button" className="fluffy-button" onClick={props.onOpenOnline}>
          <CatIcon name="paw" />
          <span>Biblioteca dos Gatinhos</span>
        </button>
        <button type="button" className="fluffy-button" onClick={props.onOpenLocal}>
          <CatIcon name="film" />
          <span>Ver Gatoteca</span>
        </button>
        <button type="button" className="fluffy-button" onClick={props.onOpenHelp}>
          <CatIcon name="help" />
          <span>Instalar Gatoteca</span>
        </button>
      </div>
    </section>
  );
}

function MetricCard(props: { title: string; value: string; icon: IconName; accent: 'rose' | 'peach' | 'gold' | 'cream' }) {
  return (
    <article className={`metric-card accent-${props.accent}`}>
      <div className="metric-icon">
        <CatIcon name={props.icon} />
      </div>
      <p>{props.title}</p>
      <strong>{props.value}</strong>
    </article>
  );
}

function OnlineScreen(props: {
  videos: VideoItem[];
  downloadedIds: Set<string>;
  estimate: StorageEstimateSnapshot;
  isLoading: boolean;
  isDownloading: boolean;
  onLoad: () => void | Promise<void>;
  onDownload: (video: VideoItem) => void;
  onDownloadEverything: () => void | Promise<void>;
}) {
  return (
    <section className="screen">
      <div className="screen-heading">
        <div>
          <p className="eyebrow">Buscar Gatinhos</p>
          <h2>Videos prontos para entrar na Gatoteca</h2>
        </div>
        <button type="button" className="fluffy-button small" onClick={props.onLoad} disabled={props.isLoading}>
          <CatIcon name="refresh" />
          <span>Atualizar</span>
        </button>
      </div>

      <button type="button" className="primary wide fluffy-button" onClick={props.onDownloadEverything} disabled={props.isDownloading || props.isLoading}>
        <CatIcon name="paw" />
        <span>Adotar Todos os Gatinhos Possiveis</span>
      </button>

      {props.isLoading && <div className="loading">A Gatoteca esta procurando novos ronrons...</div>}

      <div className="video-list">
        {props.videos.map((video) => (
          <OnlineVideoCard
            key={video.id}
            video={video}
            status={getVideoStatus(video, props.downloadedIds, props.estimate)}
            isDownloading={props.isDownloading}
            onDownload={() => props.onDownload(video)}
          />
        ))}
      </div>

      {!props.isLoading && props.videos.length === 0 && (
        <EmptyState title="Nenhum gatinho apareceu" text="A biblioteca local /library.json sera lida automaticamente quando houver videos publicados." />
      )}
    </section>
  );
}

function getVideoStatus(video: VideoItem, downloadedIds: Set<string>, estimate: StorageEstimateSnapshot) {
  if (downloadedIds.has(video.id)) {
    return 'Ja adotado';
  }

  if (estimate.remainingBytes !== null && video.sizeBytes > estimate.remainingBytes) {
    return 'Nao cabe na cestinha';
  }

  return 'Pronto para ronronar';
}

function OnlineVideoCard(props: {
  video: VideoItem;
  status: string;
  isDownloading: boolean;
  onDownload: () => void;
}) {
  const disabled = props.status === 'Ja adotado' || props.isDownloading;

  return (
    <article className="video-card">
      <div className="thumbnail">
        {props.video.thumbnail ? <img src={props.video.thumbnail} alt="" loading="lazy" /> : <CatIcon name="cat" />}
      </div>
      <div className="video-card-content">
        <h3>{props.video.title}</h3>
        <div className="video-meta">
          <span>{formatBytes(props.video.sizeBytes)}</span>
          <span className={`badge ${props.status === 'Pronto para ronronar' ? 'ok' : props.status === 'Ja adotado' ? 'saved' : 'warn'}`}>
            {props.status}
          </span>
        </div>
        <button type="button" className="fluffy-button small" onClick={props.onDownload} disabled={disabled}>
          <CatIcon name="paw" />
          <span>Baixar</span>
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
          <p className="eyebrow">Ninhada de Downloads</p>
          <h2>Organizando os ronrons com carinho</h2>
        </div>
      </div>

      {props.queue.isRunning ? (
        <div className="panel stack cozy-panel">
          <ProgressBlock title="Progresso geral da ninhada" value={overallProgress} text={`${props.queue.completed} concluidos, ${remaining} restantes`} />
          <ProgressBlock
            title={props.queue.currentTitle || 'Preparando a proxima copia'}
            value={props.queue.currentProgress * 100}
            text={`${Math.round(props.queue.currentProgress * 100)}% do video base`}
          />
          <div className="progress-stats">
            <p>Copias criadas: {props.queue.copiesCreated}</p>
            <p>Espaco usado: {formatBytes(props.queue.currentUsedBytes)}</p>
            <p>
              Espaco restante estimado: {props.queue.estimatedRemainingBytes !== null ? formatBytes(props.queue.estimatedRemainingBytes) : 'Nao informado'}
            </p>
            <p>Estimado pelo navegador.</p>
          </div>
          <button type="button" className="danger fluffy-button" onClick={props.onCancel}>
            <CatIcon name="basket" />
            <span>Cancelar downloads</span>
          </button>
        </div>
      ) : props.queue.report ? (
        <Report report={props.queue.report} />
      ) : (
        <EmptyState title="Nenhuma ninhada por aqui" text="Os downloads aparecem aqui quando a Gatoteca comeca a adotar videos." />
      )}
    </section>
  );
}

function ProgressBlock(props: { title: string; value: number; text: string }) {
  return (
    <div className="progress-block">
      <div className="panel-title">
        <h3>{props.title}</h3>
        <span className="progress-chip">{Math.round(props.value)}%</span>
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
    <div className="panel stack cozy-panel">
      <h2>Relatorio final dos ronrons</h2>
      <div className="metrics-grid report-grid">
        <MetricCard title="Copias criadas" value={String(props.report.copiesCreated ?? props.report.succeeded)} icon="box" accent="rose" />
        <MetricCard title="Falhas" value={String(props.report.failed.length)} icon="help" accent="peach" />
        <MetricCard title="Uso atual" value={formatBytes(props.report.usedBytes)} icon="paw" accent="gold" />
      </div>
      <p>
        Espaco estimado inicialmente:{' '}
        <strong>{props.report.initialEstimatedBytes !== null && props.report.initialEstimatedBytes !== undefined ? formatBytes(props.report.initialEstimatedBytes) : 'Nao informado'}</strong>
      </p>
      <p>
        Espaco realmente usado: <strong>{formatBytes(props.report.usedBytes)}</strong>
      </p>
      <p>Motivo da parada: {describeStopReason(props.report.stopReason)}</p>
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

function describeStopReason(reason: DownloadReport['stopReason']) {
  switch (reason) {
    case 'quota':
      return 'navegador recusou mais armazenamento';
    case 'cancelled':
      return 'cancelado pela usuaria';
    default:
      return 'processo concluido';
  }
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
          <p className="eyebrow">Gatoteca Local</p>
          <h2>Seus gatinhos salvos para ver offline</h2>
        </div>
        {props.videos.length > 0 && (
          <button type="button" className="danger subtle fluffy-button small" onClick={props.onDeleteAll}>
            <CatIcon name="basket" />
            <span>Abrir o Portao</span>
          </button>
        )}
      </div>

      <div className="video-list">
        {props.videos.map((video) => (
          <article className="local-card" key={video.id}>
            <h3>{video.title}</h3>
            <p>
              {formatBytes(video.sizeBytes)} | {formatDate(video.downloadedAt)}
            </p>
            <div className="row-actions">
              <button type="button" className="fluffy-button small" onClick={() => props.onPlay(video)}>
                <CatIcon name="film" />
                <span>Assistir</span>
              </button>
              <button type="button" className="danger subtle fluffy-button small" onClick={() => props.onDelete(video)}>
                <CatIcon name="paw" />
                <span>Soltar Gatinho</span>
              </button>
            </div>
          </article>
        ))}
      </div>

      {props.videos.length === 0 && <EmptyState title="Nenhum gatinho descansando" text="Os videos salvos aparecem aqui e continuam funcionando offline." />}
    </section>
  );
}

function HelpScreen(props: { version: string; onShowInstall: () => void }) {
  return (
    <section className="screen">
      <div className="screen-heading">
        <div>
          <p className="eyebrow">Informacoes</p>
          <h2>Sobre a Gatoteca</h2>
        </div>
      </div>

      <div className="panel stack cozy-panel">
        <p>A biblioteca e carregada automaticamente.</p>
        <p>A Gatoteca usa apenas armazenamento local da PWA.</p>
        <p>Nenhum arquivo do celular e acessado.</p>
        <p>Estimado pelo navegador.</p>
        <p>A Gatoteca nao consegue ver todo o armazenamento do celular; ela usa a cota permitida pelo navegador.</p>
      </div>

      <div className="panel stack">
        <h3>Versao do aplicativo</h3>
        <p>{props.version}</p>
      </div>

      <div className="panel stack">
        <button type="button" className="fluffy-button" onClick={props.onShowInstall}>
          <CatIcon name="phone" />
          <span>Como instalar no iPhone</span>
        </button>
      </div>
    </section>
  );
}

function CopyConfirmationModal(props: { plan: CopyPlan; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Confirmar preenchimento da Gatoteca">
      <section className="confirm-modal">
        <h2>Adotar todos os gatinhos possiveis</h2>
        <p>A Gatoteca encontrou espaco para mais ronrons.</p>
        <p>Deseja adotar todos os gatinhos que couberem na sua cestinha?</p>
        <dl>
          <div>
            <dt>Espaco disponivel para a Gatoteca</dt>
            <dd>{props.plan.estimatedAvailableBytes !== null ? formatBytes(props.plan.estimatedAvailableBytes) : 'Nao informado'}</dd>
          </div>
          <div>
            <dt>Margem de seguranca</dt>
            <dd>{formatBytes(STORAGE_SAFETY_MARGIN_BYTES)}</dd>
          </div>
          <div>
            <dt>Cestinha livre</dt>
            <dd>{props.plan.estimatedRemainingBytes !== null ? formatBytes(props.plan.estimatedRemainingBytes) : 'Nao informado'}</dd>
          </div>
          <div>
            <dt>Tamanho do video base</dt>
            <dd>{formatBytes(props.plan.baseVideo.sizeBytes)}</dd>
          </div>
          <div>
            <dt>Copias estimadas</dt>
            <dd>{props.plan.estimatedCopies !== null ? String(props.plan.estimatedCopies) : 'Ate o navegador permitir'}</dd>
          </div>
        </dl>
        <p>Estimado pelo navegador.</p>
        <div className="row-actions">
          <button type="button" onClick={props.onCancel}>
            Cancelar
          </button>
          <button type="button" className="primary" onClick={props.onConfirm}>
            Adotar agora
          </button>
        </div>
      </section>
    </div>
  );
}

function DeleteAllConfirmationModal(props: { plan: DeleteAllPlan; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Confirmar abrir o portao">
      <section className="confirm-modal">
        <h2>Abrir o Portao</h2>
        <p>Todos os gatinhos serao soltos da Gatoteca. Deseja continuar?</p>
        <p>
          Serao liberados {props.plan.count} videos e aproximadamente {formatBytes(props.plan.bytesToFree)}.
        </p>
        <p>Nenhum arquivo fora da Gatoteca sera apagado.</p>
        <div className="row-actions">
          <button type="button" onClick={props.onCancel}>
            Cancelar
          </button>
          <button type="button" className="danger" onClick={props.onConfirm}>
            Abrir o Portao
          </button>
        </div>
      </section>
    </div>
  );
}

function EmptyState(props: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <CatIcon name="cat" />
      </div>
      <h3>{props.title}</h3>
      <p>{props.text}</p>
    </div>
  );
}

function CatIcon(props: { name: IconName }) {
  const common = { stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  switch (props.name) {
    case 'home':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path {...common} d="M4 11.5 12 5l8 6.5" fill="none" />
          <path {...common} d="M6.5 10.5V19h11v-8.5" fill="none" />
          <path {...common} d="M9 13.5c0-1.4 1.3-2.5 3-2.5s3 1.1 3 2.5V19H9v-5.5Z" fill="none" />
          <path {...common} d="M10 7.5 8.2 5.7 7.2 8.2M14 7.5l1.8-1.8 1 2.5" fill="none" />
        </svg>
      );
    case 'paw':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle {...common} cx="8" cy="8" r="2.1" fill="none" />
          <circle {...common} cx="16" cy="8" r="2.1" fill="none" />
          <circle {...common} cx="6.3" cy="13.2" r="1.8" fill="none" />
          <circle {...common} cx="17.7" cy="13.2" r="1.8" fill="none" />
          <path {...common} d="M12 11.8c-3.1 0-5.2 2.1-5.2 4.4 0 1.8 1.5 2.8 3.2 2.8.9 0 1.5-.3 2-.8.5.5 1.1.8 2 .8 1.7 0 3.2-1 3.2-2.8 0-2.3-2.1-4.4-5.2-4.4Z" fill="none" />
        </svg>
      );
    case 'box':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path {...common} d="M4 8.5 12 4l8 4.5-8 4.5L4 8.5Z" fill="none" />
          <path {...common} d="M4 8.5V17l8 4 8-4V8.5" fill="none" />
          <path {...common} d="M12 13v8" fill="none" />
          <path {...common} d="m9.3 5.5-1.4-1.9-1 2.7m7.8-.8 1.4-1.9 1 2.7" fill="none" />
        </svg>
      );
    case 'film':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect {...common} x="4" y="5" width="16" height="14" rx="2.2" fill="none" />
          <path {...common} d="M9.2 10.1v3.8l4-1.9-4-1.9Z" fill="none" />
          <path {...common} d="M6.6 8h1.8M6.6 16h1.8M15.6 8h1.8M15.6 16h1.8" />
        </svg>
      );
    case 'help':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path {...common} d="M8.4 9.4a3.7 3.7 0 1 1 7.2 1.2c-.5 1.1-1.5 1.7-2.3 2.3-.7.5-1.3 1-1.3 2.1" fill="none" />
          <path {...common} d="M11.9 17.7h.2" />
          <path {...common} d="M6.5 8.2 5.2 6.1 8 6.3M17.5 8.2l1.3-2.1-2.8.2" fill="none" />
          <path {...common} d="M12 21c5 0 9-4 9-9s-4-9-9-9-9 4-9 9 4 9 9 9Z" fill="none" />
        </svg>
      );
    case 'basket':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path {...common} d="M5 10h14l-1.1 8.1A2 2 0 0 1 15.9 20H8.1a2 2 0 0 1-2-1.9L5 10Z" fill="none" />
          <path {...common} d="M8.5 10c0-2 1.6-3.5 3.5-3.5S15.5 8 15.5 10" fill="none" />
          <path {...common} d="M9 13.5v3M12 13.5v3M15 13.5v3" />
        </svg>
      );
    case 'sparkle':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path {...common} d="M12 4.5 13.6 9l4.4 1.6-4.4 1.6L12 16.7l-1.6-4.5L6 10.6 10.4 9 12 4.5Z" fill="none" />
          <path {...common} d="M18 4v2M19 5h-2M5 16.5v3M6.5 18H3.5" />
        </svg>
      );
    case 'refresh':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path {...common} d="M20 6.5V11h-4.5" fill="none" />
          <path {...common} d="M19.5 11A7.5 7.5 0 1 1 12 4.5c2 0 3.9.8 5.3 2.1" fill="none" />
        </svg>
      );
    case 'phone':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect {...common} x="7" y="3.5" width="10" height="17" rx="2.2" fill="none" />
          <path {...common} d="M10.5 6.5h3M11.2 17.4h1.6" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path {...common} d="M6.3 9.2 8.6 5.6 11 8m7.7 1.2L16.4 5.6 14 8" fill="none" />
          <path {...common} d="M6.5 10.5c0-2.6 2.5-4.7 5.5-4.7s5.5 2.1 5.5 4.7v2.3c0 3.2-2.5 5.7-5.5 5.7s-5.5-2.5-5.5-5.7v-2.3Z" fill="none" />
          <path {...common} d="M9.6 11.7h.1M14.3 11.7h.1M10 14.7c.4.7 1.1 1 2 1s1.6-.3 2-1" />
        </svg>
      );
  }
}

export default App;
