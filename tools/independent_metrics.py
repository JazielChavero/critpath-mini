"""
Independent check of the metrics.

Re-implements the formula table (api/src/metrics/definitions.ts) in Python,
reading the XER file with its own minimal reader. It shares no code with the
TypeScript app, so if both produce the same numbers we can trust them.

Usage: python3 tools/independent_metrics.py api/samples/airport.xer
"""
import json
import sys
from datetime import datetime


def read_tables(path):
    raw = open(path, "rb").read()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode("cp1252")
    tables, cur, fields = {}, None, []
    for line in text.replace("\r\n", "\n").split("\n"):
        parts = line.split("\t")
        if parts[0] == "%T":
            cur = parts[1]
            tables[cur] = []
        elif parts[0] == "%F":
            fields = parts[1:]
        elif parts[0] == "%R":
            tables[cur].append(dict(zip(fields, parts[1:])))
    return tables


def iso(v):
    if not v:
        return None
    return datetime.strptime(v, "%Y-%m-%d %H:%M")


def num(v):
    return float(v) if v not in ("", None) else None


def metrics(path):
    t = read_tables(path)
    proj = t["PROJECT"][0]
    pid = proj["proj_id"]
    data_date = iso(proj["last_recalc_date"])
    crit_hrs = num(proj.get("critical_drtn_hr_cnt")) or 0
    longest = proj.get("critical_path_type") == "CT_DrivPath"

    acts = [r for r in t["TASK"] if r["proj_id"] == pid and r["task_type"] not in ("TT_LOE", "TT_WBS")]
    inc = [r for r in acts if r["status_code"] != "TK_Complete"]

    planned = done = 0.0
    for r in acts:
        p = num(r["target_drtn_hr_cnt"]) or 0
        if p <= 0:
            continue
        planned += p
        if r["status_code"] == "TK_Complete":
            done += p
        else:
            rem = num(r["remain_drtn_hr_cnt"])
            rem = p if rem is None else rem
            done += min(p, max(0.0, p - rem))

    def critical(r):
        if longest:
            return r.get("driving_path_flag") == "Y"
        tf = num(r["total_float_hr_cnt"])
        return tf is not None and tf <= crit_hrs

    ids = {r["task_id"] for r in acts}
    has_pred, has_succ = set(), set()
    for rel in t.get("TASKPRED", []):
        if rel["task_id"] in ids and rel["pred_task_id"] in ids:
            has_pred.add(rel["task_id"])
            has_succ.add(rel["pred_task_id"])

    bl_fin = max((iso(r["target_end_date"]) for r in acts if r["target_end_date"]), default=None)
    fc_fin = iso(proj.get("scd_end_date"))
    if fc_fin is None:
        cands = [iso(r["early_end_date"]) for r in inc if r["early_end_date"]]
        cands += [iso(r["act_end_date"]) for r in acts if r["status_code"] == "TK_Complete" and r["act_end_date"]]
        fc_fin = max(cands, default=None)

    fmt = lambda d: d.strftime("%Y-%m-%dT%H:%M:%S") if d else None
    return {
        "data_date": fmt(data_date),
        "total_activities": len(acts),
        "completed": sum(r["status_code"] == "TK_Complete" for r in acts),
        "in_progress": sum(r["status_code"] == "TK_Active" for r in acts),
        "not_started": sum(r["status_code"] == "TK_NotStart" for r in acts),
        "milestones": sum(r["task_type"] in ("TT_Mile", "TT_FinMile") for r in acts),
        "percent_complete_duration": round(done / planned * 100, 1) if planned else None,
        "critical_activities": sum(critical(r) for r in inc),
        "negative_float_activities": sum(
            1 for r in inc if num(r["total_float_hr_cnt"]) is not None and num(r["total_float_hr_cnt"]) < 0
        ),
        "late_starts": sum(
            1 for r in acts if r["status_code"] == "TK_NotStart" and r["target_start_date"]
            and iso(r["target_start_date"]) < data_date
        ),
        "late_finishes": sum(1 for r in inc if r["target_end_date"] and iso(r["target_end_date"]) < data_date),
        "missing_predecessors": sum(1 for r in inc if r["task_type"] != "TT_Mile" and r["task_id"] not in has_pred),
        "missing_successors": sum(1 for r in inc if r["task_type"] != "TT_FinMile" and r["task_id"] not in has_succ),
        "baseline_finish": fmt(bl_fin),
        "forecast_finish": fmt(fc_fin),
        "finish_variance_days": round((fc_fin - bl_fin).total_seconds() / 86400, 1) if bl_fin and fc_fin else None,
    }


if __name__ == "__main__":
    for p in sys.argv[1:]:
        print(p.split("/")[-1], json.dumps(metrics(p)))
