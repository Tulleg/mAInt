import { generateDeterministicEmbedding } from "./provider";
import { db as defaultDb } from "@/db";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";

export interface SeedHistoricalMeasure {
  orderNumber: string;
  title: string;
  description: string;
  equipmentName: string;
  equipmentModel: string;
  manufacturer: string;
  damageCode: string;
  causeCode: string;
  cause: string;
  solution: string;
  recommendedSpareParts: Array<{
    partNumber: string;
    name: string;
    quantity: number;
  }>;
  downtimeMinutes: number;
  synthesizedDocumentText: string;
  embedding: number[];
}

export const SEED_HISTORICAL_MEASURES: Omit<SeedHistoricalMeasure, "embedding" | "synthesizedDocumentText">[] = [
  {
    orderNumber: "MO-HIST-001",
    title: "Kreiselpumpe KSB verliert Druck und überhitzt",
    description: "KSB Kreiselpumpe in Halle 2 verliert massiv Förderdruck, Lagertemperatur bei 92°C, starke Schwingungsentwicklung am A-Lager.",
    equipmentName: "Kreiselpumpe KSB Etanorm",
    equipmentModel: "Etanorm 50-200",
    manufacturer: "KSB SE",
    damageCode: "MECH_LAGER",
    causeCode: "VERSCHLEISS",
    cause: "Mangelschmierung und fortgeschrittener Ermüdungsbruch im Rillenkugellager des antriebsseitigen Lagerschilds.",
    solution: "Pumpe drucklos geschaltet und entleert. Lagerschild demontiert, altes Lager mit Abzieher entfernt. Wellensitz gereinigt und poliert. Neues SKF 6205-2RSH Rillenkugellager warm montiert (Induktionsanwärmung 110°C) und mit Klüber Spezialfett neu befüllt. Gleitringdichtung auf Planlauf kontrolliert.",
    recommendedSpareParts: [
      { partNumber: "SKF-6205-2RSH", name: "Rillenkugellager SKF 6205-2RSH", quantity: 2 },
      { partNumber: "GLRD-BURG-32", name: "Gleitringdichtung Burgmann MG1", quantity: 1 },
      { partNumber: "OR-VITON-45", name: "Viton O-Ring 45x3mm", quantity: 2 },
    ],
    downtimeMinutes: 180,
  },
  {
    orderNumber: "MO-HIST-002",
    title: "Antriebsmotor Siemens 45kW Mahlgeräusche und Vibration",
    description: "Siemens Drehstrom-Asynchronmotor läuft unruhig bei Teillast, periodische Klopf- und Schleifgeräusche am B-Lagerschild.",
    equipmentName: "Antriebsmotor Siemens 45kW",
    equipmentModel: "1LE1001-1DB4",
    manufacturer: "Siemens AG",
    damageCode: "MECH_LAGER",
    causeCode: "UEBERLAST",
    cause: "Käfigbruch im Zylinderrollenlager durch Axialschub und Kupplungsversatz zur angetriebenen Welle.",
    solution: "Motor abgekoppelt und Laseroptische Ausrichtung der Kupplung überprüft (0.35mm Versatz festgestellt). B-seitiges Lagerschild abgezogen, NU210 Zylinderrollenlager getauscht. Kupplungsgummis erneuert und Antriebsstrang laseroptisch auf <0.05mm toleriert ausgerichtet.",
    recommendedSpareParts: [
      { partNumber: "FAG-NU210-E", name: "Zylinderrollenlager FAG NU210-E", quantity: 1 },
      { partNumber: "ROTEX-42-EL", name: "KTR Rotex Zahnkranz 98 Shore", quantity: 1 },
    ],
    downtimeMinutes: 240,
  },
  {
    orderNumber: "MO-HIST-003",
    title: "Kaeser Schraubenkompressor Ölaustritt und Druckverlust",
    description: "Schraubenkompressor schaltet mit Fehler 'Öldruck zu gering' ab, Ölpfütze unter Verdichterblock.",
    equipmentName: "Kaeser Schraubenkompressor",
    equipmentModel: "CSD 105",
    manufacturer: "Kaeser Kompressoren",
    damageCode: "HYDR_LECK",
    causeCode: "DICHTUNG",
    cause: "Aushärtung des Wellendichtrings am Verdichterblock durch thermische Überbeanspruchung.",
    solution: "Kompressor drucklos entspannt, Verdichterwelle freigelegt. PTFE-Wellendichtring mit Schonwerkzeug ersetzt. Öl-Rücklaufventil gereinigt und Kaeser Sigma Fluid Schmierstoff komplett gewechselt.",
    recommendedSpareParts: [
      { partNumber: "KAES-WDR-50", name: "PTFE Wellendichtring Kaeser", quantity: 1 },
      { partNumber: "SIGMA-M-46", name: "Kaeser Sigma Fluid Schmieröl 20L", quantity: 1 },
      { partNumber: "FILTER-OEL-KAE", name: "Ölabscheidepatrone Kaeser", quantity: 1 },
    ],
    downtimeMinutes: 120,
  },
  {
    orderNumber: "MO-HIST-004",
    title: "Hydraulikpresse 200t Druckabfall am Hauptzylinder",
    description: "Hauptstößel fährt im Eilgang herunter, erreicht aber den erforderlichen Schließdruck von 180 bar nicht. Druck pulsiert zwischen 60 und 90 bar.",
    equipmentName: "Hydraulikpresse 200t",
    equipmentModel: "HP-200-CNC",
    manufacturer: "Müller Weingarten",
    damageCode: "HYDR_VENTIL",
    causeCode: "VERSCHMUTZUNG",
    cause: "Verstopfung der Steuerdüse im Rexroth Proportional-Druckbegrenzungsventil durch Mikro-Späne im Hydrauliköl.",
    solution: "Druckbegrenzungsventil ausgebaut, Ultraschall-gereinigt und Steuerkolben auf Riefenbildung geprüft. Druckfiltereinsatz gewechselt. Druckregelventil neu kalibriert und Stößeldruck auf Sollwert 180 bar justiert.",
    recommendedSpareParts: [
      { partNumber: "REX-DBET-001", name: "Rexroth Proportionalventil DBET", quantity: 1 },
      { partNumber: "HYD-FILT-10MIC", name: "Hydraulikfilterelement 10µm", quantity: 2 },
    ],
    downtimeMinutes: 150,
  },
  {
    orderNumber: "MO-HIST-005",
    title: "Festo Ventilinsel Druckluftleckage und Zylinderstörung",
    description: "Zylinder an Station 3 fährt nicht vollständig aus. Zischendes Dauergeräusch an Ventilinsel Block B.",
    equipmentName: "Montagelinie 1 Ventilinsel",
    equipmentModel: "CPX-MPA-FB",
    manufacturer: "Festo AG",
    damageCode: "PNEU_LECK",
    causeCode: "DICHTUNG",
    cause: "Formsitzdichtung der MPA1-Ventilscheibe verrutscht und eingerissen infolge von Kondenswasserschlag.",
    solution: "Druckluftzuleitung gesperrt. MPA1 Magnetventilscheibe getauscht, Dichtungsstreifen der Grundplatte erneuert. Kondensatabscheider an der Wartungseinheit gewartet und Entwässerungsventil geprüft.",
    recommendedSpareParts: [
      { partNumber: "FESTO-MPA1-MS", name: "Festo Magnetventil MPA1-M1H", quantity: 1 },
      { partNumber: "FESTO-DS-MPA", name: "Dichtungssatz Ventilinsel MPA", quantity: 1 },
    ],
    downtimeMinutes: 45,
  },
  {
    orderNumber: "MO-HIST-006",
    title: "Kuka Roboter Achse 4 Drehmomentfehler und Ruckeln",
    description: "Kuka Schweißroboter stoppt mit Not-Halt 'Quittierbarer Achsfehler A4 Überstrom/Drehmoment'.",
    equipmentName: "Kuka KR 210 Roboterzelle",
    equipmentModel: "KR 210 R2700",
    manufacturer: "KUKA AG",
    damageCode: "ROB_ANTRIEB",
    causeCode: "VERSCHLEISS",
    cause: "Zahnflankenspiel und Getriebespäne im Harmonic-Drive-Getriebe von Achse 4.",
    solution: "Roboter abgestützt, Kabelstrang gelöst. Getriebeeinheit Achse 4 demontiert und durch vorparametriertes Austauschgetriebe ersetzt. Resolver justiert und elektronische Achsjustage (EMT) mit Justagebesteck durchgeführt.",
    recommendedSpareParts: [
      { partNumber: "KUKA-A4-GEAR", name: "Harmonic Drive Getriebe A4 KR210", quantity: 1 },
      { partNumber: "KUKA-CAB-A4", name: "Energieführungskabel A4", quantity: 1 },
    ],
    downtimeMinutes: 300,
  },
  {
    orderNumber: "MO-HIST-007",
    title: "Gurtförderer Förderband schiefgelaufen und gerissen",
    description: "Förderband 5 schleift an der Seitenführung, Kantenfransenbildung, Notabschaltung durch Schlupfwächter.",
    equipmentName: "Gurtförderanlage Palettierung",
    equipmentModel: "GF-1200-8M",
    manufacturer: "Interroll",
    damageCode: "MECH_GURT",
    causeCode: "JUSTAGE",
    cause: "Spannstationslager links blockiert, ungleichmäßige Bandspannung führte zum Schieflauf und Einriss.",
    solution: "Defektes Stehlager an Spannrolle gewechselt. PVC-Fördergurt abgelängt und mit Heißsiegelpresse z-förmig endlos verschweißt. Bandspanner nach Drehmomentvorgabe gleichmäßig ausgerichtet und Probelauf unter Volllast durchgeführt.",
    recommendedSpareParts: [
      { partNumber: "GURT-PVC-1200", name: "PVC Fördergurt 1200mm endlos", quantity: 1 },
      { partNumber: "INA-UCP206", name: "Stehlager INA UCP206", quantity: 2 },
    ],
    downtimeMinutes: 210,
  },
  {
    orderNumber: "MO-HIST-008",
    title: "Schaltschrank Überhitzung und SPS-Warnung 70°C",
    description: "Hauptverteiler Schaltschrank meldet Sammelalarm Temperatur. SPS CPU drosselt Taktung.",
    equipmentName: "Hauptschaltschrank Linie 2",
    equipmentModel: "Rittal VX25",
    manufacturer: "Rittal",
    damageCode: "ELEC_KUEHLUNG",
    causeCode: "LUEFTER",
    cause: "Verflüssigerlüfter des Dachkühlgeräts durch dichte Filtermatten festgebacken und durchgebrannt.",
    solution: "Dachkühlgerät Rittal TopTherm spannungsfrei geschaltet. Lüftermotor getauscht, Verdampferrippen mit Trockeneis schonend ausgeblasen. Neue Vliesfiltermatten eingesetzt und Temperaturregler auf Soll 35°C justiert.",
    recommendedSpareParts: [
      { partNumber: "RIT-FAN-330", name: "Rittal Lüftermotor SK 3326.107", quantity: 1 },
      { partNumber: "RIT-FILT-MAT", name: "Rittal Filtermatte Standard 5er", quantity: 2 },
    ],
    downtimeMinutes: 60,
  },
  {
    orderNumber: "MO-HIST-009",
    title: "Kühlschmierstoff-Pumpe Blockade durch Späne",
    description: "CNC Bearbeitungszentrum meldet Fehler 'Kühlmitteldruck unzureichend', Fräsvorgang bricht ab.",
    equipmentName: "DMG Mori CNC Fräszentrum",
    equipmentModel: "DMC 105 V",
    manufacturer: "DMG MORI",
    damageCode: "MECH_PUMPE",
    causeCode: "VERSCHMUTZUNG",
    cause: "Spanansammlung im Laufrad der Hochdruckpumpe durch gebrochenes Vorfiltergitter im Späneförderer.",
    solution: "Hochdruck-Tauchpumpe Brinkmann ausgebaut. Laufrad gereinigt und Fremdkörper entfernt. Schersieb im Spänesumpf instandgesetzt und Sauggitter montiert. Druckprüfung 40 bar erfolgreich.",
    recommendedSpareParts: [
      { partNumber: "BRINK-IMPELLER", name: "Brinkmann Laufrad TH45", quantity: 1 },
      { partNumber: "SIEB-KSS-DMG", name: "Vorfiltersieb Edelstahl 1mm", quantity: 1 },
    ],
    downtimeMinutes: 90,
  },
  {
    orderNumber: "MO-HIST-010",
    title: "Sick Sicherheits-Lichtschranke optischer Fehlauslöser",
    description: "Sicherheitszaun-Schleuse löst sporadisch Not-Halt aus, obwohl kein Bediener im Schutzbereich ist.",
    equipmentName: "Sicherheitsbereich Roboter",
    equipmentModel: "deTec4 Core",
    manufacturer: "SICK AG",
    damageCode: "SEN_OPTIK",
    causeCode: "VERSCHMUTZUNG",
    cause: "Ölnebel- und Staubablagerungen auf der Frontscheibe des Sende- und Empfangskopfs.",
    solution: "Frontscheiben mit Spezial-Optikreiniger gereinigt. Justierlaser aufgesetzt und Ausrichtung nachjustiert (Signalpegel von 45% auf 98% gesteigert). Zusätzliche Schutzblende gegen KSS-Nebel installiert.",
    recommendedSpareParts: [
      { partNumber: "SICK-FRONT-LID", name: "Ersatz-Frontscheibe deTec4", quantity: 1 },
      { partNumber: "OPTIC-CLEAN-KIT", name: "Industrie Optik-Reinigungsset", quantity: 1 },
    ],
    downtimeMinutes: 30,
  },
  {
    orderNumber: "MO-HIST-011",
    title: "Heizregister Verpackungstunnel Ausfall einer Heizzone",
    description: "Schrumpffolie schrumpft ungleichmäßig, Heizzone 2 erreicht Solltemperatur von 160°C nicht.",
    equipmentName: "Schrumpftunnel E-Line",
    equipmentModel: "ST-800",
    manufacturer: "Kallfass",
    damageCode: "ELEC_HEIZUNG",
    causeCode: "ELEMENTBRUCH",
    cause: "Widerstandsdrahtbruch in zwei Rohrheizkörpern infolge thermischer Lastwechsel.",
    solution: "Heizregister ausgebaut, Widerstandsmessung ergab Unendlich auf Phase L2. Zwei defekte 2kW-Rohrheizkörper ersetzt, Hochtemperaturverkabelung mit Keramikklemmen erneuert. Aufheizkurve überprüft.",
    recommendedSpareParts: [
      { partNumber: "HEIZ-ROHR-2KW", name: "Rohrheizkörper 2000W 230V", quantity: 2 },
      { partNumber: "KERAMIK-KL-4", name: "Steatit Keramikklemmen 4-polig", quantity: 2 },
    ],
    downtimeMinutes: 75,
  },
  {
    orderNumber: "MO-HIST-012",
    title: "Spindellagerung CNC Fräsmaschine Rundlauffehler",
    description: "Oberflächengüte bei Schlichtbearbeitung mangelhaft (Rattermarken), Spindel erwärmt sich über 60°C.",
    equipmentName: "DMG Mori CNC Fräszentrum",
    equipmentModel: "DMC 105 V",
    manufacturer: "DMG MORI",
    damageCode: "MECH_SPINDEL",
    causeCode: "LAGERVERSCHLEISS",
    cause: "Verschleiß der Hybrid-Spindellager durch hohe Drehzahlen und Mikrovibrationen.",
    solution: "Motorspindel demontiert und durch überholte Werkspindel ersetzt. Spindelkühlung entlüftet, Sperrluftdruck geprüft (1.5 bar). Werkzeugkegel HSK-A63 mit Tuschierlehre kontrolliert.",
    recommendedSpareParts: [
      { partNumber: "SPINDEL-DMG-A63", name: "Tauschspindel HSK-A63 18.000rpm", quantity: 1 },
      { partNumber: "O-RING-SET-SPIND", name: "O-Ringsatz Kühlmantel Spindel", quantity: 1 },
    ],
    downtimeMinutes: 480,
  },
  {
    orderNumber: "MO-HIST-013",
    title: "Vakuum-Sauggreifer Palettierer verliert Kartons",
    description: "Sauggreiferspinne verliert schwere Kartons beim Anheben, Vakuumniveau sinkt unter -0.4 bar.",
    equipmentName: "Kuka KR 210 Roboterzelle",
    equipmentModel: "KR 210 R2700",
    manufacturer: "KUKA AG",
    damageCode: "PNEU_VAKUUM",
    causeCode: "VERSCHLEISS",
    cause: "Balg-Sauggreifer rissig und Schmutzfilter der Mehrstufen-Ejektordüse zugesetzt.",
    solution: "6 Balgsauger aus NBR gegen hochabriebfeste Polyurethan-Sauger getauscht. Schalldämpfer und Ejektordüse mit Druckluft gereinigt. Vakuumwächter Schaltschwelle auf -0.75 bar justiert.",
    recommendedSpareParts: [
      { partNumber: "SCHMALZ-BLG-50", name: "Schmalz Balgsauger SAB 50 PU", quantity: 6 },
      { partNumber: "EJEKT-FILTER-SCH", name: "Vakuumfilter Schmalz VFE", quantity: 2 },
    ],
    downtimeMinutes: 40,
  },
  {
    orderNumber: "MO-HIST-014",
    title: "Rollenbahn Kettenantrieb Kette gelängt und abgesprungen",
    description: "Schwerlastrollenbahn steht, Antriebsmotor dreht leer durch, Antriebskette hängt durch.",
    equipmentName: "Gurtförderanlage Palettierung",
    equipmentModel: "GF-1200-8M",
    manufacturer: "Interroll",
    damageCode: "MECH_KETTE",
    causeCode: "VERSCHLEISS",
    cause: "Verschleißlängung der Duplex-Rollenkette über das zulässige Maß von 2% hinaus, Kettenspanner am Anschlag.",
    solution: "Alte Kette geöffnet und entfernt. Kettenräder auf Haifischzahn-Verschleiß geprüft (Zustand i.O.). Neue Wippermann Duplexkette 12B-2 eingezogen, mit Kettenschloss vernietet. Kettenspanner neu vorgespannt und automatisches Schmiersystem nachgefüllt.",
    recommendedSpareParts: [
      { partNumber: "KETTE-WIPP-12B2", name: "Duplex Rollenkette 12B-2 (5m)", quantity: 1 },
      { partNumber: "KETTSCHL-12B2", name: "Kettenschloss gerollt 12B-2", quantity: 2 },
    ],
    downtimeMinutes: 110,
  },
  {
    orderNumber: "MO-HIST-015",
    title: "Kältetrockner Druckluft Vereisung und Wasser im Netz",
    description: "Druckluft an Endverbrauchern enthält Kondenswasser. Kältetrockner Drucktaupunktanzeige blinkt rot bei +18°C.",
    equipmentName: "Kaeser Schraubenkompressor",
    equipmentModel: "CSD 105",
    manufacturer: "Kaeser Kompressoren",
    damageCode: "KUEHL_TROCKNER",
    causeCode: "KAELTEMITTEL",
    cause: "Kältemittelverlust R134a an Schraderventil des Sauggasdruckmessers.",
    solution: "Kältemittelkreis evakuiert, Schraderventilkern ausgetauscht. Dichtheitsprüfung mit Formiergas (Stickstoff/Wasserstoff 95/5). 1.8 kg R134a Kältemittel nach Herstellervorgabe befüllt. Drucktaupunkt pendelt sich bei soliden +3°C ein.",
    recommendedSpareParts: [
      { partNumber: "SCHRADER-VENT-CORE", name: "Klima Schraderventileinsatz", quantity: 2 },
      { partNumber: "R134A-GAS-KG", name: "Kältemittel R134a 2kg", quantity: 1 },
    ],
    downtimeMinutes: 160,
  },
  {
    orderNumber: "MO-HIST-016",
    title: "Etikettiermaschine Vakuumtrommel Wickelfehler",
    description: "Rundum-Etikettierer zieht Etiketten schief ein, Etikettenstau im Einlaufstern.",
    equipmentName: "Etikettiermaschine Krones",
    equipmentModel: "Canmatic 720",
    manufacturer: "Krones AG",
    damageCode: "MECH_VAKUUM",
    causeCode: "VERSCHLEISS",
    cause: "Vakuumleiste an der Übergabetrommel mit Leimresten verklebt, Vakuumschieber eingelaufen.",
    solution: "Übergabetrommel ausgebaut, Leimrückstände mit Warmwasser gelöst. PTFE-Vakuumschieber erneuert, Schnittstellen mit Silikonfett leicht benetzt. Schneidmesser gewechselt und Spaltlehre auf 0.03mm eingestellt.",
    recommendedSpareParts: [
      { partNumber: "KRON-VAK-SLIDE", name: "PTFE Vakuumschieber Canmatic", quantity: 1 },
      { partNumber: "MESSER-KRON-ROT", name: "Rotationsschneidmesser Krones", quantity: 2 },
    ],
    downtimeMinutes: 95,
  },
  {
    orderNumber: "MO-HIST-017",
    title: "Hydraulikschlauch Platzer am Schwenkantrieb",
    description: "Schlagartiger Austritt von Hydrauliköl am Knickpunkt von Auslegerarm 2, Not-Aus betätigt.",
    equipmentName: "Hydraulikpresse 200t",
    equipmentModel: "HP-200-CNC",
    manufacturer: "Müller Weingarten",
    damageCode: "HYDR_SCHLAUCH",
    causeCode: "ABRIEB",
    cause: "Scheuerstelle im Schutzschlauch führte zu Drahtgeflecht-Ermüdung und Schlauchberster bei 210 bar Druckspitze.",
    solution: "Ölauffangwanne untergestellt, Bindemittel gestreut. 2SN DN16 Hochdruckschlauchleitung demontiert und neue Schlauchleitung mit zusätzlichem Berstschutz-Textilschlauch konfektioniert und montiert. Entlüftung und Dichtigkeitstest.",
    recommendedSpareParts: [
      { partNumber: "SCHL-2SN-DN16", name: "Hydraulikschlauch 2SN DN16 1.8m", quantity: 1 },
      { partNumber: "BERST-SCHUTZ-16", name: "Textil Berstschutzschlauch", quantity: 2 },
      { partNumber: "BINDEMITTEL-SAEK", name: "Öl-Bindemittel 20kg", quantity: 1 },
    ],
    downtimeMinutes: 80,
  },
  {
    orderNumber: "MO-HIST-018",
    title: "SEW Servogetriebemotor Übertemperatur und Bremsschlupf",
    description: "Hubstation sackt im Stillstand um 15mm ab, Bremse hält die Last nicht sicher.",
    equipmentName: "Hubtischlinie SEW Antrieb",
    equipmentModel: "CMP71M / BY",
    manufacturer: "SEW-Eurodrive",
    damageCode: "MECH_BREMSE",
    causeCode: "VERSCHLEISS",
    cause: "Reibbelag der Federkraftbremse BY2 durch Schmutzeintrag und Reibwärme verglast, Lüftweg zu groß.",
    solution: "Servomotor von Getriebe getrennt. Bremsmodul BY geöffnet, Bremsbelagträger und Druckfedern erneuert. Lüftspalt mit Fühlerlehre auf exakt 0.30mm eingestellt. Bremsmomenttest mit Nennlast durchgeführt.",
    recommendedSpareParts: [
      { partNumber: "SEW-BREMS-BY2", name: "Bremsbelagset BY2 SEW", quantity: 1 },
      { partNumber: "FEDER-SEW-BY", name: "Druckfedersatz Bremse", quantity: 1 },
    ],
    downtimeMinutes: 135,
  },
  {
    orderNumber: "MO-HIST-019",
    title: "SPS Profinet Busfehler sporadischer Leitungsabbruch",
    description: "Linie stoppt mit roter BF-LED an Siemens S7-1500 Kopfstation, Teilnehmer 12 nicht erreichbar.",
    equipmentName: "Hauptschaltschrank Linie 2",
    equipmentModel: "Rittal VX25",
    manufacturer: "Rittal",
    damageCode: "ELEC_BUS",
    causeCode: "KABELBRUCH",
    cause: "Schleppkettentaugliche Ethernetleitung im Energieführungskanal der X-Achse durch Quetschung angebrochen.",
    solution: "Mit Kabeltester Leitung gemessen (Adernpaar 3-6 unterbrochen). Neue schleppkettentaugliche Cat6A PUR-Leitung durch Energiekette eingezogen und beidseitig mit feldkonfektionierbaren RJ45-Steckern verpresst. Schirmung fachgerecht aufgelegt.",
    recommendedSpareParts: [
      { partNumber: "LAPP-ETHERLINE", name: "Lapp Etherline Torsion Cat6A 25m", quantity: 1 },
      { partNumber: "RJ45-IND-PROFI", name: "Harting RJ45 Industrial Stecker", quantity: 2 },
    ],
    downtimeMinutes: 105,
  },
  {
    orderNumber: "MO-HIST-020",
    title: "Kartonaufrichter Saugbalken Fehlstellung Vakuumventil",
    description: "Kartonage wird nicht aus dem Magazin entnommen, Zykluszeitüberschreitung an Station 1.",
    equipmentName: "Etikettiermaschine Krones",
    equipmentModel: "Canmatic 720",
    manufacturer: "Krones AG",
    damageCode: "PNEU_VENTIL",
    causeCode: "MAGNETSPULE",
    cause: "Spulenschluss am 24V Magnetventil des Vakuumerzeugers.",
    solution: "Magnetspule durchgemessen (0 Ohm Kurzschluss). Schnellentlüftungsventil samt 24V DC Spule getauscht. Vakuumschaltpunkt im Steuerungsrezept kalibriert.",
    recommendedSpareParts: [
      { partNumber: "FESTO-VUVG-SP", name: "Festo Magnetventil VUVG-24V", quantity: 1 },
    ],
    downtimeMinutes: 35,
  },
  {
    orderNumber: "MO-HIST-021",
    title: "Kaeser Schraubenkompressor Keilriemen gerissen",
    description: "Schlagartiges Knallgeräusch im Kompressorraum, Motor dreht frei, kein Druckaufbau.",
    equipmentName: "Kaeser Schraubenkompressor",
    equipmentModel: "CSD 105",
    manufacturer: "Kaeser Kompressoren",
    damageCode: "MECH_RIEMEN",
    causeCode: "ERMÜDUNG",
    cause: "Alterung und Flankenverschleiß des Verbundkeilriemensatzes.",
    solution: "Keilriemenreste entfernt. Riemenscheiben mit Profillehre geprüft. Neuen Satz Optibelt Red Power Keilriemen montiert, Riemenspannung mit Frequenz-Messgerät optisch auf 68 Hz Eigenfrequenz eingestellt.",
    recommendedSpareParts: [
      { partNumber: "OPTI-RED-POWER", name: "Optibelt Red Power 3-Riemen Set", quantity: 1 },
    ],
    downtimeMinutes: 70,
  },
  {
    orderNumber: "MO-HIST-022",
    title: "Pneumatikzylinder Kolbenstangendichtung Leckage",
    description: "Druckluft bläst dauerhaft an der Kolbenstange von Zylinder Z-02 aus, Kraftverlust.",
    equipmentName: "Montagelinie 1 Ventilinsel",
    equipmentModel: "CPX-MPA-FB",
    manufacturer: "Festo AG",
    damageCode: "PNEU_ZYLINDER",
    causeCode: "DICHTUNG",
    cause: "Riefenbildung auf der Kolbenstange durch Schweißspritzer beschädigte die Abstreiferlippe.",
    solution: "Zylinder zerlegt, Kolbenstange mit Läppleinen abgezogen. Dichtsatz mit Polyurethan-Nutring und Metallabstreifer eingebaut. Zusätzlichen Schutzfaltenbalg montiert.",
    recommendedSpareParts: [
      { partNumber: "FESTO-DSNU-DS", name: "Dichtsatz Zylinder DSNU-32", quantity: 1 },
      { partNumber: "SCHUTZ-BALG-32", name: "Faltenbalg Neopren DN32", quantity: 1 },
    ],
    downtimeMinutes: 50,
  },
  {
    orderNumber: "MO-HIST-023",
    title: "Linearführung X-Achse Kugelumlaufwagen gefressen",
    description: "Handlingsportal blockiert auf X-Achse, Schrittverlust und Überlastabschaltung des Servoverstärkers.",
    equipmentName: "Kuka KR 210 Roboterzelle",
    equipmentModel: "KR 210 R2700",
    manufacturer: "KUKA AG",
    damageCode: "MECH_FUEHRUNG",
    causeCode: "SCHMIERUNG",
    cause: "Verstopfung des Schmiernippels am Führungswagen links, Trockenlauf der Kugeln führte zum Fresser.",
    solution: "Portal abgefangen. Führungsschiene THK HSR35 poliert, beschädigten Führungswagen ausgetauscht. Automatische Zentralschmierung durchgespült und Dosierverteiler geprüft.",
    recommendedSpareParts: [
      { partNumber: "THK-HSR35-WAG", name: "THK Führungswagen HSR35A", quantity: 2 },
      { partNumber: "SCHMIER-NIPP-M6", name: "Schmiernippel M6x1 mit Kugel", quantity: 4 },
    ],
    downtimeMinutes: 200,
  },
  {
    orderNumber: "MO-HIST-024",
    title: "Kreiselpumpe KSB Kavitation und Laufradschaden",
    description: "Kreiselpumpe erzeugt prasselnde Kiesbettgeräusche, Fördermenge um 40% eingebrochen.",
    equipmentName: "Kreiselpumpe KSB Etanorm",
    equipmentModel: "Etanorm 50-200",
    manufacturer: "KSB SE",
    damageCode: "HYDR_KAVITATION",
    causeCode: "SAUGDRUCK",
    cause: "Verstopfter Sauggitterkorb reduzierte NPSH-Wert der Anlage unter den erforderlichen Wert, massive Kavitation am Laufradeintritt.",
    solution: "Saugkorb gereinigt und erweitert. Pumpengehäuse geöffnet, erodiertes Laufrad gegen neues Edelstahl-Laufrad getauscht. Gehäusedichtung erneuert. Saugmanometer kalibriert.",
    recommendedSpareParts: [
      { partNumber: "KSB-LAUFR-50200", name: "KSB Laufrad Edelstahl 1.4408", quantity: 1 },
      { partNumber: "GEH-DICHT-KSB", name: "Gehäusedichtung EPDM Etanorm", quantity: 1 },
    ],
    downtimeMinutes: 190,
  },
  {
    orderNumber: "MO-HIST-025",
    title: "Pilz Sicherheitsrelais Not-Halt Kreis lässt sich nicht resetten",
    description: "Nach Betätigung und Entriegeln des Not-Aus Pilztasters leuchtet Reset-LED nicht auf.",
    equipmentName: "Hauptschaltschrank Linie 2",
    equipmentModel: "Rittal VX25",
    manufacturer: "Rittal",
    damageCode: "ELEC_SICHERHEIT",
    causeCode: "RELAISVERSCHLEISS",
    cause: "Zwangskontakte im Pilz PNOZ Relais durch Abreißfunken oxidiert und verklebt.",
    solution: "Sicherheitsrelais auf Tragschiene demontiert und durch neues Pilz PNOZ s4 ersetzt. Rückführkreis (EDM) der Schütze auf Übergangswiderstände geprüft.",
    recommendedSpareParts: [
      { partNumber: "PILZ-PNOZ-S4", name: "Pilz Sicherheitsrelais PNOZ s4 24V", quantity: 1 },
    ],
    downtimeMinutes: 40,
  },
  {
    orderNumber: "MO-HIST-026",
    title: "Kuka Roboter Energieführungskabel Schutzschlauch durchgescheuert",
    description: "Signalleitung für Greifersensorik hat Erdschluss am Handgelenk von Roboter 2.",
    equipmentName: "Kuka KR 210 Roboterzelle",
    equipmentModel: "KR 210 R2700",
    manufacturer: "KUKA AG",
    damageCode: "ROB_SCHLAUCH",
    causeCode: "DREHBEWEGUNG",
    cause: "Wellschlauch am Achse 6 Drehmodul durch permanente Torsionsbewegung aus der Halterung gerutscht.",
    solution: "Murrplastik Wellschlauchpaket erneuert, Zugentlastungen mit Klemmschellen festgesetzt. Durchgescheuertes M12 Sensorkabel neu verlegt und Funktionsprüfung durchgeführt.",
    recommendedSpareParts: [
      { partNumber: "MURR-WELL-DN48", name: "Murrplastik Wellschlauch DN48 (3m)", quantity: 1 },
      { partNumber: "KBL-M12-8POL", name: "M12 Sensorleitung 8-polig PUR", quantity: 2 },
    ],
    downtimeMinutes: 90,
  },
  {
    orderNumber: "MO-HIST-027",
    title: "Späneförderer Scharnierband klemmt durch Blechteil",
    description: "Überlastkupplung des Späneförderers hat ausgelöst, Scharnierband rührt sich nicht.",
    equipmentName: "DMG Mori CNC Fräszentrum",
    equipmentModel: "DMC 105 V",
    manufacturer: "DMG MORI",
    damageCode: "MECH_FOERDERER",
    causeCode: "FREMDKOERPER",
    cause: "Herabgefallenes Rohlingsteil verklemmte sich zwischen Förderbandlamelle und Gehäusewand.",
    solution: "Förderer rückwärts gedreht, Fremdkörper entfernt. Zwei verbogene Scharnierbandelemente ausgetrennt und Ersatzglieder eingenietet. Rutschkupplungsmoment kontrolliert.",
    recommendedSpareParts: [
      { partNumber: "SCH-BAND-GLIED", name: "Ersatzglieder Scharnierband 300mm", quantity: 2 },
    ],
    downtimeMinutes: 55,
  },
  {
    orderNumber: "MO-HIST-028",
    title: "Festo Proportional-Druckregelventil reagiert verzögert",
    description: "Schweißzylinderkraft weicht vom Sollwert ab, Regelabweichung überschreitet Toleranz.",
    equipmentName: "Montagelinie 1 Ventilinsel",
    equipmentModel: "CPX-MPA-FB",
    manufacturer: "Festo AG",
    damageCode: "PNEU_REGLER",
    causeCode: "DRUCKLUFTQUALITAET",
    cause: "Restöl im Druckluftnetz verölte die Piezokeramik des Festo VPPM Druckregelventils.",
    solution: "VPPM Ventil gegen Neuteil getauscht. Aktivkohlefilter der vorgeschalteten Druckluft-Aufbereitung gewechselt. Restölgehalt gemessen (<0.01 mg/m³).",
    recommendedSpareParts: [
      { partNumber: "FESTO-VPPM-6L", name: "Proportional-Druckregelventil VPPM", quantity: 1 },
      { partNumber: "AKTIVKOHLE-FILT", name: "Festo Aktivkohlefilterpatrone MS6", quantity: 1 },
    ],
    downtimeMinutes: 65,
  },
  {
    orderNumber: "MO-HIST-029",
    title: "Schaltschrank 24V Schaltnetzteil Spannungseinbruch",
    description: "SPS-Eingangskarten schalten sporadisch ab, 24V Versorgungsspannung bricht auf 18V ein.",
    equipmentName: "Hauptschaltschrank Linie 2",
    equipmentModel: "Rittal VX25",
    manufacturer: "Rittal",
    damageCode: "ELEC_NETZTEIL",
    causeCode: "KONDENSATOR",
    cause: "Austrocknung der Elektrolytkondensatoren im 24V 40A Schaltnetzteil nach 6 Jahren Dauerbetrieb.",
    solution: "Defektes Netzteil durch redundantes Siemens SITOP PSU8200 40A Netzteil ersetzt. Laststrom pro Strang gemessen (max. 26A, voll im grünen Bereich).",
    recommendedSpareParts: [
      { partNumber: "SIEM-SITOP-40A", name: "Siemens SITOP PSU8200 24V/40A", quantity: 1 },
    ],
    downtimeMinutes: 50,
  },
  {
    orderNumber: "MO-HIST-030",
    title: "Antriebsmotor Siemens Lagerschild Riss nach Wellenblockade",
    description: "Nach Materialstau blockierte das Antriebsrad, Motor brummt laut und Lagerschild hat sichtbaren Haarriss.",
    equipmentName: "Antriebsmotor Siemens 45kW",
    equipmentModel: "1LE1001-1DB4",
    manufacturer: "Siemens AG",
    damageCode: "MECH_GEHAEUSE",
    causeCode: "BLOCKADE",
    cause: "Schlagartige Wellenblockade führte zu Torsionsüberlastung und Rissbildung am Grauguss-Flansch A-seitig.",
    solution: "Motor ausgebaut und in Werkstatt zerlegt. A-Lagerschild erneuert, Rotor dynamisch ausgewuchtet. Wälzlager getauscht. Isolationswiderstand der Wicklung gemessen (>100 MOhm). Wiederinbetriebnahme.",
    recommendedSpareParts: [
      { partNumber: "SIEM-SCHILD-A", name: "A-Lagerschild Flansch Siemens 1LE1", quantity: 1 },
      { partNumber: "SKF-6310-C3", name: "Rillenkugellager SKF 6310-C3", quantity: 2 },
    ],
    downtimeMinutes: 360,
  },
];

/**
 * Erstellt die vollständigen Seed-Maßnahmen inklusive Textsynthese und Embedding-Vektoren
 */
export function getSeedHistoricalMeasures(): SeedHistoricalMeasure[] {
  return SEED_HISTORICAL_MEASURES.map((item) => {
    const partsSummary = item.recommendedSpareParts
      .map((p) => `${p.quantity}x ${p.name} (${p.partNumber})`)
      .join(", ");

    const synthesizedDocumentText = `
Anlage: ${item.equipmentName} | Modell: ${item.equipmentModel} | Hersteller: ${item.manufacturer}
Auftragsart: ${item.orderNumber}
Problem / Symptom: ${item.title}
Detailbeschreibung: ${item.description}
Fehlerbild / Schadenscode: ${item.damageCode}
Tatsächliche Ursache: ${item.cause}
Durchgeführte Lösung / Maßnahmen: ${item.solution}
Verbaute Ersatzteile: ${partsSummary}
Stillstandszeit: ${item.downtimeMinutes} Minuten
`.trim();

    const embedding = generateDeterministicEmbedding(synthesizedDocumentText, 1536);

    return {
      ...item,
      synthesizedDocumentText,
      embedding,
    };
  });
}

/**
 * Berechnet Kosinus-Ähnlichkeit zwischen zwei Vektoren
 */
export function calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dotProduct / denom : 0;
}

/**
 * Schreibt alle 30 historischen Referenzmaßnahmen inkl. Embeddings in die Datenbank
 */
export async function seedHistoricalOrdersToDb(
  dbInstance?: any,
  explicitTenantId?: string
) {
  const database = dbInstance || defaultDb;
  console.log("🧠 Starting seed of 30 historical AI Copilot orders...");

  // Tenant ermitteln
  let tenantId = explicitTenantId;
  if (!tenantId) {
    const [tenant] = await database.select().from(schema.tenants).limit(1);
    if (!tenant) {
      console.warn("⚠️ No tenant found for seeding historical orders. Please run main seed first.");
      return;
    }
    tenantId = tenant.id;
  }

  // Auftragsart (z.B. IH02 Breakdown)
  const orderType =
    (await database.query?.orderTypes?.findFirst({
      where: eq(schema.orderTypes.code, "IH02"),
    })) ||
    (await database.query?.orderTypes?.findFirst());

  if (!orderType) {
    console.warn("⚠️ No order type found for historical orders.");
    return;
  }

  // Abgeschlossener Status
  const closedStatus =
    (await database.query?.workflowStatuses?.findFirst({
      where: eq(schema.workflowStatuses.code, "CLOSED"),
    })) ||
    (await database.query?.workflowStatuses?.findFirst({
      where: eq(schema.workflowStatuses.code, "TECH_COMPLETED"),
    })) ||
    (await database.query?.workflowStatuses?.findFirst());

  if (!closedStatus) {
    console.warn("⚠️ No closed/completed status found for historical orders.");
    return;
  }

  // Benutzer für Meldung & Zuweisung
  const user = await database.query?.users?.findFirst();
  if (!user) {
    console.warn("⚠️ No user found for historical orders.");
    return;
  }

  // Vorhandene Equipments für Mapping
  const existingEquipments = (await database.query?.equipments?.findMany()) || [];

  const measuresWithEmbeddings = getSeedHistoricalMeasures();

  for (const item of measuresWithEmbeddings) {
    // Passendes Equipment suchen
    const matchedEq = existingEquipments.find(
      (eqItem: any) =>
        eqItem.name?.toLowerCase().includes(item.equipmentName.toLowerCase().slice(0, 10)) ||
        item.equipmentName.toLowerCase().includes(eqItem.name?.toLowerCase().slice(0, 10))
    ) || existingEquipments[0];

    const [order] = await database
      .insert(schema.maintenanceOrders)
      .values({
        tenantId,
        orderNumber: item.orderNumber,
        orderTypeId: orderType.id,
        currentStatusId: closedStatus.id,
        priority: "1_EMERGENCY",
        title: item.title,
        description: item.description,
        symptomDescription: item.description,
        damageCode: item.damageCode,
        rootCauseDescription: item.cause,
        causeCode: item.causeCode,
        resolutionSummary: item.solution,
        equipmentId: matchedEq?.id ?? null,
        reportedByUserId: user.id,
        assignedToUserId: user.id,
        plannedDurationMinutes: item.downtimeMinutes,
        actualDurationMinutes: item.downtimeMinutes,
        downtimeMinutes: item.downtimeMinutes,
        sapOrderNr: `HIST-${item.orderNumber.replace(/[^0-9]/g, "")}`,
        sapSyncStatus: "SYNCED",
        sapLastSyncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [schema.maintenanceOrders.tenantId, schema.maintenanceOrders.orderNumber],
        set: {
          title: item.title,
          description: item.description,
          damageCode: item.damageCode,
          rootCauseDescription: item.cause,
          causeCode: item.causeCode,
          resolutionSummary: item.solution,
          downtimeMinutes: item.downtimeMinutes,
          updatedAt: new Date(),
        },
      })
      .returning();

    // RAG Embedding in orderHistoryEmbeddings speichern
    await database
      .insert(schema.orderHistoryEmbeddings)
      .values({
        tenantId,
        maintenanceOrderId: order.id,
        equipmentId: matchedEq?.id ?? null,
        chunkIndex: 0,
        synthesizedDocumentText: item.synthesizedDocumentText,
        embeddingModel: "text-embedding-3-small",
        embedding: item.embedding,
        metadataJson: {
          equipmentType: item.equipmentName,
          manufacturer: item.manufacturer,
          damageCode: item.damageCode,
          causeCode: item.causeCode,
          downtimeMinutes: item.downtimeMinutes,
          sparePartNumbers: item.recommendedSpareParts.map((p) => p.partNumber),
        },
      })
      .onConflictDoUpdate({
        target: [
          schema.orderHistoryEmbeddings.maintenanceOrderId,
          schema.orderHistoryEmbeddings.chunkIndex,
        ],
        set: {
          synthesizedDocumentText: item.synthesizedDocumentText,
          embedding: item.embedding,
          metadataJson: {
            equipmentType: item.equipmentName,
            manufacturer: item.manufacturer,
            damageCode: item.damageCode,
            causeCode: item.causeCode,
            downtimeMinutes: item.downtimeMinutes,
            sparePartNumbers: item.recommendedSpareParts.map((p) => p.partNumber),
          },
          updatedAt: new Date(),
        },
      });
  }

  console.log(`✅ Successfully seeded ${measuresWithEmbeddings.length} historical AI Copilot orders with embeddings.`);
}

if (typeof process !== "undefined" && process.argv[1]?.includes("seed-historical-orders")) {
  seedHistoricalOrdersToDb()
    .then(() => {
      console.log("Historical orders seed finished.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Historical orders seed failed:", err);
      process.exit(1);
    });
}
