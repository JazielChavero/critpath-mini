/**
 * Upload a new schedule update (drag a .xer file or pick one) and switch
 * between the updates already uploaded.
 */
import { useRef, useState, type DragEvent } from "react";
import type { UpdateSummary } from "../api";
import { fmtDate, fmtInt, fmtUploaded } from "../format";
import { useI18n } from "../i18n";

export const ENCODINGS: { value: string; label: string }[] = [
  { value: "windows-1256", label: "Arabic (Windows-1256)" },
  { value: "windows-1250", label: "Central European (Windows-1250)" },
  { value: "windows-1251", label: "Cyrillic (Windows-1251)" },
  { value: "windows-1253", label: "Greek (Windows-1253)" },
  { value: "windows-1255", label: "Hebrew (Windows-1255)" },
  { value: "windows-1254", label: "Turkish (Windows-1254)" },
];

interface Props {
  updates: UpdateSummary[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onUpload: (file: File, encoding: string) => void;
  uploading: string | null;
}

export function Sidebar({ updates, selectedId, onSelect, onUpload, uploading }: Props) {
  const { t, lang } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [encoding, setEncoding] = useState("");

  const pick = (files: FileList | null) => {
    const f = files?.[0];
    if (f) onUpload(f, encoding);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!uploading) pick(e.dataTransfer.files);
  };

  return (
    <aside className="sidebar">
      <div
        className={`dropzone ${dragging ? "is-dragging" : ""} ${uploading ? "is-busy" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {uploading ? (
          <p className="dropzone-title" role="status">
            {t("checking", { file: uploading })}
          </p>
        ) : (
          <>
            <p className="dropzone-title">{t("dropTitle")}</p>
            <button type="button" className="btn btn-quiet" onClick={() => input.current?.click()}>
              {t("chooseFile")}
            </button>
          </>
        )}
        <input
          ref={input}
          type="file"
          accept=".xer"
          hidden
          onChange={(e) => {
            pick(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      <label className="encoding">
        <span>{t("charset")}</span>
        <select value={encoding} onChange={(e) => setEncoding(e.target.value)} disabled={!!uploading}>
          <option value="">{t("charsetAuto")}</option>
          {ENCODINGS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <h2 className="sidebar-title">{t("updatesTitle")}</h2>
      {updates.length === 0 ? (
        <p className="sidebar-empty">{t("updatesEmpty")}</p>
      ) : (
        <ol className="update-list">
          {updates.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                className={u.id === selectedId ? "is-selected" : ""}
                aria-current={u.id === selectedId ? "true" : undefined}
                onClick={() => onSelect(u.id)}
              >
                <span className="update-project">{u.project ?? u.file_name}</span>
                <span className="update-date">{t("dataDateOn", { date: fmtDate(u.data_date, lang) })}</span>
                <span className="update-meta">
                  {t("updateMeta", { n: fmtInt(u.activities, lang), when: fmtUploaded(u.uploaded_at, lang) })}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
