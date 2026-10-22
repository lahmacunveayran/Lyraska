import sqlite3, time, sys
db=sys.argv[1]
c=sqlite3.connect(db)
V=(2,4,1,1,1)
JOIN="""JOIN analyses a ON a.path = t.path
    AND a.file_size = t.file_size AND a.modified = t.modified
    AND a.spectrum_version = ?1 AND a.rhythm_version = ?2"""
FULL="a.loudness_version = ?3 AND a.bass_version = ?4 AND a.key_version = ?5"
qs={
 "analyzed_count": (f"SELECT COUNT(*) FROM tracks t {JOIN} WHERE {FULL}", V),
 "search_all": (f"""SELECT t.id, t.path, COALESCE(t.title, t.file_name), t.artist, t.album,
   t.track_number, t.duration_secs, t.codec, a.bpm, a.path IS NOT NULL AND {FULL},
   CASE WHEN a.key_version = ?5 THEN a.camelot END FROM tracks t LEFT {JOIN} ORDER BY t.sort_key LIMIT 50000""", V),
 "pending": ("""SELECT t.path, t.file_size, t.modified FROM tracks t
   LEFT JOIN analyses a ON a.path = t.path AND a.file_size = t.file_size AND a.modified = t.modified
   WHERE a.path IS NULL OR a.spectrum_version != ?1 OR a.rhythm_version != ?2
     OR a.loudness_version != ?3 OR a.bass_version != ?4 OR a.key_version != ?5
   ORDER BY (a.path IS NULL OR a.spectrum_version != ?1 OR a.loudness_version != ?3
     OR a.bass_version != ?4 OR a.key_version != ?5), t.sort_key LIMIT ?6""", V+(64,)),
 "track_count": ("SELECT COUNT(*) FROM tracks", ()),
}
for name,(sql,args) in qs.items():
    best=1e9
    for _ in range(3):
        t=time.perf_counter(); r=c.execute(sql,args).fetchall(); best=min(best,time.perf_counter()-t)
    print(f"{name:15s} {best*1000:8.1f} ms  rows={len(r)}")
