#!/usr/bin/env python3
"""
activity-report — Claude Code activity HTML + terminal report.

Analyses prompts from ~/.claude/history.jsonl, classifies time into business
vs out-of-hours zones, computes continuous-block "hours worked", and renders
a self-contained HTML report alongside a terminal summary.

Run `./report.py --help` for options.
"""
from __future__ import annotations
import argparse, json, os, re, subprocess, sys
from collections import Counter, defaultdict
from datetime import datetime, timezone, timedelta
from pathlib import Path

try:
    from zoneinfo import ZoneInfo
except ImportError:
    print("Python 3.9+ required (zoneinfo missing)", file=sys.stderr)
    sys.exit(1)

HOME = Path.home()

# ────────────────────────────────────────────────────────────────────────────
# Arg parsing
# ────────────────────────────────────────────────────────────────────────────
def parse_args():
    p = argparse.ArgumentParser(
        description="Claude Code activity report (HTML + terminal)",
        formatter_class=argparse.RawDescriptionHelpFormatter)
    today = datetime.now().date()
    p.add_argument("--since", type=str,
                   default=(today - timedelta(days=60)).isoformat(),
                   help="Start date YYYY-MM-DD (default: 60 days ago)")
    p.add_argument("--until", type=str, default=today.isoformat(),
                   help="End date YYYY-MM-DD (default: today)")
    p.add_argument("--business", type=str, default="09-16",
                   help="Business hours as H1-H2 (24h local, inclusive start, exclusive end). Default: 09-16")
    p.add_argument("--out", type=str, default=str(HOME/"claude-activity-report.html"),
                   help="HTML output path (default: ~/claude-activity-report.html)")
    p.add_argument("--tz", type=str, default=None,
                   help="IANA timezone (default: $TZ env var, else Pacific/Auckland)")
    p.add_argument("--git", type=str, default=None,
                   help="Git repo path to include commit stats (optional)")
    p.add_argument("--gh-repo", dest="gh_repo", type=str, default=None,
                   help="GitHub OWNER/REPO for PR stats (auto-detected from --git if omitted)")
    p.add_argument("--include", action="append", default=None,
                   help="Only include prompts from project paths starting with PATH (repeatable)")
    p.add_argument("--exclude", action="append", default=None,
                   help="Exclude project paths (repeatable). Default excludes .claude-mem*")
    p.add_argument("--history", type=str, default=str(HOME/".claude"/"history.jsonl"),
                   help="Path to history.jsonl (default: ~/.claude/history.jsonl)")
    p.add_argument("--block-gap", dest="block_gap", type=int, default=60,
                   help="Max gap in minutes to still count as same continuous block (default: 60)")
    p.add_argument("--no-html", dest="no_html", action="store_true",
                   help="Skip HTML output; terminal summary only")
    a = p.parse_args()

    # Parse business hours
    m = re.match(r"^(\d{1,2})-(\d{1,2})$", a.business.strip())
    if not m:
        p.error(f"--business must be H1-H2 (got {a.business!r})")
    a.bh_start = int(m.group(1)); a.bh_end = int(m.group(2))
    if not (0 <= a.bh_start < a.bh_end <= 24):
        p.error(f"--business: need 0 ≤ H1 < H2 ≤ 24")

    # Parse dates
    try:
        a.since_date = datetime.strptime(a.since, "%Y-%m-%d").date()
        a.until_date = datetime.strptime(a.until, "%Y-%m-%d").date()
    except ValueError as e:
        p.error(f"bad date: {e}")
    if a.since_date > a.until_date:
        p.error("--since must be ≤ --until")

    # Timezone — prefer explicit flag, then $TZ env var, then Pacific/Auckland.
    # (System local is avoided because servers often run UTC, which misclassifies hours.)
    tz_candidate = a.tz or os.environ.get("TZ") or "Pacific/Auckland"
    try:
        a.tzinfo = ZoneInfo(tz_candidate)
        a.tz_name = tz_candidate
    except Exception:
        p.error(f"unknown timezone: {tz_candidate}")

    # Exclude defaults
    if a.exclude is None:
        a.exclude = [str(HOME/".claude-mem")]
    a.block_gap_s = a.block_gap * 60
    return a

def auto_detect_gh_repo(repo_path):
    try:
        url = subprocess.check_output(
            ["git","-C",repo_path,"remote","get-url","origin"],
            stderr=subprocess.DEVNULL).decode().strip()
        m = re.search(r"github\.com[:/]([^/]+/[^/.]+)", url)
        if m: return m.group(1)
    except Exception:
        pass
    return None

# ────────────────────────────────────────────────────────────────────────────
# Data loading
# ────────────────────────────────────────────────────────────────────────────
def in_range(t, start_utc, end_utc): return start_utc <= t <= end_utc

def project_passes(path, include, exclude):
    if not path: return False
    for ex in exclude or []:
        if path.startswith(ex): return False
    if include:
        return any(path.startswith(inc) for inc in include)
    return True

def load_prompts(args, start_utc, end_utc):
    """Return dict: local date → sorted list of local datetimes."""
    by_day = defaultdict(list)
    path = Path(args.history)
    if not path.exists():
        return by_day
    with open(path) as f:
        for line in f:
            try: d = json.loads(line)
            except: continue
            ts = d.get("timestamp")
            if not ts: continue
            try: t = datetime.fromtimestamp(int(ts)/1000, tz=timezone.utc)
            except: continue
            if not in_range(t, start_utc, end_utc): continue
            if not project_passes(d.get("project",""), args.include, args.exclude): continue
            lt = t.astimezone(args.tzinfo)
            by_day[lt.date()].append(lt)
    for k in by_day: by_day[k].sort()
    return by_day

def load_commits(args, start_utc, end_utc):
    """Return (by_day_total, by_day_primary_author, by_day_other)."""
    total = Counter(); main = Counter(); other = Counter()
    if not args.git: return total, main, other, None
    repo = args.git
    if not Path(repo).is_dir(): return total, main, other, None
    try:
        out = subprocess.check_output(
            ["git","-C",repo,"log","--all","--no-merges",
             f"--since={args.since_date.isoformat()}",
             f"--until={(args.until_date + timedelta(days=1)).isoformat()}",
             "--pretty=format:%aI|%an"],
            stderr=subprocess.DEVNULL).decode()
    except Exception:
        return total, main, other, None
    # Find the most frequent author (excluding bots) to be the "primary"
    author_counts = Counter()
    rows = []
    for line in out.splitlines():
        parts = line.split("|", 1)
        if len(parts) < 2: continue
        iso, author = parts
        try: t = datetime.fromisoformat(iso).astimezone(timezone.utc)
        except: continue
        if not in_range(t, start_utc, end_utc): continue
        rows.append((t, author))
        if "[bot]" not in author:
            author_counts[author] += 1
    primary = author_counts.most_common(1)[0][0] if author_counts else None
    for t, author in rows:
        d = t.astimezone(args.tzinfo).date()
        total[d] += 1
        if author == primary: main[d] += 1
        else: other[d] += 1
    return total, main, other, primary

def load_prs(args, start_utc, end_utc):
    """Return (opened, merged, closed_unmerged) counters keyed by local date."""
    opened = Counter(); merged = Counter(); closed = Counter()
    gh_repo = args.gh_repo
    if not gh_repo and args.git:
        gh_repo = auto_detect_gh_repo(args.git)
    if not gh_repo: return opened, merged, closed, None
    try:
        out = subprocess.check_output(
            ["gh","pr","list","--repo",gh_repo,"--state","all","--limit","500",
             "--search", f"created:>={args.since_date.isoformat()}",
             "--json","number,createdAt,mergedAt,closedAt"],
            stderr=subprocess.DEVNULL).decode()
        prs = json.loads(out)
    except Exception:
        return opened, merged, closed, gh_repo
    for pr in prs:
        def pick(k):
            v = pr.get(k)
            if not v: return None
            try: return datetime.fromisoformat(v.replace("Z","+00:00"))
            except: return None
        ct = pick("createdAt"); mt = pick("mergedAt"); cl = pick("closedAt")
        if ct and in_range(ct, start_utc, end_utc):
            opened[ct.astimezone(args.tzinfo).date()] += 1
        if mt and in_range(mt, start_utc, end_utc):
            merged[mt.astimezone(args.tzinfo).date()] += 1
        if cl and not pr.get("mergedAt") and in_range(cl, start_utc, end_utc):
            closed[cl.astimezone(args.tzinfo).date()] += 1
    return opened, merged, closed, gh_repo

# ────────────────────────────────────────────────────────────────────────────
# Block / zone computation
# ────────────────────────────────────────────────────────────────────────────
def compute_blocks(times, gap_s):
    if not times: return []
    blocks=[]; s=times[0]; last=times[0]; n=1
    for t in times[1:]:
        if (t-last).total_seconds() < gap_s:
            last=t; n+=1
        else:
            blocks.append((s,last,n)); s=t; last=t; n=1
    blocks.append((s,last,n))
    return blocks

def zone_for_hour(h, bh_start, bh_end):
    """Return (zone_key_css, zone_key_counter). CSS uses dash, counter uses underscore."""
    if bh_start <= h < bh_end: return "business", "business"
    if 5 <= h < bh_start: return "early", "early"
    if bh_end <= h < 20: return "evening", "evening"
    if 20 <= h < 23: return "late-eve", "late_eve"
    return "overnight", "overnight"

def split_block_zones(s_local, e_local, bh_start, bh_end):
    """Walk minute-by-minute through a block, accumulate seconds per zone."""
    zones = Counter()
    if s_local == e_local: return 0.0, 0.0, zones
    total = (e_local - s_local).total_seconds()
    iters = int(total // 60)
    cur = s_local
    step = timedelta(seconds=60)
    in_s = out_s = 0.0
    for _ in range(iters):
        _, zk = zone_for_hour(cur.hour, bh_start, bh_end)
        zones[zk] += 60
        if zk == "business": in_s += 60
        else: out_s += 60
        cur += step
    rem = total - iters*60
    if rem > 0:
        _, zk = zone_for_hour(cur.hour, bh_start, bh_end)
        zones[zk] += rem
        if zk == "business": in_s += rem
        else: out_s += rem
    return in_s, out_s, zones

# ────────────────────────────────────────────────────────────────────────────
# Formatting
# ────────────────────────────────────────────────────────────────────────────
DAY_NAMES = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]

def fmt_h(seconds):
    if seconds <= 0: return "—"
    m = int(round(seconds/60))
    return f"{m//60}h{m%60:02d}"

def week_key(d): return d - timedelta(days=d.weekday())

# ────────────────────────────────────────────────────────────────────────────
# HTML rendering
# ────────────────────────────────────────────────────────────────────────────
HTML_CSS = r"""
  :root {
    --bg: #0f1419; --panel: #1a1f26; --border: #2a3038;
    --ink: #d4d4d4; --ink-dim: #8a8f96; --accent: #78c7ff;
    --business: #78c7ff; --early: #9fd8a3; --evening: #ffb86c;
    --late-eve: #ff8c42; --overnight: #c678dd;
    --bar: #4a7fb8; --bar-bg: #232830;
  }
  @media (prefers-color-scheme: light) {
    :root {
      --bg: #fafaf8; --panel: #ffffff; --border: #e2e4e8;
      --ink: #1d2025; --ink-dim: #6a7280; --accent: #1e6fba;
      --business: #6ea8dc; --early: #7cb88a; --evening: #e68f3f;
      --late-eve: #d16a2a; --overnight: #9857c3;
      --bar: #4a7fb8; --bar-bg: #eef1f5;
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--bg); color: var(--ink);
    font: 14px/1.5 ui-sans-serif, -apple-system, "Segoe UI", sans-serif;
    padding: 24px; max-width: 1400px; margin: 0 auto;
  }
  h1, h2, h3 { color: var(--ink); margin: 1.6em 0 0.5em; }
  h1 { font-size: 1.7em; margin-top: 0; }
  h2 { font-size: 1.25em; border-bottom: 1px solid var(--border); padding-bottom: 6px; }
  h3 { font-size: 1.05em; color: var(--ink-dim); }
  .sub { color: var(--ink-dim); font-size: 0.92em; margin-top: -0.3em; }
  .panel { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 16px 20px; margin: 12px 0; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
  .stat { background: var(--panel); border: 1px solid var(--border); border-radius: 6px; padding: 12px 14px; }
  .stat .v { font-size: 1.8em; font-weight: 600; color: var(--accent); }
  .stat .l { color: var(--ink-dim); font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.04em; }
  table { border-collapse: collapse; width: 100%; font-size: 0.92em; }
  th, td { padding: 5px 8px; text-align: left; border-bottom: 1px solid var(--border); white-space: nowrap; }
  th { color: var(--ink-dim); font-weight: 500; text-align: left; font-size: 0.8em; text-transform: uppercase; letter-spacing: 0.04em; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  tr.week-sep td { border-top: 2px solid var(--border); background: rgba(120,199,255,0.04); padding: 4px 8px; font-weight: 600; color: var(--accent); font-size: 0.85em; }
  .hbar { display: inline-block; width: 160px; height: 14px; background: var(--bar-bg); border-radius: 2px; position: relative; vertical-align: middle; }
  .hbar .in { position: absolute; top:0; bottom:0; left:0; background: var(--business); border-radius: 2px 0 0 2px; }
  .hbar .out { position: absolute; top:0; bottom:0; background: var(--late-eve); border-radius: 0 2px 2px 0; }
  .timeline { display: inline-flex; gap: 0; vertical-align: middle; }
  .tc { display: inline-block; width: 7px; height: 14px; margin-right: 1px; background: transparent; }
  .tc.block-gap { opacity: 0.35; }
  .tc.block-prompt { opacity: 1; }
  .tc.singleton { opacity: 0.6; height: 6px; margin-top: 4px; }
  .tc.z-business { background: var(--business); }
  .tc.z-early { background: var(--early); }
  .tc.z-evening { background: var(--evening); }
  .tc.z-late-eve { background: var(--late-eve); }
  .tc.z-overnight { background: var(--overnight); }
  .heatcell { display: inline-block; width: 28px; height: 22px; margin: 1px; text-align: center; line-height: 22px; font-size: 0.78em; font-variant-numeric: tabular-nums; border-radius: 2px; background: var(--bar-bg); }
  .heatcell.h0 { color: var(--ink-dim); }
  .heatcell.h1 { background: rgba(120,199,255,0.12); }
  .heatcell.h2 { background: rgba(120,199,255,0.25); }
  .heatcell.h3 { background: rgba(120,199,255,0.40); }
  .heatcell.h4 { background: rgba(120,199,255,0.55); color: white; }
  .heatcell.h5 { background: rgba(120,199,255,0.70); color: white; }
  .heatcell.h6 { background: rgba(120,199,255,0.85); color: white; }
  .heatcell.h7 { background: var(--business); color: white; }
  .stack { display: inline-flex; width: 100%; height: 24px; border-radius: 4px; overflow: hidden; }
  .stack > div { display: flex; align-items: center; justify-content: center; color: #fff; font-size: 0.78em; font-weight: 600; }
  .stack .sz-business { background: var(--business); }
  .stack .sz-early { background: var(--early); }
  .stack .sz-evening { background: var(--evening); }
  .stack .sz-late-eve { background: var(--late-eve); }
  .stack .sz-overnight { background: var(--overnight); }
  .sw { display: inline-block; width: 12px; height: 12px; vertical-align: middle; margin-right: 4px; border-radius: 2px; }
  .meta { color: var(--ink-dim); font-size: 0.9em; }
  .idle { color: var(--ink-dim); font-style: italic; }
"""

def render_timeline_cells(times, blocks, bh_start, bh_end):
    cells = [("empty", None)] * 48
    prompt_cells = set()
    for t in times:
        prompt_cells.add(t.hour*2 + (1 if t.minute>=30 else 0))
    for s, e, n in blocks:
        s_idx = s.hour*2 + (1 if s.minute>=30 else 0)
        e_idx = e.hour*2 + (1 if e.minute>=30 else 0)
        if n == 1:
            zc, _ = zone_for_hour(s.hour, bh_start, bh_end)
            cells[s_idx] = ("singleton", zc)
        else:
            for i in range(s_idx, e_idx+1):
                zc, _ = zone_for_hour(i // 2, bh_start, bh_end)
                state = "block-prompt" if i in prompt_cells else "block-gap"
                cells[i] = (state, zc)
    out = []
    for state, zone in cells:
        cls = f"tc {state}" + (f" z-{zone}" if zone else "")
        out.append(f'<span class="{cls}"></span>')
    return "".join(out)

def render_html(args, day_rows, weeks, totals):
    bh = (args.bh_start, args.bh_end)
    zone_defs = [
        ("business", f"Business ({args.bh_start:02d}:00–{args.bh_end:02d}:00)", "business"),
        ("early",    f"Early morning (05:00–{args.bh_start:02d}:00)" if args.bh_start > 5 else None, "early"),
        ("evening",  f"Evening ({args.bh_end:02d}:00–20:00)" if args.bh_end < 20 else None, "evening"),
        ("late_eve", "Late evening (20:00–23:00)", "late-eve"),
        ("overnight","Overnight (23:00–05:00)", "overnight"),
    ]
    zone_defs = [z for z in zone_defs if z[1]]

    W = []
    def w(s): W.append(s)

    w(f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Claude Code Activity — {args.since} → {args.until}</title>
<style>{HTML_CSS}</style></head><body>""")

    w(f"<h1>Claude Code Activity Report</h1>")
    tz_name = str(args.tzinfo) if hasattr(args.tzinfo,'__str__') else "local"
    w(f"<div class='sub'>Period: <b>{args.since} → {args.until}</b>  ·  "
      f"Business: {args.bh_start:02d}:00–{args.bh_end:02d}:00 ({tz_name})  ·  "
      f"Generated {datetime.now().strftime('%Y-%m-%d %H:%M')}</div>")

    # Headline cards
    w("<div class='grid' style='margin-top: 24px'>")
    w(f"<div class='stat'><div class='l'>Total hours worked</div><div class='v'>{totals['hrs']/3600:.1f}h</div><div class='meta'>{fmt_h(totals['hrs'])}</div></div>")
    w(f"<div class='stat'><div class='l'>Active days</div><div class='v'>{totals['active']}/{totals['total_days']}</div><div class='meta'>{100*totals['active']/max(1,totals['total_days']):.0f}% of period</div></div>")
    if totals.get('longest_streak'):
        ls = totals['longest_streak']
        w(f"<div class='stat'><div class='l'>Longest streak</div><div class='v'>{ls[2]}d</div><div class='meta'>{ls[0]} → {ls[1]}</div></div>")
    w(f"<div class='stat'><div class='l'>Avg / worked day</div><div class='v'>{totals['hrs']/3600/max(1,totals['worked']):.1f}h</div><div class='meta'>{totals['worked']} worked-days</div></div>")
    w(f"<div class='stat'><div class='l'>Prompts</div><div class='v'>{totals['prompts']:,}</div><div class='meta'>{totals['prompts']/max(1,totals['active']):.0f} / active day</div></div>")
    if totals.get('commits'):
        primary_name = totals.get('primary_author') or 'primary'
        w(f"<div class='stat'><div class='l'>Commits</div><div class='v'>{totals['commits']:,}</div>"
          f"<div class='meta'>{totals.get('commits_main',0)} {primary_name} · {totals.get('commits_other',0)} other</div></div>")
    if totals.get('prs_opened'):
        w(f"<div class='stat'><div class='l'>PRs opened / merged</div>"
          f"<div class='v'>{totals['prs_opened']} / {totals['prs_merged']}</div>"
          f"<div class='meta'>{totals.get('prs_closed',0)} closed unmerged</div></div>")
    w(f"<div class='stat' style='border-color: var(--late-eve); background: rgba(255,140,66,0.08)'>"
      f"<div class='l'>Out of business hours</div>"
      f"<div class='v' style='color: var(--late-eve)'>{totals['out']/3600:.1f}h</div>"
      f"<div class='meta'>{100*totals['out']/max(1,totals['hrs']):.0f}% of worked time · {totals['in']/3600:.1f}h in-hours</div></div>")
    w("</div>")

    # Zone breakdown
    w(f"<h2>Business hours ({args.bh_start:02d}:00–{args.bh_end:02d}:00) vs out-of-hours work</h2>")
    w(f"<div class='sub'>In-hours: {totals['in']/3600:.1f}h ({100*totals['in']/max(1,totals['hrs']):.1f}%)  ·  "
      f"Out-of-hours: {totals['out']/3600:.1f}h ({100*totals['out']/max(1,totals['hrs']):.1f}%)</div>")
    w("<div class='panel'>")
    w("<div class='stack'>")
    for zk, zl, zc in zone_defs:
        z_s = totals['zones'].get(zk, 0)
        pct = 100*z_s/totals['hrs'] if totals['hrs'] else 0
        if pct < 2: continue
        w(f"<div class='sz-{zc}' style='flex: {pct}; '>{z_s/3600:.0f}h · {pct:.0f}%</div>")
    w("</div></div>")
    w("<table style='max-width: 720px'>")
    w("<tr><th>Zone</th><th class='num'>Hours</th><th class='num'>% of worked</th><th class='num'>Days active in zone</th><th class='num'>Avg/active-day</th></tr>")
    for zk, zl, zc in zone_defs:
        z_s = totals['zones'].get(zk, 0)
        pct = 100*z_s/totals['hrs'] if totals['hrs'] else 0
        ad = totals['zone_active_days'].get(zk, 0)
        w(f"<tr><td><span class='sw' style='background: var(--{zc})'></span>{zl}</td>"
          f"<td class='num'>{z_s/3600:.1f}h</td>"
          f"<td class='num'>{pct:.1f}%</td>"
          f"<td class='num'>{ad}</td>"
          f"<td class='num'>{z_s/3600/max(1,ad):.2f}h</td></tr>")
    w("</table>")

    # Heaviest OOH days
    heavy_out = sorted([r for r in day_rows if r['out_s'] >= 2*3600], key=lambda r:-r['out_s'])[:15]
    if heavy_out:
        w("<h3>Heaviest out-of-business-hours days</h3>")
        w("<table style='max-width: 900px'>")
        w("<tr><th>Day</th><th class='num'>OOH hours</th><th class='num'>In-hours</th><th class='num'>Total</th><th>Breakdown</th></tr>")
        for r in heavy_out:
            total = r['in_s'] + r['out_s']
            parts = []
            for zk, zl, zc in zone_defs:
                zs = r['zones'].get(zk, 0)
                if zs > 0:
                    parts.append(f"<span class='sw' style='background: var(--{zc})'></span>{zl.split(' (')[0]} {zs/3600:.1f}h")
            w(f"<tr><td>{r['dow']} {r['date']}</td>"
              f"<td class='num' style='color: var(--late-eve); font-weight: 600'>{r['out_s']/3600:.1f}h</td>"
              f"<td class='num'>{r['in_s']/3600:.1f}h</td>"
              f"<td class='num'>{total/3600:.1f}h</td>"
              f"<td class='meta'>{' · '.join(parts)}</td></tr>")
        w("</table>")

    # Day-by-day
    w("<h2>Day-by-day timeline</h2>")
    w("<div class='sub'>In/Out bar scales to 16h. Timeline = 48 half-hour cells coloured by zone.</div>")
    w("<div class='panel' style='padding: 8px 12px; overflow-x: auto'>")
    w("<div style='margin-left: 240px; margin-bottom: 4px; font-size: 0.7em; color: var(--ink-dim); font-variant-numeric: tabular-nums; letter-spacing: 1px'>")
    for h in range(0, 24, 2):
        w(f"<span style='display: inline-block; width: 16px'>{h:02d}</span>")
    w("</div>")
    has_git = totals.get('commits') is not None and totals.get('commits') > 0
    has_pr = totals.get('prs_opened') is not None and totals.get('prs_opened') > 0
    cols = ["Date","Hrs","In / Out bar","Prompts","Blks"]
    if has_git: cols.append("Commits")
    if has_pr: cols += ["PR+","PR✓"]
    cols.append("Timeline")
    w("<table><thead><tr>" + "".join(f"<th>{c}</th>" for c in cols) + "</tr></thead><tbody>")

    current_wk = None
    for r in day_rows:
        wk = week_key(r['date'])
        if current_wk is None or wk != current_wk:
            wd = weeks[wk]
            wh = sum(x['hrs_s'] for x in wd); win = sum(x['in_s'] for x in wd); wout = sum(x['out_s'] for x in wd)
            wp = sum(x['prompts'] for x in wd); wc = sum(x['commits'] for x in wd)
            wpo = sum(x['po'] for x in wd); wpm = sum(x['pm'] for x in wd)
            wact = sum(1 for x in wd if x['prompts']>0)
            ooh_pct = 100*wout/wh if wh else 0
            summary = f"Wk of {wk} · {wact}/{len(wd)} active · <b>{wh/3600:.1f}h</b> worked ({win/3600:.1f}h in / {wout/3600:.1f}h out · {ooh_pct:.0f}% OOH) · {wp} prm"
            if has_git: summary += f" · {wc} cmt"
            if has_pr: summary += f" · {wpo}+ {wpm}✓ PRs"
            w(f"<tr class='week-sep'><td colspan='{len(cols)}'>{summary}</td></tr>")
            current_wk = wk
        dstr = f"{r['dow']} {r['date'].strftime('%m-%d')}"
        hrs_s = r['hrs_s']
        in_pct = 100*r['in_s']/16/3600 if hrs_s else 0
        out_pct = 100*r['out_s']/16/3600 if hrs_s else 0
        hbar = (f"<div class='hbar'><div class='in' style='width: {min(100,in_pct):.1f}%'></div>"
                f"<div class='out' style='left: {min(100,in_pct):.1f}%; width: {min(100-in_pct,out_pct):.1f}%'></div></div>")
        nb = sum(1 for _,_,n in r['blocks'] if n > 1)
        sing = r['singletons']
        blks_txt = f"{nb}" + (f"+{sing}s" if sing else "")
        hrs_label = fmt_h(r['hrs_s']) if r['hrs_s'] else "—"
        tl = render_timeline_cells(r['times'], r['blocks'], args.bh_start, args.bh_end)
        idle_class = " class='idle'" if r['prompts'] == 0 else ""
        row_cells = [
            f"<td>{dstr}</td>",
            f"<td class='num'>{hrs_label}</td>",
            f"<td>{hbar}</td>",
            f"<td class='num'>{r['prompts']}</td>",
            f"<td class='num'>{blks_txt}</td>",
        ]
        if has_git:
            row_cells.append(f"<td class='num'>{r['commits']}</td>")
        if has_pr:
            row_cells.append(f"<td class='num'>{r['po'] if r['po'] else ''}</td>")
            row_cells.append(f"<td class='num'>{r['pm'] if r['pm'] else ''}</td>")
        row_cells.append(f"<td><div class='timeline'>{tl}</div></td>")
        w(f"<tr{idle_class}>" + "".join(row_cells) + "</tr>")
    w("</tbody></table></div>")

    # Weekly rollup
    w("<h2>Weekly rollup</h2>")
    w("<table style='max-width: 1100px'>")
    cols2 = ["Week of","Active","Hours","In / Out","In-hrs split","Prompts"]
    if has_git: cols2.append("Commits")
    if has_pr: cols2.append("PR+ / PR✓")
    cols2.append("Peak hour")
    w("<tr>" + "".join(f"<th{' class=num' if c.endswith('Commits') or c=='Prompts' else ''}>{c}</th>" for c in cols2) + "</tr>")
    for wk in sorted(weeks):
        wd = weeks[wk]
        act = sum(1 for r in wd if r['prompts']>0)
        wh = sum(r['hrs_s'] for r in wd); win_ = sum(r['in_s'] for r in wd); wout = sum(r['out_s'] for r in wd)
        wp = sum(r['prompts'] for r in wd); wc = sum(r['commits'] for r in wd)
        wpo = sum(r['po'] for r in wd); wpm = sum(r['pm'] for r in wd)
        hc = Counter()
        for r in wd:
            for h in {t.hour for t in r['times']}: hc[h] += 1
        peak = (max(hc, key=hc.get), hc[max(hc, key=hc.get)]) if hc else (-1, 0)
        in_frac = 100*win_/wh if wh else 0
        out_frac = 100*wout/wh if wh else 0
        stack = (f"<div style='display: inline-flex; width: 120px; height: 12px; background: var(--bar-bg); border-radius: 2px; overflow: hidden'>"
                 f"<div style='flex: {in_frac}; background: var(--business)'></div>"
                 f"<div style='flex: {out_frac}; background: var(--late-eve)'></div></div>")
        cells = [
            f"<td>{wk}</td>",
            f"<td class='num'>{act}/{len(wd)}</td>",
            f"<td class='num'>{wh/3600:.1f}h</td>",
            f"<td class='num' style='color: var(--late-eve)'>{wout/3600:.1f}h ({out_frac:.0f}%)</td>",
            f"<td>{stack}</td>",
            f"<td class='num'>{wp}</td>",
        ]
        if has_git: cells.append(f"<td class='num'>{wc}</td>")
        if has_pr: cells.append(f"<td class='num'>{wpo} / {wpm}</td>")
        cells.append(f"<td class='num'>{peak[0]:02d}:00 ({peak[1]}d)</td>" if peak[0] >= 0 else "<td class='num'>—</td>")
        w("<tr>" + "".join(cells) + "</tr>")
    w("</table>")

    # Weekly hour coverage
    w("<h2>Weekly hour coverage</h2>")
    w("<div class='sub'>Cell = number of days that week with ≥1 prompt in that hour (0–7).</div>")
    w("<div class='panel' style='overflow-x: auto'>")
    w("<div style='margin-left: 144px; margin-bottom: 4px; font-size: 0.75em; color: var(--ink-dim); font-variant-numeric: tabular-nums'>")
    for h in range(24):
        zc, _ = zone_for_hour(h, args.bh_start, args.bh_end)
        w(f"<span style='display: inline-block; width: 30px; text-align: center; color: var(--{zc})'>{h:02d}</span>")
    w("</div>")
    for wk in sorted(weeks):
        wd = weeks[wk]
        hc = Counter()
        for r in wd:
            for h in {t.hour for t in r['times']}: hc[h] += 1
        w(f"<div style='display: flex; align-items: center; margin: 2px 0'>")
        w(f"<span style='display: inline-block; width: 140px; font-size: 0.85em'>{wk}</span>")
        for h in range(24):
            n = hc.get(h, 0)
            w(f"<span class='heatcell h{min(7,n)}'>{n if n else ''}</span>")
        w("</div>")
    w("</div>")

    # DOW averages
    dow_hours = Counter(); dow_in = Counter(); dow_out = Counter()
    dow_days = Counter(); dow_active = Counter(); dow_prompts = Counter()
    for r in day_rows:
        w_idx = r['date'].weekday()
        dow_hours[w_idx] += r['hrs_s']; dow_in[w_idx] += r['in_s']; dow_out[w_idx] += r['out_s']
        dow_days[w_idx] += 1; dow_prompts[w_idx] += r['prompts']
        if r['prompts'] > 0: dow_active[w_idx] += 1
    w("<h2>Day-of-week averages</h2>")
    w("<table style='max-width: 900px'>")
    w("<tr><th>Day</th><th class='num'>n</th><th class='num'>Active</th><th class='num'>Total hrs</th>"
      "<th class='num'>Hrs / active</th><th class='num'>In-hrs</th><th class='num'>Out-hrs</th>"
      "<th class='num'>OOH %</th><th class='num'>Prompts / active</th></tr>")
    for i in range(7):
        n = dow_days.get(i,0); act = dow_active.get(i,0)
        hrs = dow_hours.get(i,0); in_ = dow_in.get(i,0); out = dow_out.get(i,0)
        prm = dow_prompts.get(i,0)
        ooh = 100*out/hrs if hrs else 0
        w(f"<tr><td><b>{DAY_NAMES[i]}</b></td><td class='num'>{n}</td><td class='num'>{act}</td>"
          f"<td class='num'>{hrs/3600:.1f}h</td><td class='num'>{hrs/3600/max(1,act):.2f}h</td>"
          f"<td class='num'>{in_/3600:.1f}h</td>"
          f"<td class='num' style='color: var(--late-eve)'>{out/3600:.1f}h</td>"
          f"<td class='num'>{ooh:.0f}%</td><td class='num'>{prm/max(1,act):.1f}</td></tr>")
    w("</table>")

    # Hour of day
    overall_hour_days = Counter(); overall_hour_prompts = Counter()
    for r in day_rows:
        for h in {t.hour for t in r['times']}: overall_hour_days[h] += 1
        for t in r['times']: overall_hour_prompts[t.hour] += 1
    w("<h2>Hour-of-day pattern</h2>")
    w("<table style='max-width: 900px'>")
    w("<tr><th>Hour</th><th>Zone</th><th class='num'>Days active</th><th class='num'>% days</th><th class='num'>Prompts</th><th>Distribution</th></tr>")
    max_days = max(overall_hour_days.values()) if overall_hour_days else 1
    for h in range(24):
        d_ct = overall_hour_days.get(h, 0); p_ct = overall_hour_prompts.get(h, 0)
        pct = 100*d_ct/totals['total_days']
        zc, _ = zone_for_hour(h, args.bh_start, args.bh_end)
        width = int(d_ct/max_days * 100)
        w(f"<tr><td class='num'><b>{h:02d}:00</b></td>"
          f"<td><span class='sw' style='background: var(--{zc})'></span>{zc}</td>"
          f"<td class='num'>{d_ct}</td><td class='num'>{pct:.0f}%</td><td class='num'>{p_ct}</td>"
          f"<td><div style='background: var(--bar-bg); height: 14px; border-radius: 2px; position: relative; width: 220px'>"
          f"<div style='position: absolute; top:0; bottom:0; left:0; width: {width}%; background: var(--{zc}); border-radius: 2px'></div></div></td></tr>")
    w("</table>")

    # Top days
    w("<h2>Top days</h2>")
    w("<div class='grid' style='grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))'>")
    rankings = [("By hours worked", lambda r:-r['hrs_s']),
                ("By prompts", lambda r:-r['prompts']),
                ("By out-of-hours work", lambda r:-r['out_s'])]
    if has_git: rankings.insert(2, ("By commits", lambda r:-r['commits']))
    for title, key in rankings:
        w("<div class='panel'><h3 style='margin-top: 0'>" + title + "</h3><table>")
        for r in sorted([d for d in day_rows if d['prompts']>0], key=key)[:6]:
            w(f"<tr><td>{r['dow']} {r['date'].strftime('%m-%d')}</td>"
              f"<td class='num'>{r['hrs_s']/3600:.1f}h</td>"
              f"<td class='num'>{r['prompts']}p</td>"
              + (f"<td class='num'>{r['commits']}c</td>" if has_git else "")
              + f"<td class='num' style='color: var(--late-eve)'>{r['out_s']/3600:.1f}h OOH</td></tr>")
        w("</table></div>")
    w("</div>")

    # Legend
    w("<h2>Legend</h2><div class='panel'>")
    w("<div style='margin-bottom: 8px'><b>Zone colors</b>:</div>")
    w("<div style='display: flex; flex-wrap: wrap; gap: 14px; font-size: 0.9em'>")
    for zk, zl, zc in zone_defs:
        w(f"<div><span class='sw' style='background: var(--{zc})'></span>{zl}</div>")
    w("</div>")
    w(f"<div style='margin-top: 16px'><b>Timeline cells</b>: 48 half-hour cells covering 00:00→24:00. "
      f"Solid = prompt in that half-hour within a block; faded = block-internal gap; short bar = singleton (no neighbour within {args.block_gap} min).</div>")
    w(f"<div style='margin-top: 12px'><b>Hours worked</b> = sum of continuous-block durations (≥2 prompts, every gap &lt; {args.block_gap} min).</div>")
    w(f"<div style='margin-top: 12px'><b>In/Out bar</b>: proportional to a 16h day. Blue = business hours ({args.bh_start:02d}:00–{args.bh_end:02d}:00) · orange = OOH.</div>")
    w("</div>")

    w(f"<div class='meta' style='margin-top: 24px; padding-top: 12px; border-top: 1px solid var(--border)'>"
      f"Generated {datetime.now().strftime('%Y-%m-%d %H:%M')} · "
      f"Source: {args.history}"
      + (f" · git: {args.git}" if args.git else "")
      + (f" · gh-repo: {args.gh_repo}" if args.gh_repo else "")
      + "</div></body></html>")

    return "".join(W)

# ────────────────────────────────────────────────────────────────────────────
# Terminal output
# ────────────────────────────────────────────────────────────────────────────
def print_terminal(args, day_rows, weeks, totals):
    bh_label = f"{args.bh_start:02d}:00-{args.bh_end:02d}:00"
    print(f"TOTAL: {totals['hrs']/3600:.1f}h worked ·  "
          f"in-hours {totals['in']/3600:.1f}h ({100*totals['in']/max(1,totals['hrs']):.0f}%)  ·  "
          f"out-of-hours {totals['out']/3600:.1f}h ({100*totals['out']/max(1,totals['hrs']):.0f}%)")
    print(f"By zone:")
    zone_labels = [
        ("business", f"Business ({bh_label})"),
        ("early",    f"Early morning (05:00–{args.bh_start:02d}:00)"),
        ("evening",  f"Evening ({args.bh_end:02d}:00–20:00)"),
        ("late_eve", "Late evening (20:00–23:00)"),
        ("overnight","Overnight (23:00–05:00)"),
    ]
    for zk, zl in zone_labels:
        z_s = totals['zones'].get(zk, 0)
        if z_s == 0 and zk != "business": continue
        print(f"  {zl:32s} {z_s/3600:5.1f}h  ({100*z_s/max(1,totals['hrs']):4.1f}%)")

    heavy_out = [r for r in day_rows if r['out_s'] >= 2*3600]
    print(f"\nOut-of-hours ≥2h days: {len(heavy_out)} / {totals['worked']} worked days "
          f"({100*len(heavy_out)/max(1,totals['worked']):.0f}%)")

    print()
    print("="*98)
    print(f"DAILY OUT-OF-HOURS (outside {bh_label})  ·  {args.since} → {args.until}")
    print("="*98)
    print()
    print(f"  {'date':12s} {'dow':4s} {'total':>7s} {'in-hrs':>7s} {'OOH':>7s} {'%OOH':>5s}  "
          f"{'early':>6s} {'eve':>6s} {'late':>6s} {'ovn':>6s}  bar(0-10h OOH)")
    print("  " + "─"*108)

    current_wk_key = None; wk_ooh = wk_in = wk_tot = 0
    def flush_week(key):
        nonlocal wk_ooh, wk_in, wk_tot
        if wk_tot == 0:
            wk_ooh = wk_in = wk_tot = 0; return
        print(f"  {'—':12s} {'Σ':>4s} {wk_tot/3600:>6.1f}h {wk_in/3600:>6.1f}h {wk_ooh/3600:>6.1f}h "
              f"{100*wk_ooh/max(1,wk_tot):>4.0f}%   wk of {key}")
        print()
        wk_ooh = wk_in = wk_tot = 0

    def opt(v): return f"{v:.1f}h" if v else "—"
    for r in day_rows:
        wk = week_key(r['date'])
        if current_wk_key is None: current_wk_key = wk
        elif wk != current_wk_key:
            flush_week(current_wk_key); current_wk_key = wk
        tot_s = r['in_s'] + r['out_s']
        wk_ooh += r['out_s']; wk_in += r['in_s']; wk_tot += tot_s
        ooh_h = r['out_s'] / 3600
        bar = "█" * int(min(ooh_h, 10) / 10 * 30)
        pct = 100*r['out_s']/max(1,tot_s) if tot_s else 0
        early = r['zones'].get("early", 0)/3600
        evening = r['zones'].get("evening", 0)/3600
        late_eve = r['zones'].get("late_eve", 0)/3600
        overnight = r['zones'].get("overnight", 0)/3600
        tot_l = f"{tot_s/3600:.1f}h" if tot_s else "—"
        in_l = f"{r['in_s']/3600:.1f}h" if r['in_s'] else "—"
        ooh_l = f"{ooh_h:.1f}h" if r['out_s'] else "—"
        pct_l = f"{pct:.0f}%" if tot_s else "—"
        print(f"  {str(r['date']):12s} {r['dow']:4s} {tot_l:>7s} {in_l:>7s} {ooh_l:>7s} {pct_l:>5s}  "
              f"{opt(early):>6s} {opt(evening):>6s} {opt(late_eve):>6s} {opt(overnight):>6s}  {bar}")
    flush_week(current_wk_key)
    print("  " + "─"*108)
    print(f"  {'TOTAL':12s} {'':4s} {totals['hrs']/3600:>6.1f}h {totals['in']/3600:>6.1f}h "
          f"{totals['out']/3600:>6.1f}h {100*totals['out']/max(1,totals['hrs']):>4.0f}%   "
          f"{totals['zones'].get('early',0)/3600:>5.1f}h "
          f"{totals['zones'].get('evening',0)/3600:>5.1f}h "
          f"{totals['zones'].get('late_eve',0)/3600:>5.1f}h "
          f"{totals['zones'].get('overnight',0)/3600:>5.1f}h")
    print()
    print(f"  Legend: early=05-{args.bh_start:02d} · eve={args.bh_end:02d}-20 · late=20-23 · ovn=23-05 ({str(args.tzinfo)[:40]})")

# ────────────────────────────────────────────────────────────────────────────
# Main
# ────────────────────────────────────────────────────────────────────────────
def main():
    args = parse_args()

    # UTC range
    start_utc = datetime.combine(args.since_date, datetime.min.time()).replace(tzinfo=args.tzinfo).astimezone(timezone.utc)
    end_utc = datetime.combine(args.until_date + timedelta(days=1), datetime.min.time()).replace(tzinfo=args.tzinfo).astimezone(timezone.utc) - timedelta(seconds=1)

    prompts_by_day = load_prompts(args, start_utc, end_utc)
    commits_by_day, commits_main, commits_other, primary_author = load_commits(args, start_utc, end_utc)
    prs_opened, prs_merged, prs_closed, gh_repo_resolved = load_prs(args, start_utc, end_utc)
    args.gh_repo = gh_repo_resolved

    # Per-day rows
    day_rows = []
    cur = args.since_date
    while cur <= args.until_date:
        times = prompts_by_day.get(cur, [])
        blocks = compute_blocks(times, args.block_gap_s)
        hrs_s = sum((e-s).total_seconds() for s,e,n in blocks if n > 1)
        in_s = out_s = 0.0
        zones = Counter()
        for s,e,n in blocks:
            if n < 2: continue
            i,o,z = split_block_zones(s, e, args.bh_start, args.bh_end)
            in_s += i; out_s += o; zones.update(z)
        day_rows.append({
            "date": cur,
            "dow": DAY_NAMES[cur.weekday()],
            "times": times,
            "blocks": blocks,
            "hrs_s": hrs_s,
            "in_s": in_s, "out_s": out_s, "zones": zones,
            "prompts": len(times),
            "singletons": sum(1 for _,_,n in blocks if n == 1),
            "commits": commits_by_day.get(cur, 0),
            "d": commits_main.get(cur, 0),
            "bot": commits_other.get(cur, 0),
            "po": prs_opened.get(cur, 0),
            "pm": prs_merged.get(cur, 0),
            "pc": prs_closed.get(cur, 0),
        })
        cur += timedelta(days=1)

    weeks = defaultdict(list)
    for r in day_rows: weeks[week_key(r['date'])].append(r)

    # Totals
    active = [r for r in day_rows if r['prompts'] > 0]
    worked = [r for r in day_rows if r['hrs_s'] > 0]
    zones_total = Counter()
    for r in day_rows: zones_total.update(r['zones'])
    zone_active_days = Counter()
    for r in day_rows:
        for zk,v in r['zones'].items():
            if v > 0: zone_active_days[zk] += 1
    # Streak
    runs=[]; cur=0; rs=None; last=None
    for r in day_rows:
        if r['prompts'] > 0:
            if cur == 0: rs = r['date']
            cur += 1; last = r['date']
        else:
            if cur > 0: runs.append((rs,last,cur)); cur=0
    if cur > 0: runs.append((rs,last,cur))
    runs.sort(key=lambda x:-x[2])

    totals = {
        "hrs": sum(r['hrs_s'] for r in day_rows),
        "in":  sum(r['in_s'] for r in day_rows),
        "out": sum(r['out_s'] for r in day_rows),
        "zones": zones_total,
        "zone_active_days": zone_active_days,
        "prompts": sum(r['prompts'] for r in day_rows),
        "commits": sum(r['commits'] for r in day_rows) if args.git else None,
        "commits_main": sum(r['d'] for r in day_rows) if args.git else None,
        "commits_other": sum(r['bot'] for r in day_rows) if args.git else None,
        "primary_author": primary_author,
        "prs_opened": sum(r['po'] for r in day_rows) if args.gh_repo else None,
        "prs_merged": sum(r['pm'] for r in day_rows) if args.gh_repo else None,
        "prs_closed": sum(r['pc'] for r in day_rows) if args.gh_repo else None,
        "active": len(active), "worked": len(worked),
        "total_days": len(day_rows),
        "longest_streak": runs[0] if runs else None,
    }

    # Terminal output
    print_terminal(args, day_rows, weeks, totals)

    # HTML output
    if not args.no_html:
        html = render_html(args, day_rows, weeks, totals)
        Path(args.out).write_text(html)
        print(f"\nHTML: {args.out}  ({len(html)/1024:.1f} KB)")

if __name__ == "__main__":
    main()
