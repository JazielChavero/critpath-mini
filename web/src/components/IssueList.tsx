import type { Issue } from "../api";
import { useI18n } from "../i18n";

/** Errors or warnings with where they are in the file. Messages come from the API in English. */
export function IssueList({ issues, max = 50 }: { issues: Issue[]; max?: number }) {
  const { t } = useI18n();
  const shown = issues.slice(0, max);
  const note = t("messagesInEnglish");
  return (
    <>
      <ul className="issues">
        {shown.map((i, idx) => (
          <li key={idx}>
            <span className="issue-where">
              {i.line ? t("issueLine", { n: i.line }) : t("issueFile")}
              {i.table ? `, ${i.table}` : ""}
              {i.field ? `.${i.field}` : ""}
            </span>
            <span className="issue-msg" lang="en">{i.message}</span>
          </li>
        ))}
        {issues.length > max && <li className="issues-more">{t("issuesMore", { n: issues.length - max })}</li>}
      </ul>
      {note && <p className="note">{note}</p>}
    </>
  );
}
