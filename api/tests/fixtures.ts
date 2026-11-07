/**
 * Small hand-written XER files for tests. Each test changes one thing
 * so we know exactly which rule it exercises.
 */
export const HEADER = "ERMHDR\t20.12\t2024-01-15\tProject\tadmin\tAdmin\tdbxDatabaseNoName\tProject Management\tMXN";

export const PROJECT = [
  "%T\tPROJECT",
  "%F\tproj_id\tproj_short_name\tlast_recalc_date\tplan_start_date\tplan_end_date\tscd_end_date",
  "%R\t100\tTORRE-A\t2024-03-01 00:00\t2024-01-08 08:00\t\t2024-12-20 17:00",
];

export const WBS = [
  "%T\tPROJWBS",
  "%F\twbs_id\tproj_id\twbs_short_name\twbs_name\tparent_wbs_id\tproj_node_flag",
  "%R\t10\t100\tTORRE-A\tTorre A\t\tY",
  "%R\t11\t100\tCIM\tCimentación\t10\tN",
];

export const TASK_FIELDS =
  "%F\ttask_id\tproj_id\twbs_id\ttask_code\ttask_name\ttask_type\tstatus_code\tcomplete_pct_type\tphys_complete_pct\t" +
  "target_drtn_hr_cnt\tremain_drtn_hr_cnt\ttotal_float_hr_cnt\tfree_float_hr_cnt\tact_start_date\tact_end_date\t" +
  "early_start_date\tearly_end_date\tlate_start_date\tlate_end_date\ttarget_start_date\ttarget_end_date\tdriving_path_flag";

export function taskRow(o: Partial<Record<string, string>> = {}): string {
  const d: Record<string, string> = {
    task_id: "1000",
    proj_id: "100",
    wbs_id: "11",
    task_code: "A1000",
    task_name: "Excavación",
    task_type: "TT_Task",
    status_code: "TK_Complete",
    complete_pct_type: "CP_Drtn",
    phys_complete_pct: "100",
    target_drtn_hr_cnt: "80",
    remain_drtn_hr_cnt: "0",
    total_float_hr_cnt: "",
    free_float_hr_cnt: "",
    act_start_date: "2024-01-08 08:00",
    act_end_date: "2024-01-19 17:00",
    early_start_date: "",
    early_end_date: "",
    late_start_date: "",
    late_end_date: "",
    target_start_date: "2024-01-08 08:00",
    target_end_date: "2024-01-19 17:00",
    driving_path_flag: "N",
    ...o,
  };
  const order = TASK_FIELDS.split("\t").slice(1);
  return ["%R", ...order.map((f) => d[f] ?? "")].join("\t");
}

export const DEFAULT_TASKS = [
  "%T\tTASK",
  TASK_FIELDS,
  taskRow(),
  taskRow({
    task_id: "1001",
    task_code: "A1010",
    task_name: "Colado de zapatas",
    status_code: "TK_Active",
    phys_complete_pct: "40",
    remain_drtn_hr_cnt: "48",
    total_float_hr_cnt: "0",
    act_start_date: "2024-01-22 08:00",
    act_end_date: "",
    early_start_date: "2024-03-01 08:00",
    early_end_date: "2024-03-08 17:00",
    driving_path_flag: "Y",
  }),
];

export const PRED = [
  "%T\tTASKPRED",
  "%F\ttask_pred_id\ttask_id\tpred_task_id\tproj_id\tpred_proj_id\tpred_type\tlag_hr_cnt",
  "%R\t5000\t1001\t1000\t100\t100\tPR_FS\t0",
];

/** Builds a complete file. Pass replacement sections to break one thing at a time. */
export function xer(
  parts: { header?: string; project?: string[]; wbs?: string[]; tasks?: string[]; pred?: string[]; end?: boolean } = {},
  eol = "\n",
): string {
  const lines = [
    parts.header ?? HEADER,
    ...(parts.project ?? PROJECT),
    ...(parts.wbs ?? WBS),
    ...(parts.tasks ?? DEFAULT_TASKS),
    ...(parts.pred ?? PRED),
    ...(parts.end === false ? [] : ["%E"]),
  ];
  return lines.join(eol) + eol;
}

export const utf8 = (s: string) => new TextEncoder().encode(s);

/** Encodes text as Windows-1252, the encoding most P6 exports use. */
export function cp1252(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80 || (c >= 0xa0 && c <= 0xff)) out.push(c);
    else throw new Error(`Character ${ch} not supported in this test helper`);
  }
  return Uint8Array.from(out);
}
