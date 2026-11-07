import { useCallback, useEffect, useState } from "react";
import {
  AuthError,
  getMetrics,
  getWarnings,
  listUpdates,
  session,
  uploadSchedule,
  type Issue,
  type MetricsResponse,
  type UpdateSummary,
  type UploadResult,
} from "./api";
import { Dashboard } from "./components/Dashboard";
import { IssueList } from "./components/IssueList";
import { Login } from "./components/Login";
import { Sidebar } from "./components/Sidebar";

export default function App() {
  const [loggedIn, setLoggedIn] = useState(() => !!session.get());
  const [updates, setUpdates] = useState<UpdateSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [warnings, setWarnings] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<{ file: string; result: UploadResult } | null>(null);

  const handle = useCallback((err: unknown) => {
    if (err instanceof AuthError) setLoggedIn(false);
    else setError((err as Error).message);
  }, []);

  const refreshList = useCallback(async () => {
    const list = await listUpdates();
    setUpdates(list);
    return list;
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    refreshList()
      .then((list) => setSelectedId((cur) => cur ?? list[0]?.id ?? null))
      .catch(handle);
  }, [loggedIn, refreshList, handle]);

  useEffect(() => {
    if (!loggedIn || selectedId === null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([getMetrics(selectedId), getWarnings(selectedId)])
      .then(([m, w]) => {
        if (cancelled) return;
        setMetrics(m);
        setWarnings(w);
      })
      .catch(handle)
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [loggedIn, selectedId, handle]);

  const onUpload = async (file: File, encoding: string) => {
    setUploading(file.name);
    setUploadResult(null);
    try {
      const result = await uploadSchedule(file, encoding || undefined);
      setUploadResult({ file: file.name, result });
      if (result.kind === "ok") {
        await refreshList();
        setSelectedId(result.updateId);
      } else if (result.kind === "duplicate") {
        setSelectedId(result.existingUpdateId);
      }
    } catch (err) {
      handle(err);
    } finally {
      setUploading(null);
    }
  };

  const logout = () => {
    session.set(null);
    setLoggedIn(false);
    setUpdates([]);
    setMetrics(null);
    setSelectedId(null);
    setUploadResult(null);
  };

  if (!loggedIn) return <Login onLoggedIn={() => setLoggedIn(true)} />;

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">CritPath Mini</span>
        <button type="button" className="btn btn-quiet" onClick={logout}>
          Log out
        </button>
      </header>
      <Sidebar
        updates={updates}
        selectedId={selectedId}
        onSelect={(id) => {
          setUploadResult(null);
          setSelectedId(id);
        }}
        onUpload={onUpload}
        uploading={uploading}
      />
      <main className="main">
        {uploadResult && <UploadNotice {...uploadResult} onClose={() => setUploadResult(null)} />}
        {error && (
          <p className="banner banner-error" role="alert">
            {error}
          </p>
        )}
        {selectedId === null && !uploadResult ? (
          <div className="empty">
            <h1>No schedule yet</h1>
            <p>Upload a Primavera P6 export (.xer) on the left. Its metrics will appear here.</p>
          </div>
        ) : loading && !metrics ? (
          <p className="loading" role="status">
            Loading metrics…
          </p>
        ) : metrics ? (
          <div className={loading ? "is-refreshing" : ""}>
            <Dashboard key={metrics.update.id} data={metrics} warnings={warnings} />
          </div>
        ) : null}
      </main>
    </div>
  );
}

function UploadNotice({ file, result, onClose }: { file: string; result: UploadResult; onClose: () => void }) {
  if (result.kind === "ok") {
    return (
      <div className="banner banner-ok" role="status">
        <p>
          Imported {file}: {result.activities.toLocaleString("en-US")} activities
          {result.warnings.length > 0 ? `, ${result.warnings.length} warnings to check below.` : "."}
        </p>
        <button type="button" className="btn btn-quiet" onClick={onClose}>
          Dismiss
        </button>
      </div>
    );
  }
  if (result.kind === "duplicate") {
    return (
      <div className="banner" role="status">
        <p>{file} was already uploaded with this character set. Showing that update.</p>
        <button type="button" className="btn btn-quiet" onClick={onClose}>
          Dismiss
        </button>
      </div>
    );
  }
  return (
    <div className="banner banner-error" role="alert">
      <div>
        <p>
          <strong>{file} wasn't imported.</strong> {result.kind === "invalid" ? "Nothing was saved. Fix these problems in P6 and export again:" : result.message}
        </p>
        {result.kind === "invalid" && <IssueList issues={result.errors} />}
      </div>
      <button type="button" className="btn btn-quiet" onClick={onClose}>
        Dismiss
      </button>
    </div>
  );
}
