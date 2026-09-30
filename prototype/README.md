# Interaction prototype

A standalone HTML reference for Notes, Draw, Tasks, Finance, and Goals. It stores demonstration data in browser localStorage and does not use the application's API or IndexedDB databases.

```sh
python3 -m http.server 4173 --directory prototype
```

Open http://127.0.0.1:4173. Use [the behavior specification](SPEC.md) for current interactions. The prototype covers a broader feature set than the application; it is not a deployed backend or a migration path for existing data.
