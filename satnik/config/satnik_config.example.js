// Nastavení šatníku (zkopíruje se jako satnik_config.js, při dalším buildu/nasazení se nepřepisuje).
globalThis.SATNIK_CONFIG = {
  // chatový příkaz: /satnik otevře šatník, /satnik <text nebo id> rovnou s hledáním, /satnik zavrit zavře
  prikaz: "satnik",
  // oprávnění podle smlouvy mostu; "" = všichni hráči (výchozí), např. "satnik" jen pro vybrané
  opravneni: "",
  // role NPC pro figurínu (Npc.roles()); "" = vybere se sama (townsman / townswoman), log při startu vypíše dostupné role
  figurinaMuz: "",
  figurinaZena: "",
  // figurína dostane tvář a vlasy hráče, když má stejné pohlaví
  mojeTvar: true,
  // podíl šířky obrazovky, který zabírá panel vlevo (figurína vyjde vpravo vedle něj)
  panel: 0.56,
  // "Ukázat krejčímu": komu v okolí přijde seznam do chatu (metry)
  dosahUkazat: 8,
  // zavřít šatník, když hráč dostane ránu
  zavritPriZasahu: true,
  // po ráně jde šatník otevřít až za tolik sekund (hráč je při náhledu v soukromém světě, nesmí to být útěk z boje)
  pauzaPoZasahu: 20,
  // soukromé virtuální světy náhledu: svet + id hráče (příchod používá 7000 + id)
  svet: 900000,
};
