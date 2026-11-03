// Nastavení katalogu (zkopíruje se jako katalog_config.js, při dalším buildu/nasazení se nepřepisuje).
globalThis.KATALOG_CONFIG = {
  // složka resource relativně k pracovní složce serveru KCDC (tam jsou gen/ a data/)
  slozka: "resources/katalog",
  // chatový příkaz: /katalog otevře prohlížeč, /katalog <text> vypíše výsledky do chatu
  prikaz: "katalog",
  // oprávnění podle smlouvy mostu (Správa: has / isAdmin); "" = všichni hráči (bez mostu a Správy jediná cesta vedle `admini`)
  opravneni: "admin.items",
  // kdo smí do katalogu i bez mostu a Správy: přezdívky, steamId nebo id hráčů, např. ["Gingy"]
  admini: [],
  // startovní sady příchodu, když příchod neexportuje katalogSady()
  sady: [],
};
