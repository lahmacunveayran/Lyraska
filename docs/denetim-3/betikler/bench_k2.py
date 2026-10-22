import sqlite3, os, time, sys
N=int(sys.argv[1]); db=sys.argv[2]
if os.path.exists(db): os.remove(db)
c=sqlite3.connect(db, isolation_level=None)
c.execute("PRAGMA journal_mode=WAL"); c.execute("PRAGMA synchronous=NORMAL")
c.executescript(open('steps.sql').read())
c.execute("BEGIN")
c.execute("INSERT INTO folders(path) VALUES('/m')")
for i in range(N):
    p=f"/m/artist{i%300}/album{i%50}/{i:05d} şarkı.mp3"
    c.execute("INSERT INTO tracks(folder_id,path,file_name,title,artist,album,duration_secs,codec,sample_rate,channels,file_size,modified,sort_key,search,tags_version) VALUES(1,?,?,?,?,?,240,'MP3',44100,2,5000000,1700000000,?,?,1)",
      (p,f"{i}.mp3",f"title {i}",f"artist{i%300}",f"album{i%50}",f"artist{i%300}\x01{i:05d}",f"title {i} artist{i%300}"))
    c.execute("""INSERT INTO analyses(path,file_size,modified,version,frames,bpm,levels,meters,onset,beats,song_map,
       loudness_lufs,true_peak_dbtp,bass_peaks,sample_rate,spectrum_version,rhythm_version,loudness_version,bass_version,chroma,musical_key,camelot,key_version)
       VALUES(?,5000000,1700000000,5,14400,120.0,?,?,?,'{}','{}',-14,-1,'{}',44100,2,4,1,1,?,'{}','8A',1)""",
       (p, os.urandom(110000), os.urandom(15000), os.urandom(35000), os.urandom(4000)))
c.execute("COMMIT"); c.execute("PRAGMA wal_checkpoint(TRUNCATE)"); c.close()
print("db MB", os.path.getsize(db)/1e6)
