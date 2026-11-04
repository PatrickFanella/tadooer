#!/usr/bin/env python3
"""Per-table row count and content hash of a Tadooer SQLite file (read-only). Prints JSON."""
import hashlib, json, sqlite3, sys
db = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
out = {}
for (t,) in db.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name"):
    cols = [r[1] for r in db.execute(f'pragma table_info("{t}")')]
    h = hashlib.sha256()
    n = 0
    for row in db.execute(f'select * from "{t}" order by ' + ",".join(f'"{c}"' for c in cols)):
        h.update(json.dumps(row, default=lambda b: b.hex() if isinstance(b, bytes) else str(b)).encode()); h.update(b"\n"); n += 1
    out[t] = {"count": n, "sha256": h.hexdigest()}
out["_integrity"] = db.execute("pragma integrity_check").fetchone()[0]
out["_foreign_key_violations"] = len(db.execute("pragma foreign_key_check").fetchall())
print(json.dumps(out, indent=1, sort_keys=True))
