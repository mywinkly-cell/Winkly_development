// ─────────────────────────────────────────────────────────────────────────────
// Push texts for plan changes and plan alerts, in the RECIPIENT's app language.
// Import-free: used by plan-update / plan-watch-cron (Deno) and tested from the mobile
// Jest suite (apps/mobile/__tests__/planNotify.test.ts).
// Informal "you" in every language, like the app (docs/I18N.md).
// ─────────────────────────────────────────────────────────────────────────────

export type PlanNoticeKind = "cancelled" | "cant_make_it" | "rescheduled" | "restored" | "heads_up";
export type WeatherCondition = "rain" | "heavy_rain" | "storm" | "snow" | "heat" | "cold";

type Dict = {
  cancelledTitle: string; cancelledBody: string;
  cantTitle: string; cantBody: string;
  movedTitle: string; movedBody: string;
  restoredTitle: string; restoredBody: string;
  headsUpTitle: string; headsUpBody: string;
  weatherTitle: string; weatherBody: string;
  trafficTitle: string; trafficBody: string;
  someone: string;
  cond: Record<WeatherCondition, string>;
};

const EN: Dict = {
  cancelledTitle: "Plan cancelled", cancelledBody: "{name} cancelled “{title}”.",
  cantTitle: "Change of plans", cantBody: "{name} can't make it to “{title}”.",
  movedTitle: "Plan moved", movedBody: "{name} moved “{title}” to {when}.",
  restoredTitle: "Plan is back on", restoredBody: "{name}: “{title}” is back on for {when}.",
  headsUpTitle: "About your plan", headsUpBody: "{name} about “{title}”:",
  weatherTitle: "Weather alert: {title}", weatherBody: "{condition} expected around {time}. Change the time or let the others know.",
  trafficTitle: "Traffic on the way to {title}", trafficBody: "About {minutes} min extra. Leave by {time} or let the others know.",
  someone: "Someone",
  cond: { rain: "Rain", heavy_rain: "Heavy rain", storm: "Thunderstorms", snow: "Snow", heat: "Extreme heat", cold: "Freezing cold" },
};

const DICTS: Record<string, Dict> = {
  en: EN,
  de: {
    cancelledTitle: "Plan abgesagt", cancelledBody: "{name} hat „{title}“ abgesagt.",
    cantTitle: "Planänderung", cantBody: "{name} schafft es nicht zu „{title}“.",
    movedTitle: "Plan verschoben", movedBody: "{name} hat „{title}“ auf {when} verschoben.",
    restoredTitle: "Plan findet doch statt", restoredBody: "{name}: „{title}“ findet wieder statt – {when}.",
    headsUpTitle: "Zu eurem Plan", headsUpBody: "{name} zu „{title}“:",
    weatherTitle: "Wetterwarnung: {title}", weatherBody: "{condition} gegen {time} erwartet. Verschieb den Plan oder sag den anderen Bescheid.",
    trafficTitle: "Verkehr auf dem Weg zu {title}", trafficBody: "Etwa {minutes} Min. länger. Fahr bis {time} los oder sag den anderen Bescheid.",
    someone: "Jemand",
    cond: { rain: "Regen", heavy_rain: "Starkregen", storm: "Gewitter", snow: "Schnee", heat: "Große Hitze", cold: "Strenger Frost" },
  },
  uk: {
    cancelledTitle: "План скасовано", cancelledBody: "{name} скасовує «{title}».",
    cantTitle: "Зміна планів", cantBody: "{name} не зможе прийти на «{title}».",
    movedTitle: "План перенесено", movedBody: "{name} переносить «{title}» на {when}.",
    restoredTitle: "План знову в силі", restoredBody: "{name}: «{title}» знову в силі — {when}.",
    headsUpTitle: "Про ваш план", headsUpBody: "{name} про «{title}»:",
    weatherTitle: "Погода: {title}", weatherBody: "Очікується: {condition}, близько {time}. Зміни час або попередь інших.",
    trafficTitle: "Затори дорогою на {title}", trafficBody: "Приблизно на {minutes} хв довше. Виїжджай до {time} або попередь інших.",
    someone: "Хтось",
    cond: { rain: "дощ", heavy_rain: "сильний дощ", storm: "гроза", snow: "сніг", heat: "сильна спека", cold: "сильний мороз" },
  },
  ru: {
    cancelledTitle: "План отменён", cancelledBody: "{name} отменяет «{title}».",
    cantTitle: "Изменение планов", cantBody: "{name} не сможет прийти на «{title}».",
    movedTitle: "План перенесён", movedBody: "{name} переносит «{title}» на {when}.",
    restoredTitle: "План снова в силе", restoredBody: "{name}: «{title}» снова в силе — {when}.",
    headsUpTitle: "О вашем плане", headsUpBody: "{name} о «{title}»:",
    weatherTitle: "Погода: {title}", weatherBody: "Ожидается: {condition}, около {time}. Измени время или предупреди остальных.",
    trafficTitle: "Пробки по пути на {title}", trafficBody: "Примерно на {minutes} мин дольше. Выезжай до {time} или предупреди остальных.",
    someone: "Кто-то",
    cond: { rain: "дождь", heavy_rain: "сильный дождь", storm: "гроза", snow: "снег", heat: "сильная жара", cold: "сильный мороз" },
  },
  fr: {
    cancelledTitle: "Plan annulé", cancelledBody: "{name} a annulé « {title} ».",
    cantTitle: "Changement de programme", cantBody: "{name} ne pourra pas venir à « {title} ».",
    movedTitle: "Plan déplacé", movedBody: "{name} a déplacé « {title} » au {when}.",
    restoredTitle: "Le plan est maintenu", restoredBody: "{name} : « {title} » est de nouveau prévu le {when}.",
    headsUpTitle: "À propos de votre plan", headsUpBody: "{name} à propos de « {title} » :",
    weatherTitle: "Alerte météo : {title}", weatherBody: "{condition} prévu(e) vers {time}. Change l'horaire ou préviens les autres.",
    trafficTitle: "Trafic vers {title}", trafficBody: "Environ {minutes} min de plus. Pars avant {time} ou préviens les autres.",
    someone: "Quelqu'un",
    cond: { rain: "Pluie", heavy_rain: "Fortes pluies", storm: "Orages", snow: "Neige", heat: "Forte chaleur", cold: "Grand froid" },
  },
  es: {
    cancelledTitle: "Plan cancelado", cancelledBody: "{name} ha cancelado «{title}».",
    cantTitle: "Cambio de planes", cantBody: "{name} no podrá ir a «{title}».",
    movedTitle: "Plan cambiado de fecha", movedBody: "{name} ha movido «{title}» al {when}.",
    restoredTitle: "El plan vuelve a estar en pie", restoredBody: "{name}: «{title}» vuelve a estar en pie, {when}.",
    headsUpTitle: "Sobre vuestro plan", headsUpBody: "{name} sobre «{title}»:",
    weatherTitle: "Aviso de tiempo: {title}", weatherBody: "Se espera {condition} hacia las {time}. Cambia la hora o avisa a los demás.",
    trafficTitle: "Tráfico de camino a {title}", trafficBody: "Unos {minutes} min más. Sal antes de las {time} o avisa a los demás.",
    someone: "Alguien",
    cond: { rain: "lluvia", heavy_rain: "lluvia intensa", storm: "tormenta", snow: "nieve", heat: "calor extremo", cold: "frío intenso" },
  },
  it: {
    cancelledTitle: "Piano annullato", cancelledBody: "{name} ha annullato «{title}».",
    cantTitle: "Cambio di programma", cantBody: "{name} non riesce a venire a «{title}».",
    movedTitle: "Piano spostato", movedBody: "{name} ha spostato «{title}» a {when}.",
    restoredTitle: "Il piano è di nuovo confermato", restoredBody: "{name}: «{title}» è di nuovo confermato, {when}.",
    headsUpTitle: "Sul vostro piano", headsUpBody: "{name} su «{title}»:",
    weatherTitle: "Allerta meteo: {title}", weatherBody: "Previsto/a {condition} verso le {time}. Cambia orario o avvisa gli altri.",
    trafficTitle: "Traffico verso {title}", trafficBody: "Circa {minutes} min in più. Parti entro le {time} o avvisa gli altri.",
    someone: "Qualcuno",
    cond: { rain: "pioggia", heavy_rain: "pioggia forte", storm: "temporali", snow: "neve", heat: "caldo estremo", cold: "gelo intenso" },
  },
  pt: {
    cancelledTitle: "Plano cancelado", cancelledBody: "{name} cancelou «{title}».",
    cantTitle: "Mudança de planos", cantBody: "{name} não vai conseguir ir a «{title}».",
    movedTitle: "Plano alterado", movedBody: "{name} mudou «{title}» para {when}.",
    restoredTitle: "O plano volta a estar de pé", restoredBody: "{name}: «{title}» volta a estar de pé, {when}.",
    headsUpTitle: "Sobre o vosso plano", headsUpBody: "{name} sobre «{title}»:",
    weatherTitle: "Alerta de tempo: {title}", weatherBody: "Previsto(a): {condition} por volta das {time}. Muda a hora ou avisa os outros.",
    trafficTitle: "Trânsito a caminho de {title}", trafficBody: "Cerca de {minutes} min a mais. Sai até às {time} ou avisa os outros.",
    someone: "Alguém",
    cond: { rain: "chuva", heavy_rain: "chuva forte", storm: "trovoada", snow: "neve", heat: "calor extremo", cold: "frio intenso" },
  },
  nl: {
    cancelledTitle: "Plan afgezegd", cancelledBody: "{name} heeft „{title}” afgezegd.",
    cantTitle: "Verandering van plan", cantBody: "{name} kan niet naar „{title}” komen.",
    movedTitle: "Plan verzet", movedBody: "{name} heeft „{title}” verzet naar {when}.",
    restoredTitle: "Plan gaat toch door", restoredBody: "{name}: „{title}” gaat weer door, {when}.",
    headsUpTitle: "Over jullie plan", headsUpBody: "{name} over „{title}”:",
    weatherTitle: "Weeralarm: {title}", weatherBody: "{condition} verwacht rond {time}. Verzet het plan of laat het de anderen weten.",
    trafficTitle: "Verkeer onderweg naar {title}", trafficBody: "Ongeveer {minutes} min langer. Vertrek uiterlijk {time} of laat het de anderen weten.",
    someone: "Iemand",
    cond: { rain: "Regen", heavy_rain: "Zware regen", storm: "Onweer", snow: "Sneeuw", heat: "Extreme hitte", cold: "Strenge vorst" },
  },
  pl: {
    cancelledTitle: "Plan odwołany", cancelledBody: "{name} odwołuje „{title}”.",
    cantTitle: "Zmiana planów", cantBody: "{name} nie da rady przyjść na „{title}”.",
    movedTitle: "Plan przeniesiony", movedBody: "{name} przenosi „{title}” na {when}.",
    restoredTitle: "Plan znów aktualny", restoredBody: "{name}: „{title}” znów aktualne — {when}.",
    headsUpTitle: "O waszym planie", headsUpBody: "{name} o „{title}”:",
    weatherTitle: "Alert pogodowy: {title}", weatherBody: "Prognoza: {condition} ok. {time}. Zmień godzinę albo daj znać innym.",
    trafficTitle: "Korki w drodze na {title}", trafficBody: "Około {minutes} min dłużej. Wyjedź do {time} albo daj znać innym.",
    someone: "Ktoś",
    cond: { rain: "deszcz", heavy_rain: "ulewa", storm: "burze", snow: "śnieg", heat: "upał", cold: "silny mróz" },
  },
  cs: {
    cancelledTitle: "Plán zrušen", cancelledBody: "{name} ruší „{title}“.",
    cantTitle: "Změna plánů", cantBody: "{name} nestihne „{title}“.",
    movedTitle: "Plán přesunut", movedBody: "{name} přesouvá „{title}“ na {when}.",
    restoredTitle: "Plán zase platí", restoredBody: "{name}: „{title}“ zase platí — {when}.",
    headsUpTitle: "K vašemu plánu", headsUpBody: "{name} k „{title}“:",
    weatherTitle: "Varování počasí: {title}", weatherBody: "Očekává se: {condition} kolem {time}. Změň čas nebo dej ostatním vědět.",
    trafficTitle: "Doprava cestou na {title}", trafficBody: "Asi o {minutes} min déle. Vyraz do {time} nebo dej ostatním vědět.",
    someone: "Někdo",
    cond: { rain: "déšť", heavy_rain: "silný déšť", storm: "bouřky", snow: "sníh", heat: "velké horko", cold: "silný mráz" },
  },
  sk: {
    cancelledTitle: "Plán zrušený", cancelledBody: "{name} ruší „{title}“.",
    cantTitle: "Zmena plánov", cantBody: "{name} nestihne „{title}“.",
    movedTitle: "Plán presunutý", movedBody: "{name} presúva „{title}“ na {when}.",
    restoredTitle: "Plán opäť platí", restoredBody: "{name}: „{title}“ opäť platí — {when}.",
    headsUpTitle: "K vášmu plánu", headsUpBody: "{name} k „{title}“:",
    weatherTitle: "Výstraha počasia: {title}", weatherBody: "Očakáva sa: {condition} okolo {time}. Zmeň čas alebo daj ostatným vedieť.",
    trafficTitle: "Doprava cestou na {title}", trafficBody: "Asi o {minutes} min dlhšie. Vyraz do {time} alebo daj ostatným vedieť.",
    someone: "Niekto",
    cond: { rain: "dážď", heavy_rain: "silný dážď", storm: "búrky", snow: "sneh", heat: "veľká horúčava", cold: "silný mráz" },
  },
  hu: {
    cancelledTitle: "Terv lemondva", cancelledBody: "{name} lemondta: „{title}”.",
    cantTitle: "Változás a tervekben", cantBody: "{name} nem tud eljönni: „{title}”.",
    movedTitle: "Terv áthelyezve", movedBody: "{name} áthelyezte: „{title}” → {when}.",
    restoredTitle: "A terv mégis marad", restoredBody: "{name}: „{title}” mégis marad — {when}.",
    headsUpTitle: "A tervetekről", headsUpBody: "{name} a(z) „{title}” tervről:",
    weatherTitle: "Időjárási figyelmeztetés: {title}", weatherBody: "Várható: {condition}, {time} körül. Módosítsd az időpontot, vagy szólj a többieknek.",
    trafficTitle: "Forgalom útban ide: {title}", trafficBody: "Kb. {minutes} perccel tovább tart. Indulj el {time}-ig, vagy szólj a többieknek.",
    someone: "Valaki",
    cond: { rain: "eső", heavy_rain: "felhőszakadás", storm: "zivatar", snow: "hó", heat: "hőség", cold: "erős fagy" },
  },
  ro: {
    cancelledTitle: "Plan anulat", cancelledBody: "{name} a anulat „{title}”.",
    cantTitle: "Schimbare de planuri", cantBody: "{name} nu poate ajunge la „{title}”.",
    movedTitle: "Plan mutat", movedBody: "{name} a mutat „{title}” pe {when}.",
    restoredTitle: "Planul rămâne în picioare", restoredBody: "{name}: „{title}” are loc din nou — {when}.",
    headsUpTitle: "Despre planul vostru", headsUpBody: "{name} despre „{title}”:",
    weatherTitle: "Alertă meteo: {title}", weatherBody: "Se așteaptă {condition} în jur de {time}. Schimbă ora sau anunță-i pe ceilalți.",
    trafficTitle: "Trafic spre {title}", trafficBody: "Cu aproximativ {minutes} min în plus. Pleacă până la {time} sau anunță-i pe ceilalți.",
    someone: "Cineva",
    cond: { rain: "ploaie", heavy_rain: "ploaie torențială", storm: "furtuni", snow: "ninsoare", heat: "caniculă", cold: "ger" },
  },
  sv: {
    cancelledTitle: "Planen inställd", cancelledBody: "{name} har ställt in ”{title}”.",
    cantTitle: "Ändrade planer", cantBody: "{name} kan inte komma till ”{title}”.",
    movedTitle: "Planen flyttad", movedBody: "{name} har flyttat ”{title}” till {when}.",
    restoredTitle: "Planen blir av ändå", restoredBody: "{name}: ”{title}” blir av igen, {when}.",
    headsUpTitle: "Om er plan", headsUpBody: "{name} om ”{title}”:",
    weatherTitle: "Vädervarning: {title}", weatherBody: "{condition} väntas runt {time}. Byt tid eller säg till de andra.",
    trafficTitle: "Trafik på väg till {title}", trafficBody: "Cirka {minutes} min extra. Åk senast {time} eller säg till de andra.",
    someone: "Någon",
    cond: { rain: "Regn", heavy_rain: "Kraftigt regn", storm: "Åska", snow: "Snö", heat: "Extrem värme", cold: "Sträng kyla" },
  },
  da: {
    cancelledTitle: "Planen er aflyst", cancelledBody: "{name} har aflyst “{title}”.",
    cantTitle: "Ændrede planer", cantBody: "{name} kan ikke nå “{title}”.",
    movedTitle: "Planen er flyttet", movedBody: "{name} har flyttet “{title}” til {when}.",
    restoredTitle: "Planen bliver til noget alligevel", restoredBody: "{name}: “{title}” er på igen, {when}.",
    headsUpTitle: "Om jeres plan", headsUpBody: "{name} om “{title}”:",
    weatherTitle: "Vejrvarsel: {title}", weatherBody: "{condition} ventes omkring {time}. Skift tidspunkt eller giv de andre besked.",
    trafficTitle: "Trafik på vej til {title}", trafficBody: "Cirka {minutes} min ekstra. Tag af sted senest {time} eller giv de andre besked.",
    someone: "En person",
    cond: { rain: "Regn", heavy_rain: "Kraftig regn", storm: "Tordenvejr", snow: "Sne", heat: "Ekstrem varme", cold: "Hård frost" },
  },
  fi: {
    cancelledTitle: "Suunnitelma peruttu", cancelledBody: "{name} perui: ”{title}”.",
    cantTitle: "Muutos suunnitelmiin", cantBody: "{name} ei pääse: ”{title}”.",
    movedTitle: "Suunnitelma siirretty", movedBody: "{name} siirsi ”{title}”: {when}.",
    restoredTitle: "Suunnitelma on taas voimassa", restoredBody: "{name}: ”{title}” on taas voimassa, {when}.",
    headsUpTitle: "Suunnitelmastanne", headsUpBody: "{name} – ”{title}”:",
    weatherTitle: "Säävaroitus: {title}", weatherBody: "Odotettavissa: {condition} noin klo {time}. Vaihda aikaa tai kerro muille.",
    trafficTitle: "Ruuhkaa matkalla: {title}", trafficBody: "Noin {minutes} min lisää. Lähde viimeistään {time} tai kerro muille.",
    someone: "Joku",
    cond: { rain: "sadetta", heavy_rain: "rankkasadetta", storm: "ukkosta", snow: "lunta", heat: "kovaa helettä", cold: "kovaa pakkasta" },
  },
  et: {
    cancelledTitle: "Plaan tühistatud", cancelledBody: "{name} tühistas: „{title}“.",
    cantTitle: "Plaanid muutusid", cantBody: "{name} ei jõua: „{title}“.",
    movedTitle: "Plaan nihutatud", movedBody: "{name} nihutas „{title}“: {when}.",
    restoredTitle: "Plaan jääb ikkagi", restoredBody: "{name}: „{title}“ toimub jälle — {when}.",
    headsUpTitle: "Teie plaani kohta", headsUpBody: "{name} plaani „{title}“ kohta:",
    weatherTitle: "Ilmahoiatus: {title}", weatherBody: "Oodata on: {condition} umbes kell {time}. Muuda aega või anna teistele teada.",
    trafficTitle: "Liiklus teel: {title}", trafficBody: "Umbes {minutes} min kauem. Lahku hiljemalt {time} või anna teistele teada.",
    someone: "Keegi",
    cond: { rain: "vihm", heavy_rain: "paduvihm", storm: "äike", snow: "lumi", heat: "kõva kuumus", cold: "käre külm" },
  },
  lv: {
    cancelledTitle: "Plāns atcelts", cancelledBody: "{name} atcēla “{title}”.",
    cantTitle: "Plānu maiņa", cantBody: "{name} nevarēs ierasties: “{title}”.",
    movedTitle: "Plāns pārcelts", movedBody: "{name} pārcēla “{title}” uz {when}.",
    restoredTitle: "Plāns atkal spēkā", restoredBody: "{name}: “{title}” atkal notiks — {when}.",
    headsUpTitle: "Par jūsu plānu", headsUpBody: "{name} par “{title}”:",
    weatherTitle: "Laikapstākļu brīdinājums: {title}", weatherBody: "Gaidāms: {condition} ap {time}. Maini laiku vai brīdini pārējos.",
    trafficTitle: "Satiksme ceļā uz {title}", trafficBody: "Apmēram par {minutes} min ilgāk. Izbrauc līdz {time} vai brīdini pārējos.",
    someone: "Kāds",
    cond: { rain: "lietus", heavy_rain: "stiprs lietus", storm: "pērkona negaiss", snow: "sniegs", heat: "liels karstums", cold: "stiprs sals" },
  },
  lt: {
    cancelledTitle: "Planas atšauktas", cancelledBody: "{name} atšaukė „{title}“.",
    cantTitle: "Planų pasikeitimas", cantBody: "{name} negalės atvykti: „{title}“.",
    movedTitle: "Planas perkeltas", movedBody: "{name} perkėlė „{title}“ į {when}.",
    restoredTitle: "Planas vėl galioja", restoredBody: "{name}: „{title}“ vėl vyks — {when}.",
    headsUpTitle: "Apie jūsų planą", headsUpBody: "{name} apie „{title}“:",
    weatherTitle: "Orų įspėjimas: {title}", weatherBody: "Tikimasi: {condition} apie {time}. Pakeisk laiką arba pranešk kitiems.",
    trafficTitle: "Eismas pakeliui į {title}", trafficBody: "Maždaug {minutes} min ilgiau. Išvyk iki {time} arba pranešk kitiems.",
    someone: "Kažkas",
    cond: { rain: "lietus", heavy_rain: "liūtis", storm: "perkūnija", snow: "sniegas", heat: "didelis karštis", cold: "stiprus šaltis" },
  },
  bg: {
    cancelledTitle: "Планът е отменен", cancelledBody: "{name} отмени „{title}“.",
    cantTitle: "Промяна в плановете", cantBody: "{name} няма да успее за „{title}“.",
    movedTitle: "Планът е преместен", movedBody: "{name} премести „{title}“ за {when}.",
    restoredTitle: "Планът отново е в сила", restoredBody: "{name}: „{title}“ отново е в сила — {when}.",
    headsUpTitle: "За вашия план", headsUpBody: "{name} за „{title}“:",
    weatherTitle: "Предупреждение за времето: {title}", weatherBody: "Очаква се: {condition} около {time}. Смени часа или предупреди останалите.",
    trafficTitle: "Трафик по пътя към {title}", trafficBody: "Около {minutes} мин повече. Тръгни до {time} или предупреди останалите.",
    someone: "Някой",
    cond: { rain: "дъжд", heavy_rain: "силен дъжд", storm: "гръмотевични бури", snow: "сняг", heat: "силна жега", cold: "силен студ" },
  },
  el: {
    cancelledTitle: "Το σχέδιο ακυρώθηκε", cancelledBody: "Ο/Η {name} ακύρωσε το «{title}».",
    cantTitle: "Αλλαγή σχεδίων", cantBody: "Ο/Η {name} δεν θα προλάβει το «{title}».",
    movedTitle: "Το σχέδιο μετακινήθηκε", movedBody: "Ο/Η {name} μετέφερε το «{title}» στις {when}.",
    restoredTitle: "Το σχέδιο ισχύει ξανά", restoredBody: "{name}: το «{title}» ισχύει ξανά — {when}.",
    headsUpTitle: "Για το σχέδιό σας", headsUpBody: "{name} για το «{title}»:",
    weatherTitle: "Προειδοποίηση καιρού: {title}", weatherBody: "Αναμένεται: {condition} γύρω στις {time}. Άλλαξε ώρα ή ενημέρωσε τους άλλους.",
    trafficTitle: "Κίνηση προς {title}", trafficBody: "Περίπου {minutes} λεπτά παραπάνω. Φύγε έως τις {time} ή ενημέρωσε τους άλλους.",
    someone: "Κάποιος",
    cond: { rain: "βροχή", heavy_rain: "έντονη βροχή", storm: "καταιγίδες", snow: "χιόνι", heat: "καύσωνας", cold: "παγωνιά" },
  },
  hr: {
    cancelledTitle: "Plan otkazan", cancelledBody: "{name} otkazuje „{title}”.",
    cantTitle: "Promjena planova", cantBody: "{name} ne stiže na „{title}”.",
    movedTitle: "Plan pomaknut", movedBody: "{name} pomiče „{title}” na {when}.",
    restoredTitle: "Plan ipak vrijedi", restoredBody: "{name}: „{title}” opet vrijedi — {when}.",
    headsUpTitle: "O vašem planu", headsUpBody: "{name} o „{title}”:",
    weatherTitle: "Upozorenje o vremenu: {title}", weatherBody: "Očekuje se: {condition} oko {time}. Promijeni vrijeme ili javi ostalima.",
    trafficTitle: "Promet na putu do {title}", trafficBody: "Oko {minutes} min duže. Kreni do {time} ili javi ostalima.",
    someone: "Netko",
    cond: { rain: "kiša", heavy_rain: "jaka kiša", storm: "grmljavina", snow: "snijeg", heat: "velika vrućina", cold: "jaka hladnoća" },
  },
  sl: {
    cancelledTitle: "Načrt odpovedan", cancelledBody: "{name} odpoveduje „{title}“.",
    cantTitle: "Sprememba načrtov", cantBody: "{name} ne bo prišel/a na „{title}“.",
    movedTitle: "Načrt prestavljen", movedBody: "{name} prestavlja „{title}“ na {when}.",
    restoredTitle: "Načrt spet velja", restoredBody: "{name}: „{title}“ spet velja — {when}.",
    headsUpTitle: "O vajinem/vašem načrtu", headsUpBody: "{name} o „{title}“:",
    weatherTitle: "Vremensko opozorilo: {title}", weatherBody: "Pričakovano: {condition} okoli {time}. Spremeni čas ali obvesti ostale.",
    trafficTitle: "Promet na poti do {title}", trafficBody: "Približno {minutes} min dlje. Odpravi se do {time} ali obvesti ostale.",
    someone: "Nekdo",
    cond: { rain: "dež", heavy_rain: "močan dež", storm: "nevihte", snow: "sneg", heat: "huda vročina", cold: "hud mraz" },
  },
  ga: {
    cancelledTitle: "Plean curtha ar ceal", cancelledBody: "Chuir {name} “{title}” ar ceal.",
    cantTitle: "Athrú pleananna", cantBody: "Ní bheidh {name} in ann teacht chuig “{title}”.",
    movedTitle: "Plean bogtha", movedBody: "Bhog {name} “{title}” go {when}.",
    restoredTitle: "Tá an plean ar siúl arís", restoredBody: "{name}: tá “{title}” ar siúl arís — {when}.",
    headsUpTitle: "Faoi bhur bplean", headsUpBody: "{name} faoi “{title}”:",
    weatherTitle: "Rabhadh aimsire: {title}", weatherBody: "Táthar ag súil le: {condition} timpeall {time}. Athraigh an t-am nó cuir na daoine eile ar an eolas.",
    trafficTitle: "Trácht ar an mbealach chuig {title}", trafficBody: "Timpeall {minutes} nóim. breise. Imigh roimh {time} nó cuir na daoine eile ar an eolas.",
    someone: "Duine éigin",
    cond: { rain: "báisteach", heavy_rain: "báisteach throm", storm: "stoirmeacha toirní", snow: "sneachta", heat: "teas mór", cold: "sioc crua" },
  },
  mt: {
    cancelledTitle: "Pjan ikkanċellat", cancelledBody: "{name} ikkanċella “{title}”.",
    cantTitle: "Bidla fil-pjanijiet", cantBody: "{name} mhux se jasal/tasal għal “{title}”.",
    movedTitle: "Pjan imċaqlaq", movedBody: "{name} ċaqlaq “{title}” għal {when}.",
    restoredTitle: "Il-pjan għadu fis-seħħ", restoredBody: "{name}: “{title}” reġa' fis-seħħ — {when}.",
    headsUpTitle: "Dwar il-pjan tagħkom", headsUpBody: "{name} dwar “{title}”:",
    weatherTitle: "Twissija tat-temp: {title}", weatherBody: "Mistenni: {condition} għall-ħabta ta' {time}. Biddel il-ħin jew għarraf lill-oħrajn.",
    trafficTitle: "Traffiku fit-triq għal {title}", trafficBody: "Madwar {minutes} min aktar. Itlaq sa {time} jew għarraf lill-oħrajn.",
    someone: "Xi ħadd",
    cond: { rain: "xita", heavy_rain: "xita qawwija", storm: "maltempata", snow: "silġ", heat: "sħana kbira", cold: "kesħa qawwija" },
  },
};

export const PLAN_NOTIFY_LOCALES = Object.keys(DICTS);

function dictFor(locale: string | null | undefined): Dict {
  const l = (locale ?? "").slice(0, 2).toLowerCase();
  return DICTS[l] ?? EN;
}

function fill(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

function clip(s: string, n: number): string {
  const t = s.trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

/** "Sat, 4 Oct, 19:30" in the recipient's language and time zone (falls back to UTC). */
export function formatWhen(iso: string, locale?: string | null, timeZone?: string | null): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" };
  try {
    return new Intl.DateTimeFormat(locale ?? "en", { ...opts, timeZone: timeZone ?? "UTC" }).format(d);
  } catch {
    return new Intl.DateTimeFormat("en", { ...opts, timeZone: "UTC" }).format(d);
  }
}

export function formatTime(iso: string, locale?: string | null, timeZone?: string | null): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(locale ?? "en", { hour: "2-digit", minute: "2-digit", timeZone: timeZone ?? "UTC" }).format(d);
  } catch {
    return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(d);
  }
}

/** Push for a plan change sent to the other participants. */
export function planChangePush(input: {
  kind: PlanNoticeKind;
  locale?: string | null;
  timeZone?: string | null;
  actorName?: string | null;
  title: string;
  newStartsAt?: string | null;
  reason?: string | null;
}): { title: string; body: string } {
  const d = dictFor(input.locale);
  const vars = {
    name: clip(input.actorName || d.someone, 40),
    title: clip(input.title, 60),
    when: input.newStartsAt ? formatWhen(input.newStartsAt, input.locale, input.timeZone) : "",
  };
  const [t, b] =
    input.kind === "cancelled" ? [d.cancelledTitle, d.cancelledBody]
    : input.kind === "cant_make_it" ? [d.cantTitle, d.cantBody]
    : input.kind === "rescheduled" ? [d.movedTitle, d.movedBody]
    : input.kind === "restored" ? [d.restoredTitle, d.restoredBody]
    : [d.headsUpTitle, d.headsUpBody];
  const reason = input.reason?.trim() ? `\n“${clip(input.reason, 160)}”` : "";
  return { title: fill(t, vars), body: fill(b, vars) + reason };
}

/** Push for a weather / traffic alert on the user's own plan. */
export function planAlertPush(input: {
  kind: "weather" | "traffic";
  locale?: string | null;
  timeZone?: string | null;
  title: string;
  condition?: WeatherCondition;
  atIso?: string | null;
  extraMinutes?: number;
  leaveByIso?: string | null;
}): { title: string; body: string } {
  const d = dictFor(input.locale);
  const title = clip(input.title, 60);
  if (input.kind === "weather") {
    const cond = d.cond[input.condition ?? "rain"];
    const condition = cond.charAt(0).toUpperCase() + cond.slice(1);
    return {
      title: fill(d.weatherTitle, { title }),
      body: fill(d.weatherBody, {
        condition: /\{condition\}/.test(d.weatherBody) && d.weatherBody.indexOf("{condition}") === 0 ? condition : cond,
        time: input.atIso ? formatTime(input.atIso, input.locale, input.timeZone) : "",
      }),
    };
  }
  return {
    title: fill(d.trafficTitle, { title }),
    body: fill(d.trafficBody, {
      minutes: Math.max(1, Math.round(input.extraMinutes ?? 0)),
      time: input.leaveByIso ? formatTime(input.leaveByIso, input.locale, input.timeZone) : "",
    }),
  };
}
