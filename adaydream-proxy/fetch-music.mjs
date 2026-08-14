// Monster Siren audio URL fetcher — refreshes the song list's HyCDN direct links.
//
// Replaces the old Vercel proxy (adaydream-proxy.vercel.app), which is unreachable
// from mainland China (`*.vercel.app` is SNI-blocked by the GFW). This script runs
// server-side as a GitHub Actions scheduled job (see .github/workflows/refresh-music.yml);
// its stdout JSON is rsync'd to the cloud server as `music.json` and served same-origin
// by both adaydream.cn (nav page) and blog.adaydream.cn (vinyl player).
//
// Usage: node fetch-music.mjs > music.json

const SONGS = [
  { cid: "880337", name: "Control's Wishes", artist: "塞壬唱片-MSR", album: "孤星OST", cover: "https://web.hycdn.cn/siren/pic/20230508/8f7be68ffa9dea9da961df0997466617.jpg" },
  { cid: "125042", name: "Sanctuary Inside", artist: "塞壬唱片-MSR", album: "Sanctuary Inside", cover: "https://web.hycdn.cn/siren/pic/20250430/384e007ed1908ce919a3bf704a5b36ff.png" },
  { cid: "306814", name: "Best Moments of...", artist: "塞壬唱片-MSR", album: "Best Moments of...", cover: "https://web.hycdn.cn/siren/pic/20231019/ae52bd635f6a7e89be3c3d481788ce82.png" },
  { cid: "953953", name: "Little Wish", artist: "塞壬唱片-MSR", album: "Little Wish", cover: "https://web.hycdn.cn/siren/pic/20250801/7d4b586dddf00b4e2a43c809f3fe4b45.jpg" },
  { cid: "306846", name: "Your Star", artist: "塞壬唱片-MSR", album: "Your Star", cover: "https://web.hycdn.cn/siren/pic/20220608/7ceda0fb37acc8cdfc7f25e8352dbbc8.jpg" },
  { cid: "697699", name: "Grow on My Time", artist: "塞壬唱片-MSR", album: "Grow on My Time", cover: "https://web.hycdn.cn/siren/pic/20250606/02da85b2cc73f426ef6cfec4910d31d9.jpg" },
  { cid: "953984", name: "Before Summer", artist: "塞壬唱片-MSR", album: "Before Summer", cover: "https://web.hycdn.cn/siren/pic/20230601/d052f9558a4ef28409556ba761cdd861.jpg" },
  { cid: "232224", name: "Innocence", artist: "塞壬唱片-MSR", album: "Innocence", cover: "https://web.hycdn.cn/siren/pic/20260430/87e3010a27c3f0f85422fa6f1f33483e.jpg" },
  { cid: "306815", name: "Effervescence", artist: "塞壬唱片-MSR", album: "火山旅梦OST", cover: "https://web.hycdn.cn/siren/pic/20230809/ecc4c113772a8e8a8cdde6aa303a3ad6.jpg" }
];

async function main() {
  const settled = await Promise.allSettled(
    SONGS.map(async (song) => {
      const api = `https://monster-siren.hypergryph.com/api/song/${song.cid}`;
      const resp = await fetch(api, { headers: { "User-Agent": "adaydream-music-proxy/1.0" } });
      if (!resp.ok) throw new Error(`API ${resp.status} for song ${song.cid}`);
      const json = await resp.json();
      if (json.code !== 0 || !json.data || !json.data.sourceUrl) throw new Error(`API error for ${song.name}: ${json.msg}`);
      return { cid: song.cid, name: song.name, artist: song.artist, album: song.album, cover: song.cover, url: json.data.sourceUrl };
    })
  );

  const ok = settled.filter((r) => r.status === "fulfilled").map((r) => r.value);
  if (ok.length === 0) {
    console.error("refresh-music: all song fetches failed");
    process.exit(1);
  }
  if (ok.length < SONGS.length) {
    console.error(`refresh-music: ${SONGS.length - ok.length} song(s) failed, writing ${ok.length} succeeded`);
  }
  process.stdout.write(JSON.stringify({ code: 0, data: ok }));
}

main().catch((e) => {
  console.error("refresh-music:", e);
  process.exit(1);
});
