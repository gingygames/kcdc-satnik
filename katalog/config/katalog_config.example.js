// Nastavení katalogu (zkopíruje se jako katalog_config.js, při dalším buildu/nasazení se nepřepisuje).
globalThis.KATALOG_CONFIG = {
  // složka resource relativně k pracovní složce serveru KCDC (tam jsou gen/ a data/)
  slozka: "resources/katalog",
  // chatový příkaz: /katalog otevře prohlížeč, /katalog <text> vypíše výsledky do chatu
  prikaz: "katalog",
  // oprávnění podle smlouvy mostu (Správa: has / isAdmin)
  opravneni: "admin.items",
  // startovní sady příchodu, když příchod neexportuje katalogSady()
  sady: [],
};
