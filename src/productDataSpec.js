// Szablon danych produktowych Studio (zaakceptowany) – pola i słowniki. Źródło: Szablon_danych_produktowych_Studio.xlsx
export const TEMPLATE_FIELDS = [
{
"group": "Identyfikacja",
"name": "SKU",
"type": "tekst",
"req": "Obowiązkowe",
"dict": ""
},
{
"group": "Identyfikacja",
"name": "EAN",
"type": "tekst",
"req": "Obowiązkowe",
"dict": ""
},
{
"group": "Identyfikacja",
"name": "Nazwa",
"type": "tekst",
"req": "Obowiązkowe",
"dict": ""
},
{
"group": "Identyfikacja",
"name": "Numer katalogowy",
"type": "tekst",
"req": "Opcjonalne",
"dict": ""
},
{
"group": "Identyfikacja",
"name": "Typ towaru",
"type": "słownik",
"req": "Obowiązkowe",
"dict": "Typ towaru"
},
{
"group": "Identyfikacja",
"name": "Skład kompletu",
"type": "tekst",
"req": "Warunkowe",
"dict": ""
},
{
"group": "Identyfikacja",
"name": "Aktywny",
"type": "słownik",
"req": "Obowiązkowe",
"dict": "TAK/NIE"
},
{
"group": "Identyfikacja",
"name": "Rok wdrożenia",
"type": "liczba",
"req": "Opcjonalne",
"dict": ""
},
{
"group": "Marka i klasyfikacja",
"name": "Marka",
"type": "słownik",
"req": "Obowiązkowe",
"dict": "Marka"
},
{
"group": "Marka i klasyfikacja",
"name": "Kategoria",
"type": "słownik",
"req": "Obowiązkowe",
"dict": "Kategoria"
},
{
"group": "Marka i klasyfikacja",
"name": "Typ konstrukcji",
"type": "słownik",
"req": "Zalecane",
"dict": "Typ konstrukcji"
},
{
"group": "Marka i klasyfikacja",
"name": "Model",
"type": "tekst",
"req": "Obowiązkowe",
"dict": ""
},
{
"group": "Marka i klasyfikacja",
"name": "Wariant modelu",
"type": "tekst",
"req": "Opcjonalne",
"dict": ""
},
{
"group": "Technologia i materiał",
"name": "Technologia",
"type": "słownik",
"req": "Warunkowe",
"dict": "Technologia"
},
{
"group": "Technologia i materiał",
"name": "Materiał",
"type": "słownik",
"req": "Obowiązkowe",
"dict": "Materiał"
},
{
"group": "Technologia i materiał",
"name": "Antypoślizg",
"type": "słownik",
"req": "Warunkowe",
"dict": "TAK/NIE"
},
{
"group": "Technologia i materiał",
"name": "Typ antypoślizgu",
"type": "tekst",
"req": "Opcjonalne",
"dict": ""
},
{
"group": "Wygląd",
"name": "Kolor",
"type": "słownik",
"req": "Obowiązkowe",
"dict": "Kolor"
},
{
"group": "Wygląd",
"name": "Wykończenie",
"type": "słownik",
"req": "Zalecane",
"dict": "Wykończenie"
},
{
"group": "Wygląd",
"name": "Nazwa handlowa koloru",
"type": "słownik",
"req": "Opcjonalne",
"dict": "Nazwa handlowa koloru"
},
{
"group": "Wygląd",
"name": "Dekor",
"type": "słownik",
"req": "Opcjonalne",
"dict": "Dekor"
},
{
"group": "Wygląd",
"name": "Kształt",
"type": "słownik",
"req": "Warunkowe",
"dict": "Kształt"
},
{
"group": "Wygląd",
"name": "Strona",
"type": "słownik",
"req": "Warunkowe",
"dict": "Strona"
},
{
"group": "Wymiary i montaż",
"name": "Długość [cm]",
"type": "liczba",
"req": "Obowiązkowe",
"dict": ""
},
{
"group": "Wymiary i montaż",
"name": "Szerokość [cm]",
"type": "liczba",
"req": "Obowiązkowe",
"dict": ""
},
{
"group": "Wymiary i montaż",
"name": "Wysokość [cm]",
"type": "liczba",
"req": "Obowiązkowe",
"dict": ""
},
{
"group": "Wymiary i montaż",
"name": "Głębokość [cm]",
"type": "liczba",
"req": "Warunkowe",
"dict": ""
},
{
"group": "Wymiary i montaż",
"name": "Spadek [%]",
"type": "liczba",
"req": "Opcjonalne",
"dict": ""
},
{
"group": "Wymiary i montaż",
"name": "Sposób montażu",
"type": "słownik",
"req": "Zalecane",
"dict": "Sposób montażu"
},
{
"group": "Wymiary i montaż",
"name": "Klasa wysokości",
"type": "słownik",
"req": "Opcjonalne",
"dict": "Klasa wysokości"
},
{
"group": "Wymiary i montaż",
"name": "Średnica odpływu [mm]",
"type": "liczba",
"req": "Warunkowe",
"dict": ""
},
{
"group": "Wymiary i montaż",
"name": "Przepływ [l/min]",
"type": "liczba",
"req": "Warunkowe",
"dict": ""
},
{
"group": "Wymiary i montaż",
"name": "Pojemność [l]",
"type": "liczba",
"req": "Warunkowe",
"dict": ""
},
{
"group": "Wymiary i montaż",
"name": "Zawartość zestawu",
"type": "tekst",
"req": "Opcjonalne",
"dict": ""
},
{
"group": "Logistyka",
"name": "Waga netto [kg]",
"type": "liczba",
"req": "Zalecane",
"dict": ""
},
{
"group": "Logistyka",
"name": "Waga brutto [kg]",
"type": "liczba",
"req": "Obowiązkowe",
"dict": ""
},
{
"group": "Logistyka",
"name": "Objętość [m3]",
"type": "liczba",
"req": "Opcjonalne",
"dict": ""
},
{
"group": "Logistyka",
"name": "Liczba paczek",
"type": "liczba",
"req": "Obowiązkowe",
"dict": ""
},
{
"group": "Logistyka",
"name": "Długość paczki [cm]",
"type": "liczba",
"req": "Obowiązkowe",
"dict": ""
},
{
"group": "Logistyka",
"name": "Szerokość paczki [cm]",
"type": "liczba",
"req": "Obowiązkowe",
"dict": ""
},
{
"group": "Logistyka",
"name": "Wysokość paczki [cm]",
"type": "liczba",
"req": "Obowiązkowe",
"dict": ""
},
{
"group": "Logistyka",
"name": "Ilość na palecie",
"type": "liczba",
"req": "Opcjonalne",
"dict": ""
},
{
"group": "Logistyka",
"name": "Dostępność magazynowa",
"type": "słownik",
"req": "Opcjonalne",
"dict": "Dostępność magazynowa"
},
{
"group": "Zgodność (GPSR)",
"name": "Producent",
"type": "tekst",
"req": "Obowiązkowe",
"dict": ""
},
{
"group": "Zgodność (GPSR)",
"name": "Adres producenta",
"type": "tekst",
"req": "Obowiązkowe",
"dict": ""
},
{
"group": "Zgodność (GPSR)",
"name": "E-mail producenta",
"type": "tekst",
"req": "Obowiązkowe",
"dict": ""
},
{
"group": "Zgodność (GPSR)",
"name": "Kraj produkcji",
"type": "słownik",
"req": "Zalecane",
"dict": "Kraj produkcji"
},
{
"group": "Zgodność (GPSR)",
"name": "Deklaracja właściwości (nr)",
"type": "tekst",
"req": "Warunkowe",
"dict": ""
},
{
"group": "Zgodność (GPSR)",
"name": "Norma",
"type": "tekst",
"req": "Warunkowe",
"dict": ""
},
{
"group": "Zgodność (GPSR)",
"name": "Gwarancja [lata]",
"type": "liczba",
"req": "Obowiązkowe",
"dict": ""
},
{
"group": "Zgodność (GPSR)",
"name": "Link do instrukcji / karty technicznej",
"type": "tekst",
"req": "Zalecane",
"dict": ""
}
]
export const TEMPLATE_DICTS = {"Marka": ["Aedler", "Schaedler", "Schedline", "Schedpol", "Kompielka"], "Typ towaru": ["artykuł", "komplet"], "TAK/NIE": ["TAK", "NIE"], "Kategoria": ["brodzik", "brodzik podpłytkowy", "wanna", "odpływ liniowy", "panel", "maskownica", "nośnik", "obudowa", "stelaż", "syfon", "kolanko", "akcesoria uszczelniające", "inne"], "Typ konstrukcji": ["kompozytowy", "standardowy", "standardowy na nośniku", "zintegrowany", "podpłytkowy", "pianowany", "pianowany na nośniku", "szeroki", "wąski", "szczelinowy", "inny"], "Technologia": ["Stabildense", "Standard Plus"], "Materiał": ["akryl", "kompozyt mineralny", "styropian (EPS)", "stal nierdzewna", "tworzywo sztuczne (ABS/PP)", "aluminium", "inny"], "Kolor": ["biały", "czarny", "szary", "antracytowy", "cementowy", "kaszmirowy", "beżowy", "srebrny", "chromowany"], "Wykończenie": ["gładki", "strukturalny", "matowy", "połysk"], "Nazwa handlowa koloru": ["WHITE SCALE", "BLACK SCALE", "CEMENT SCALE", "ANTHRACITE SCALE", "CASHMERE SCALE", "BEIGE SCALE", "GREY SCALE", "WHITE MATT", "BLACK MATT", "CASHMERE MATT", "SMOOTH WHITE", "WHITE STONE", "GRIPMASS®"], "Dekor": ["Board", "Pattern", "Metal"], "Kształt": ["prostokątny", "kwadratowy", "półokrągły", "pięciokątny", "asymetryczny"], "Strona": ["lewa", "prawa", "uniwersalna"], "Sposób montażu": ["z panelem", "do zabudowy", "podpłytkowe", "wolnostojący"], "Klasa wysokości": ["niskie", "średnie", "wysokie"], "Dostępność magazynowa": ["A", "B", "C", "I"], "Kraj produkcji": ["Polska", "Niemcy", "Czechy", "Wielka Brytania"]}
