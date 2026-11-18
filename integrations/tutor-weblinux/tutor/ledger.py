"""Append-only completion ledger.

The leaderboard is a derived view: it is rebuilt by folding these events, so
it can be replayed, audited and rebuilt from nothing. Events are never edited.
Each event carries the previous event's hash so a truncated or altered ledger
is detected on read instead of silently starting a fresh history.
"""
import hashlib
import json
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

EVENT_VERSION = 1
GENESIS = "0" * 64
CLAIM_FIELDS = ("identity", "problem_id", "problem_hash", "solution_sha256")


class LedgerError(Exception):
    pass


def digest(value: Any) -> str:
    raw = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()
    return hashlib.sha256(raw).hexdigest()


def digest_files(paths: Iterable[Path], root: Optional[Path] = None) -> str:
    """Stable digest over file names and contents; None when there is nothing to hash."""
    items = []
    for path in sorted(Path(p) for p in paths):
        if path.is_file():
            name = str(path.relative_to(root)) if root else path.name
            items.append([name, hashlib.sha256(path.read_bytes()).hexdigest()])
    return digest(items) if items else None


def _event_hash(event: Dict[str, Any]) -> str:
    return digest({key: value for key, value in event.items() if key != "hash"})


def read_events(path: Path) -> List[Dict[str, Any]]:
    path = Path(path)
    if not path.exists():
        return []
    events: List[Dict[str, Any]] = []
    previous = GENESIS
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError as exc:
            raise LedgerError(f"{path}:{number}: not valid JSON ({exc})") from exc
        if event.get("seq") != len(events) + 1 or event.get("prev") != previous or event.get("hash") != _event_hash(event):
            raise LedgerError(f"{path}:{number}: ledger chain is broken")
        previous = event["hash"]
        events.append(event)
    return events


def claim_key(event: Dict[str, Any]) -> tuple:
    return tuple(event.get(field) for field in CLAIM_FIELDS)


def append_completions(entries: Iterable[Dict[str, Any]], path: Path) -> List[Dict[str, Any]]:
    """Append one event per new claim. A repeated claim is ignored (idempotent)."""
    path = Path(path)
    events = read_events(path)
    known = {claim_key(event) for event in events}
    previous = events[-1]["hash"] if events else GENESIS
    added: List[Dict[str, Any]] = []
    for entry in entries:
        event = {
            "v": EVENT_VERSION,
            "seq": len(events) + len(added) + 1,
            "prev": previous,
            "type": "completion",
            "identity": entry["user"],
            "problem_id": entry["problem_id"],
            "problem_hash": entry.get("problem_hash"),
            "solution_sha256": entry.get("solution_sha256"),
            "lang": entry.get("lang", "cpp"),
            "score": float(entry["score"]),
            "scoreboard": entry["scoreboard"],
            "submitted_at": entry["submitted_at"],
            "commit_sha": entry.get("commit_sha", "local"),
            "verifier": entry.get("verifier", "local"),
        }
        key = claim_key(event)
        if key in known:
            continue
        event["hash"] = _event_hash(event)
        known.add(key)
        previous = event["hash"]
        added.append(event)
    if added:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "a", encoding="utf-8") as handle:
            for event in added:
                handle.write(json.dumps(event, sort_keys=True) + "\n")
    return added
