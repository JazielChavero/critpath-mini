/**
 * English / Spanish. Small on purpose: one dictionary, one hook.
 * Metric names and formulas are NOT here: they come translated from the API's
 * formula table, so there is only one place where a formula is written.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "es";

const en = {
  tagline: "Monthly P6 schedule updates, checked and summarised.",
  email: "Email",
  password: "Password",
  logIn: "Log in",
  loggingIn: "Logging in…",
  wrongLogin: "Wrong email or password.",
  loginFailed: "Could not log in. Check that the server is running.",
  logOut: "Log out",
  switchTo: "Español",
  switchToLabel: "Cambiar a español",

  dropTitle: "Drop a P6 export (.xer) here",
  chooseFile: "Choose file",
  checking: "Checking {file}…",
  charset: "Character set for names",
  charsetAuto: "Detect automatically",
  updatesTitle: "Schedule updates",
  updatesEmpty: "Nothing uploaded yet. Upload this month's schedule to see how the project is doing.",
  dataDateOn: "Data date {date}",
  updateMeta: "{n} activities, uploaded {when}",

  emptyTitle: "No schedule yet",
  emptyBody: "Upload a Primavera P6 export (.xer) on the left. Its metrics will appear here.",
  loading: "Loading metrics…",
  dismiss: "Dismiss",
  imported: "Imported {file}: {n} activities.",
  importedWarn: "Imported {file}: {n} activities, {w} warnings to check below.",
  duplicate: "{file} was already uploaded with this character set. Showing that update.",
  notImported: "{file} wasn't imported.",
  nothingSaved: "Nothing was saved. Fix these problems in P6 and export again:",
  sessionEnded: "Your session ended. Log in again.",

  updateLine: "Update #{id}, {file}, P6 {version}",
  projectsInFile: "Projects in this file",
  noForecast: "The file has no forecast finish date.",
  forecastOn: "Forecast to finish on {date}.",
  forecastLate: "Forecast to finish on {date}, {days} days after the baseline.",
  forecastEarly: "Forecast to finish on {date}, {days} days ahead of the baseline.",
  forecastEven: "Forecast to finish on {date}, exactly on the baseline.",

  timeline: "Project timeline",
  plannedStart: "Planned start",
  dataDate: "Data date",
  baselineFinish: "Baseline finish",
  forecastFinish: "Forecast finish",
  vsBaseline: "{days} vs baseline",

  progress: "Progress",
  completeByDuration: "complete, weighted by planned duration",
  completed: "{n} completed",
  inProgress: "{n} in progress",
  notStarted: "{n} not started",

  atRisk: "Where the schedule is at risk",
  logicScope: "Logic and scope",
  showFormula: "Show how this is calculated",

  criticalTitle: "Critical activities",
  criticalNone: "No incomplete activity is critical.",
  criticalShowing: "Showing {shown} of {total}, lowest float first.",
  colActivity: "Activity",
  colStatus: "Status",
  colFloat: "Total float",
  colBaselineFinish: "Baseline finish",
  colEarlyFinish: "Early finish",
  status_not_started: "Not started",
  status_in_progress: "In progress",
  status_completed: "Completed",
  hoursAssumed: "Float is shown in days assuming {h} working hours per day: this file doesn't include the calendar's hours.",

  warningsTitle: "Import warnings",
  warningsNone: "None.",
  warningsSome: "{n} found. The file was imported, but check these.",
  issueLine: "Line {n}",
  issueFile: "File",
  issuesMore: "And {n} more.",
  messagesInEnglish: "",
};

type Dict = typeof en;

const es: Dict = {
  tagline: "Actualizaciones mensuales del programa de P6, revisadas y resumidas.",
  email: "Correo",
  password: "Contraseña",
  logIn: "Entrar",
  loggingIn: "Entrando…",
  wrongLogin: "Correo o contraseña incorrectos.",
  loginFailed: "No se pudo entrar. Revisa que el servidor esté corriendo.",
  logOut: "Salir",
  switchTo: "English",
  switchToLabel: "Switch to English",

  dropTitle: "Arrastra aquí una exportación de P6 (.xer)",
  chooseFile: "Elegir archivo",
  checking: "Revisando {file}…",
  charset: "Codificación de los nombres",
  charsetAuto: "Detectar automáticamente",
  updatesTitle: "Actualizaciones del programa",
  updatesEmpty: "Aún no hay nada. Sube el programa de este mes para ver cómo va la obra.",
  dataDateOn: "Fecha de corte {date}",
  updateMeta: "{n} actividades, subido {when}",

  emptyTitle: "Todavía no hay programa",
  emptyBody: "Sube una exportación de Primavera P6 (.xer) a la izquierda. Aquí aparecerán sus métricas.",
  loading: "Cargando métricas…",
  dismiss: "Cerrar",
  imported: "{file} importado: {n} actividades.",
  importedWarn: "{file} importado: {n} actividades, {w} advertencias para revisar abajo.",
  duplicate: "{file} ya se había subido con esta codificación. Se muestra esa actualización.",
  notImported: "{file} no se importó.",
  nothingSaved: "No se guardó nada. Corrige estos problemas en P6 y vuelve a exportar:",
  sessionEnded: "Tu sesión terminó. Vuelve a entrar.",

  updateLine: "Actualización #{id}, {file}, P6 {version}",
  projectsInFile: "Proyectos en este archivo",
  noForecast: "El archivo no tiene fecha de fin pronosticada.",
  forecastOn: "Se pronostica terminar el {date}.",
  forecastLate: "Se pronostica terminar el {date}, {days} días después de la línea base.",
  forecastEarly: "Se pronostica terminar el {date}, {days} días antes de la línea base.",
  forecastEven: "Se pronostica terminar el {date}, justo en la línea base.",

  timeline: "Línea de tiempo del proyecto",
  plannedStart: "Inicio planeado",
  dataDate: "Fecha de corte",
  baselineFinish: "Fin de línea base",
  forecastFinish: "Fin pronosticado",
  vsBaseline: "{days} vs. línea base",

  progress: "Avance",
  completeByDuration: "de avance, ponderado por duración planeada",
  completed: "{n} terminadas",
  inProgress: "{n} en progreso",
  notStarted: "{n} sin iniciar",

  atRisk: "Dónde está el riesgo",
  logicScope: "Lógica y alcance",
  showFormula: "Ver cómo se calcula",

  criticalTitle: "Actividades críticas",
  criticalNone: "Ninguna actividad sin terminar es crítica.",
  criticalShowing: "Se muestran {shown} de {total}, de menor a mayor holgura.",
  colActivity: "Actividad",
  colStatus: "Estado",
  colFloat: "Holgura total",
  colBaselineFinish: "Fin de línea base",
  colEarlyFinish: "Fin temprano",
  status_not_started: "Sin iniciar",
  status_in_progress: "En progreso",
  status_completed: "Terminada",
  hoursAssumed: "La holgura se muestra en días suponiendo {h} horas laborables por día: este archivo no incluye las horas del calendario.",

  warningsTitle: "Advertencias de la importación",
  warningsNone: "Ninguna.",
  warningsSome: "{n} encontradas. El archivo se importó, pero revísalas.",
  issueLine: "Línea {n}",
  issueFile: "Archivo",
  issuesMore: "Y {n} más.",
  messagesInEnglish: "Los detalles de los problemas del archivo están en inglés.",
};

const DICTS: Record<Lang, Dict> = { en, es };
export type TKey = keyof Dict;

export function translate(lang: Lang, key: TKey, vars: Record<string, string | number> = {}): string {
  return DICTS[lang][key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

const STORAGE_KEY = "critpath.lang";

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "es") return saved;
  } catch {
    /* storage unavailable */
  }
  return navigator.language?.toLowerCase().startsWith("es") ? "es" : "en";
}

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TKey, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* not remembered, still works */
    }
  };
  return <Ctx.Provider value={{ lang, setLang, t: (k, v) => translate(lang, k, v) }}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const c = useContext(Ctx);
  if (!c) throw new Error("useI18n outside I18nProvider");
  return c;
}

export function LangToggle({ className = "" }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <button
      type="button"
      className={`btn btn-quiet ${className}`}
      lang={lang === "en" ? "es" : "en"}
      aria-label={t("switchToLabel")}
      onClick={() => setLang(lang === "en" ? "es" : "en")}
    >
      {t("switchTo")}
    </button>
  );
}
