(function () {
  // Must match utils.ts todayStr() exactly (kept in sync by hand, since this
  // file runs outside the build/type-check pipeline).
  var date = new Date().toISOString().slice(0, 10)
  window.__puzzlePrefetch = { date: date, promise: fetch('/api/puzzle?date=' + date) }
})()
