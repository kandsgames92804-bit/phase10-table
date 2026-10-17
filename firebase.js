// Cloud mode: Firestore with anonymous sign-in. Data lives under
// rooms/{roomCode}/{collection}/{docId}. Firestore keeps a local cache, so
// a dropped signal doesn't lose a hand; it syncs when the connection returns.

const V = "10.12.2";
const base = `https://www.gstatic.com/firebasejs/${V}`;

export async function createFirebaseStore(config) {
  const [{ initializeApp }, auth, fs] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-firestore.js`),
  ]);
  const app = initializeApp(config);
  await auth.signInAnonymously(auth.getAuth(app));
  let db;
  try {
    db = fs.initializeFirestore(app, {
      localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
    });
  } catch {
    db = fs.getFirestore(app);
  }
  let room = null;
  const ref = (coll, id) => fs.doc(db, "rooms", room, coll, id);

  return {
    mode: "cloud",
    label: "Cloud",
    async open(code) {
      room = code;
    },
    watch(coll, cb) {
      return fs.onSnapshot(
        fs.collection(db, "rooms", room, coll),
        (snap) => {
          const all = {};
          snap.forEach((d) => (all[d.id] = d.data()));
          cb(all);
        },
        (err) => console.error("watch", coll, err)
      );
    },
    async get(coll, id) {
      const s = await fs.getDoc(ref(coll, id));
      return s.exists() ? s.data() : null;
    },
    async set(coll, id, value) {
      await fs.setDoc(ref(coll, id), value);
    },
    async del(coll, id) {
      await fs.deleteDoc(ref(coll, id));
    },
    async update(coll, id, fn) {
      return fs.runTransaction(db, async (tx) => {
        const r = ref(coll, id);
        const s = await tx.get(r);
        const next = fn(s.exists() ? s.data() : null);
        if (next == null) return false;
        tx.set(r, next);
        return true;
      });
    },
  };
}
