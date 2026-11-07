import type { Issue } from "../api";

/** Errors or warnings with where they are in the file. */
export function IssueList({ issues, max = 50 }: { issues: Issue[]; max?: number }) {
  const shown = issues.slice(0, max);
  return (
    <ul className="issues">
      {shown.map((i, idx) => (
        <li key={idx}>
          <span className="issue-where">
            {i.line ? `Line ${i.line}` : "File"}
            {i.table ? `, ${i.table}` : ""}
            {i.field ? `.${i.field}` : ""}
          </span>
          <span className="issue-msg">{i.message}</span>
        </li>
      ))}
      {issues.length > max && <li className="issues-more">And {issues.length - max} more.</li>}
    </ul>
  );
}
