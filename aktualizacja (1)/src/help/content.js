// Instrukcja obsługi – źródło prawdy. Zmieniasz funkcję w aplikacji → aktualizujesz tę treść w tym samym wdrożeniu.
export const MANUAL_UPDATED = '2026-10-12'

export const SECTIONS = [
  { id: 'role', title: 'Czym jest AI Opisy i kto co robi', md: `SchedpolAI eCommerce Studio to platforma e-commerce Schedpol złożona z modułów: Generator Treści (działa), Oferta i kanały, Pozyskiwanie klientów, Ceny i marża, Operacje oraz Analityka. Moduł Generator Treści generuje opisy produktów na marketplace (eMAG RO, HU, BG, Kaufland i kolejne) oraz aktualizuje parametry produktów w Base. AI pisze wyłącznie z zatwierdzonych faktów, a każdy opis bazowy przechodzi weryfikację człowieka przed publikacją.

**Adres:** [https://schedpol.github.io/ai-opisy/](https://schedpol.github.io/ai-opisy/) – logowanie firmowym adresem e-mail. Konto i rolę nadaje admin (ekran Użytkownicy).

| Rola | Co robi | Typowe ekrany |
| --- | --- | --- |
| Generujący | importuje produkty, uruchamia generację opisów i wariantów, proponuje fakty i reguły QA | Produkty, Księga wiedzy, Weryfikacja |
| Akceptujący | wszystko co generujący + zatwierdza fakty, opisy, frazy startowe i tłumaczenia parametrów, porównuje parametry z Base | Weryfikacja, Księga wiedzy, Frazy kluczowe, Parametry Base |
| Admin | wszystko powyżej + kanały, szablony, słownik importu, reguły QA, publikacja i zapis parametrów w Base, użytkownicy | Ustawienia, Szablony, Słownik importu, Publikacja |

Role dziedziczą uprawnienia w górę: akceptujący może wszystko, co generujący, a admin wszystko, co akceptujący. Jeśli przycisk jest nieaktywny albo go nie widać, zwykle oznacza to brak uprawnień – zgłoś się do admina.` },

  { id: 'przeplyw', title: 'Jak przebiega praca', diagram: true, md: `Opis powstaje z czterech źródeł (dane produktu, wiedza, frazy, szablon), a do Base trafia dopiero po akceptacji człowieka. Parametry produktów idą do Base osobną ścieżką, prosto z danych PIM.

Kroki 1–4 przygotowuje się raz na model, kategorię lub rynek; potem kolejne opisy powstają w minutach. W trakcie zadania AI (generacja, import, tłumaczenie, porównanie z Base) na środku ekranu pojawia się okno z kratką odpływu, nazwą zadania i czasem oczekiwania. Przycisk „Ukryj” (albo klawisz Esc) chowa okno – zadanie trwa dalej w tle, a „spływająca woda” w logo w menu pokazuje, że jeszcze pracuje. Wynik pojawi się na ekranie, z którego zadanie zostało uruchomione. Jeśli weryfikujący odrzuci opis, wraca on do ponownej generacji, a powtarzające się uwagi warto zamieniać w reguły QA.` },

  { id: 'ekrany', title: 'Ekrany aplikacji', md: `Menu ma pięć grup w kolejności pracy: **Start** (Dashboard), **Produkty**, **Przygotowanie treści**, **Kontrola i publikacja** oraz **Konfiguracja** (dla admina). Liczba przy Weryfikacji pokazuje opisy czekające na sprawdzenie.

| Ekran | Do czego służy | Kto |
| --- | --- | --- |
| [Dashboard](/tresci) | pokrycie asortymentu (PIM → Baselinker → aplikacja → treść → publikacja) z listami braków do pobrania, panel „Od czego zacząć”, statusy opisów, jakość | wszyscy; stan Baselinkera odświeża akceptujący |
| [Drzewo produktów](/drzewo) | asortyment z PIM jako **lista** (marka › kategoria › model › SKU) albo **diagram** (kategoria › technologia › model › kolor › kształt › rozmiar › odpływ › SKU), pokrycie opisami per rynek, raport jakości danych PIM | wszyscy; wgrywa listę admin |
| [Produkty](/produkty) | import z Baselinkera, rodziny (modele), wybór wariantu wiodącego, generacja opisu bazowego | generujący |
| [Słownik importu](/slownik) | reguły odczytu atrybutów z SKU: kolor (np. B/SC = Black Scale), powłoka (AP1), odpływ, kształt, zestaw z nośnikiem (/NO), role zdjęć | admin |
| [Księga wiedzy](/wiedza) | fakty na 6 poziomach: marka, kategoria (np. brodziki, wanny), technologia (ze słownika marki), seria (np. Antis), model (seria w kolorze), wariant (SKU); wgrywanie DOCX z automatycznym wyciąganiem faktów | dodaje generujący, zatwierdza akceptujący |
| [Szablony](/szablony) | układ opisu: kanał › rynek › kategoria; sekcje, grafiki (z serwera wg konwencji), format HTML (eMAG / Kaufland / własny) | admin |
| [Grafiki na FTP](/grafiki) | drzewo kategoria › seria › kolor › kształt z plikami z konwencji (packshot wg odpływu, aranżacje, infografika, rysunek techniczny): co jest na serwerze, a co trzeba wgrać; lista braków do pobrania | sprawdza każdy, wgrywa grafik |
| [Biblioteka grafik](/biblioteka) | banery i grafiki wspólne dla marki, technologii, serii lub modelu | admin |
| [Frazy kluczowe](/frazy) | banki fraz per kategoria i język (DataForSEO), frazy startowe, wykluczenia | generujący; frazy startowe zatwierdza akceptujący |
| [Weryfikacja](/weryfikacja) | przegląd opisów: treść w języku rynku + polskie tłumaczenie kontrolne, uwagi QA, akceptacja, generacja wariantów | akceptujący |
| [Nauka z uwag](/nauka) | uwagi z Weryfikacji porządkowane przez AI w wytyczne (ogólne i per język) do zatwierdzenia; fakty z uwag trafiają do Księgi wiedzy jako propozycje | uruchamia i zatwierdza akceptujący |
| [Publikacja](/publikacja) | wysyłka zaakceptowanych opisów do Baselinkera | admin |
| [Parametry Base](/parametry) | wyliczanie parametrów z PIM, tłumaczenia na 13 języków, porównanie i zapis w Base | porównuje akceptujący, zapisuje admin |
| [Reguły QA](/reguly) | zakazane sformułowania, marki konkurencji, zasady redakcyjne dla AI; propozycje z uwag weryfikujących | proponuje każdy, zatwierdza admin |
| Użytkownicy, Ustawienia | konta i role; **Kanały sprzedaży** (dodawanie, ID integracji w Baselinkerze, wzorzec i limit tytułu); **Mapa technologii** (technologie marki i przypisanie technologii do kategorii – decyduje, które fakty technologii trafią do których serii) | admin |` },

  { id: 'zadania', title: 'Typowe zadania krok po kroku', md: `### Opis nowego modelu na istniejącym rynku

1. **Produkty → Importuj z Baselinkera** (filtr np. „Aedler”). W podglądzie sprawdź kolumnę „Uwagi”: kolor, kształt, odpływ i zdjęcia muszą pasować do produktu.
2. Przy rodzinie wybierz **wariant wiodący** – najpopularniejszy rozmiar i kolor. Z niego powstaje opis bazowy.
3. Upewnij się, że w **Księdze wiedzy** są zatwierdzone fakty dla modelu, serii i technologii. Bez faktów generacja się nie uruchomi.
4. **Generuj opis** dla wybranego rynku (np. eMAG RO).
5. **Weryfikacja → opis bazowy:** przeczytaj treść i polskie tłumaczenie kontrolne, sprawdź uwagi QA, popraw lub skomentuj, zaakceptuj.
6. **Generuj warianty.** Warianty, które przejdą QA, akceptują się automatycznie; reszta trafia do weryfikacji.
7. **Publikacja** (admin): zaznacz zaakceptowane opisy i wyślij do Baselinkera.

### Nowa kategoria (np. odpływy liniowe, wanny)

1. **Frazy kluczowe → Dodaj bank fraz** dla kategorii w każdym języku rynku. Nazwa kategorii jak w PIM, małymi literami.
2. Frazy startowe przygotowuje osoba znająca język; akceptujący klika „oznacz jako sprawdzone”, potem **Odśwież frazy**.
3. **Księga wiedzy:** wgraj DOCX z faktami o kategorii, zatwierdź fakty.
4. **Szablony → kanał → rynek:** przy kategorii kliknij „Utwórz szablon” i dopasuj tematy sekcji (np. dla odpływów: przepustowość i syfon, montaż).
5. Dalej jak przy nowym modelu.

### Nowy rynek lub kanał sprzedaży (admin)

1. **Ustawienia → Dodaj kanał:** marketplace, rynek, ID integracji w Baselinkerze, szablony (od zera albo kopia z innego rynku), format HTML.
2. **Szablony → kanał → rynek:** sprawdź sekcje i podgląd kodu HTML.
3. **Frazy kluczowe:** uzupełnij frazy startowe w nowym języku.
4. **Reguły QA:** przejrzyj zakazane sformułowania dla języka.
5. Test na jednym produkcie, przegląd przez native speakera, publikacja, sprawdzenie karty produktu na marketplace. Dopiero potem cała partia.

### Aktualizacja parametrów w Base

1. **Drzewo produktów → Wgraj nową listę** z aktualnym eksportem PIM.
2. **Parametry Base:** filtruj (marka, kategoria, model), zaznacz produkty, sprawdź wyliczone wartości. Podpowiedź po najechaniu na komórkę pokazuje źródło wartości.
3. **Porównaj z Base** – lista zmian „obecnie w Base → nowa wartość”.
4. **Zapisz w Base** (admin). Zmieniane są tylko parametry z mapowania; pozostałe parametry produktu zostają bez zmian.

### Parametry w innym języku

1. **Parametry Base → Język parametrów** (13 języków). Nazwy parametrów są ustawione dokładnie jak w Base.
2. **Przetłumacz brakujące (AI)** – AI tłumaczy wartości opisowe do słownika.
3. **Panel Tłumaczenia:** osoba znająca język poprawia i zatwierdza propozycje. Do Base trafiają tylko zatwierdzone.
4. **Porównaj z Base**, potem **Zapisz w Base**.` },

  { id: 'jakosc', title: 'Zasady jakości', md: `Aplikacja blokuje najczęstsze błędy automatycznie, ale za prawdziwość treści odpowiada człowiek, który akceptuje opis.

**Czego pilnuje automatyczne QA** (opis z błędem nie przejdzie akceptacji):

- liczby i wymiary, których nie ma w faktach ani atrybutach produktu;
- wymiary opisu bazowego, które zostały w wariancie;
- zakazane sformułowania (superlatywy typu „najlepszy”, „Nr 1”) i marki konkurencji;
- limity znaków tytułu i całego opisu (np. 5000 znaków na Kauflandzie);
- niedozwolone znaczniki HTML dla danego formatu.

**Zasady dla zespołu:**

- **Fakty tylko ze źródła.** Fakt bez potwierdzenia w dokumentacji technicznej nie trafia do Księgi wiedzy. AI pisze wyłącznie z zatwierdzonych faktów, więc błąd w fakcie powieli się we wszystkich opisach.
- **Weryfikuj na polskim tłumaczeniu kontrolnym, a język sprawdzaj w oryginale.** Opisy na Kaufland DE wymagają przeglądu native speakera – Kaufland nie dopuszcza treści tłumaczonych automatycznie.
- **Uwagi uczą generator.** Każdy komentarz w Weryfikacji trafia do nauki. Na ekranie Nauka z uwag (raz w tygodniu albo po ok. 10–15 uwagach) AI zamienia je w wytyczne, a fakty kieruje do Księgi wiedzy. Pisz uwagi tak, żeby było jasne, czy to zasada („lead maks. 2 zdania”), czy fakt o produkcie („Antis ma odpływ w narożniku”).
- **Powtarzająca się uwaga = reguła.** Przy komentarzu w Weryfikacji zaznacz „zaproponuj jako regułę”. Po zatwierdzeniu przez admina AI będzie jej przestrzegać przy kolejnych opisach.
- **Atrybuty z SKU.** Kolor, powłoka, odpływ i zestaw z nośnikiem wynikają z końcówki SKU według Słownika importu. Uwaga na pułapkę: w SKU Aedler **B/SC to czarny**, a w kodach Schedpol **B/ST to biały**.
- **Zdjęcia wg konwencji ścieżek** \`aedler/{model}/{kolor}/{kształt}/{X}.jpg\` (1 = packshot, 2–3 = aranżacje, 4 = infografika). Plik spoza konwencji aplikacja oznaczy, ale nie użyje go w opisie.
- **Błędy w danych poprawiaj u źródła (w PIM)**, nie w opisie. Raport „Jakość danych PIM” w Drzewie produktów pokazuje rozbieżności i można go pobrać jako CSV.
- **Najpierw test, potem partia.** Nowy rynek, szablon albo mapowanie parametrów sprawdzaj na 1–2 produktach przed wysyłką całego modelu.` },

  { id: 'problemy', title: 'Najczęstsze problemy', md: `Większość komunikatów aplikacji mówi wprost, czego brakuje. Jeśli tabela nie pomoże, zgłoś problem adminowi ze zrzutem ekranu i SKU produktu.

| Objaw | Przyczyna | Co zrobić |
| --- | --- | --- |
| Generacja nie startuje, komunikat o braku faktów | brak zatwierdzonych faktów dla modelu, serii lub technologii | Księga wiedzy: dodaj i zatwierdź fakty |
| Sekcja zniknęła z opisu | brak faktów pasujących do tematu sekcji | dodaj fakty albo zmień temat sekcji w szablonie |
| Opis ma status „błąd” z uwagą QA | QA wykryło problem (np. liczba spoza faktów, zakazane słowo) | przeczytaj uwagę w Weryfikacji, popraw treść albo fakty, wygeneruj ponownie |
| W imporcie flaga „Brak reguły wykończenia” | nowa końcówka SKU, której nie ma w Słowniku importu | admin dopisuje regułę, potem ponowny import |
| Flaga „Packshot nie pasuje do odpływu” albo „Zdjęcie z folderu innego koloru” | zdjęcie w Base niezgodne z konwencją albo z atrybutami | popraw zdjęcia w Base albo regułę w Słowniku |
| Produkt z /NO w złej rodzinie | import sprzed dodania reguły zestawów | ponowny import produktów |
| Polskie znaki jako „krzaki” w Drzewie | plik z PIM otwarty i zapisany w Excelu | wyeksportuj z PIM ponownie, w UTF-8, i wgraj bez otwierania w Excelu |
| Parametr w innym języku oznaczony „⟂” | brak zatwierdzonej nazwy lub tłumaczenia wartości | panel Tłumaczenia: zatwierdź albo popraw |
| „Zapisz w Base” nic nie zapisuje | w n8n włączony tryb próbny (DRY_RUN) | admin przełącza DRY_RUN po teście |
| „Słowa kluczowe” nie są wysyłane | brak odświeżonego banku fraz dla kategorii w danym języku | Frazy kluczowe: dodaj bank i odśwież |
| Przycisk niewidoczny albo nieaktywny | brak uprawnień dla Twojej roli | zgłoś się do admina |
| Strona działa „po staremu” po aktualizacji | przeglądarka trzyma starą wersję | odśwież z Ctrl+F5 |` },
]

// Pomoc kontekstowa: krótko, co robić na danym ekranie + link do właściwej części instrukcji
export const SCREEN_HELP = [
  { path: '/pozyskiwanie', title: 'Pozyskiwanie klientów', section: 'role', md: `- **Research (AI):** wybierz kraj, segment (lista w CRM EXPORT) i markę → „Szukaj nowych firm”. AI szuka w internecie, pomija firmy z CRM EXPORT i ze Studio, sprawdza, czy strony działają. Każda firma ma źródło.
- **Kwalifikacja:** w karcie firmy „Oceń stronę (AI)” – czyta stronę i Impressum, proponuje potencjał A/B/C, model współpracy, analizę i argumentację. Sprawdź, popraw i kliknij „Zatwierdź” albo „Odrzuć” z powodem. Bez źródła nie da się zatwierdzić.
- **Przekazanie:** „Przekaż do ClickUp” tworzy zadanie w CRM EXPORT → Klienci Export (lista wg segmentu) z polami Kraj, Region, Marka, Język, WWW, NIP, Potencjał, Model, Analiza i Argumentacja. Duplikaty z CRM są blokowane.
- **RODO:** w Studio tylko dane firm; osoby kontaktowe prowadzicie w ClickUp.` },
  { path: '/ceny', title: 'Ceny u partnerów (Dealavo)', section: 'role', md: `- Ranking partnerów: średnia i mediana rozbieżności ceny (dostępne oferty, bez wysyłki; ujemna = taniej) oraz liczba produktów poniżej ceny minimalnej.
- **Podmioty i kanały:** kliknij podmiot, żeby zmienić jego nazwę i typ oraz dodać kanały – każdy z Twoją etykietą (np. „Allegro PL”, „Castorama”) i nazwą sprzedawcy w Dealavo. Wskaźniki podmiotu to suma kanałów; w szczegółach widać je też per kanał. Jedna nazwa z Dealavo może należeć tylko do jednego podmiotu.
- **Pobieranie:** automatycznie codziennie o 7:00, a na żądanie przyciskiem **Pobierz z Dealavo** (admin).
- **Historia kwartalna:** per rok i kwartał – liczba produktów, które choć raz były poniżej ceny katalogowej, albo średnia rozbieżność.
- **Szczegóły podmiotu:** produkty poniżej ceny katalogowej teraz, historia naruszeń w wybranym kwartale (najniższa cena, kanały, w ilu pobraniach) i wszystkie oferty.` },
  { path: '/analityka', title: 'Analityka', section: 'role', md: `- Raporty Power BI osadzone w Studio. Przy pierwszym otwarciu Power BI poprosi o zalogowanie kontem firmowym Microsoft; potrzebna licencja Power BI Pro.
- Admin dodaje raport linkiem z Power BI: Plik → Osadź raport → Witryna lub portal. Linki „Publikuj w internecie” są odrzucane, bo byłyby publiczne.` },
  { path: '/drzewo', title: 'Drzewo produktów', section: 'ekrany', md: `- **Lista | Diagram** – diagram pokazuje rozgałęzienie: kategoria › technologia › model › kolor › kształt › rozmiar › odpływ › SKU. Kliknij węzeł, żeby rozwinąć kolejny poziom; „Rozwiń do poziomu” otwiera całe drzewo do wybranej kolumny. Poziomy bez danych (np. odpływ dla nośników) są pomijane.
- **Wgraj nową listę** – eksport z PIM (CSV, TSV, XLSX), najlepiej bez otwierania w Excelu.
- Pasek przy gałęzi = opublikowane w wybranym kanale / wszystkie SKU. Kliknij status przy SKU, żeby otworzyć opis.
- **Jakość danych PIM** – rozbieżności w danych (kształt, kolor, EAN, wymiary); pobierz raport CSV i przekaż osobie od danych.` },
  { path: '/produkty', title: 'Produkty', section: 'opis-nowego-modelu-na-istniejacym-rynku', md: `- **Importuj z Baselinkera** – w podglądzie sprawdź kolumnę „Uwagi” przed zapisem.
- Przy każdej rodzinie wybierz **wariant wiodący**; z niego powstaje opis bazowy.
- **Generuj opis** działa, gdy są zatwierdzone fakty i szablon dla rynku.` },
  { path: '/slownik', title: 'Słownik importu', section: 'jakosc', md: `- Reguły zamieniają końcówki SKU na atrybuty: kolor, powłokę, odpływ, kształt, zestaw (/NO), role zdjęć.
- Nowa końcówka SKU = nowa reguła, potem ponowny import produktów.
- Uwaga: w SKU Aedler **B/SC = czarny**, w kodach Schedpol **B/ST = biały**.` },
  { path: '/wiedza', title: 'Księga wiedzy', section: 'jakosc', md: `- **Technologie** (u góry): hierarchia, np. Stabildense › technologia kompozytowa / zintegrowana. Fakt o Stabildense trafia do obu odmian, fakt o technologii kompozytowej – tylko do brodzików kompozytowych.
- **Poziomy:** marka → kategoria (np. brodziki – wszystkie, albo brodziki › kompozytowe – tylko te) → technologia **w kategorii** (np. Stabildense · Brodziki ≠ Stabildense · Wanny; „wszystkie kategorie” tylko dla cech samej technologii) → seria (np. Antis) → model (seria w kolorze, np. Antis · Black Scale) → wariant (konkretne SKU). Fakt koloru trafia tylko do SKU w tym kolorze, fakt wariantu – tylko do tego SKU.
- Wgraj DOCX – AI wyciągnie fakty jako propozycje. Przy fakcie z uwagą „zmień zakres” popraw poziom przed zatwierdzeniem.
- Akceptujący zatwierdza tylko fakty potwierdzone w dokumentacji.
- Fakty serii i koloru obowiązują też zestaw tej serii (np. „Antis + nośnik”).` },
  { path: '/szablony', title: 'Szablony', section: 'nowy-rynek-lub-kanal-sprzedazy-admin', md: `- Wybierz kanał, rynek i kategorię; kategoria bez szablonu korzysta z domyślnego.
- Grafiki „z serwera wg konwencji” składają link z atrybutów wariantu; status pokazuje, czy plik istnieje.
- **Format HTML** – eMAG (bogaty), Kaufland (prosty) albo własny szkielet; „Pokaż kod HTML” pokazuje, co pójdzie do Base.` },
  { path: '/grafiki', title: 'Grafiki na FTP', section: 'jakosc', md: `- **Sprawdź niesprawdzone** – n8n sprawdza na serwerze pliki, których jeszcze nie sprawdzano (pobiera tylko 1. bajt, więc trwa to krótko).
- Zielone – plik jest (kliknij, żeby otworzyć); czerwone – brak, z dokładną ścieżką, pod którą trzeba go wgrać.
- Pliki są wspólne dla rozmiarów: przy każdym widać SKU, które z niego korzystają.
- **Pobierz listę braków (CSV)** – do przekazania osobie przygotowującej grafiki.
- Po wgraniu nowych plików: **Sprawdź wszystkie ponownie**.` },
  { path: '/biblioteka', title: 'Biblioteka grafik', section: 'ekrany', md: `- Grafiki wspólne (np. banery) przypisane do marki, technologii, serii lub modelu.
- Szablon z obrazkiem „z biblioteki” bierze najbardziej szczegółową pasującą grafikę.` },
  { path: '/frazy', title: 'Frazy kluczowe', section: 'nowa-kategoria-np-odplywy-liniowe-wanny', md: `- Bank = kategoria × język. Nazwa kategorii jak w PIM, małymi literami.
- Frazy startowe przygotowuje osoba znająca język, akceptujący oznacza je jako sprawdzone, potem **Odśwież frazy**.
- Frazy z banku trafiają do opisów i do parametru „Słowa kluczowe” w Base.` },
  { path: '/weryfikacja', title: 'Weryfikacja', section: 'jakosc', md: `- Czytaj polskie tłumaczenie kontrolne, język sprawdzaj w oryginale.
- Uwagi QA blokują akceptację – popraw treść albo fakty.
- Powtarzającą się uwagę oznacz „zaproponuj jako regułę”.
- Po akceptacji bazy: **Generuj warianty**.` },
  { path: '/publikacja', title: 'Publikacja', section: 'opis-nowego-modelu-na-istniejacym-rynku', md: `- Wysyła zaakceptowane opisy do Baselinkera (admin).
- Nowy rynek: najpierw jeden produkt, sprawdzenie karty na marketplace, potem partia.` },
  { path: '/parametry', title: 'Parametry Base', section: 'aktualizacja-parametrow-w-base', md: `- Najpierw **Porównaj z Base**, potem **Zapisz w Base** (admin).
- Zapis zmienia tylko parametry z mapowania; puste wartości nie są wysyłane.
- Inny język: **Przetłumacz brakujące (AI)** → zatwierdź w panelu Tłumaczenia; do Base trafiają tylko zatwierdzone.` },
  { path: '/nauka', title: 'Nauka z uwag', section: 'jakosc', md: `- **Ucz się z tych uwag** – AI klasyfikuje każdą uwagę: zasada stylu, fakt o produkcie albo poprawka jednorazowa.
- Zasady trafiają do propozycji wytycznych (ogólnych i dla języka) z listą zmian – popraw i zatwierdź; dopiero wtedy działają.
- Fakty trafiają do Księgi wiedzy jako propozycje do akceptacji.
- Poprzednie wersje wytycznych są w archiwum.` },
  { path: '/reguly', title: 'Reguły QA', section: 'jakosc', md: `- Zakazane sformułowania i marki konkurencji blokują akceptację opisu.
- Zasady redakcyjne trafiają do promptu AI.
- Filtr języka pokazuje reguły danego języka razem z regułami dla wszystkich języków.` },
  { path: '/ustawienia', title: 'Ustawienia', section: 'nowy-rynek-lub-kanal-sprzedazy-admin', md: `- **Mapa technologii:** słownik technologii marki (dodawanie, zmiana nazwy – przenosi się na fakty i rodziny, usuwanie) oraz tabela kategoria × technologia. Tryb „wg PIM” – technologię dostają serie, które mają ją w PIM; „wszystkie serie” – każda seria kategorii. Po zmianach: **Zastosuj do rodzin…** z podglądem zmian.
- **Dodaj kanał** – rynek, ID integracji, szablony (od zera lub kopia), format HTML, banki fraz, reguły QA.
- Pod każdym kanałem: wzorzec tytułu; obok limit znaków tytułu.
- Kanału z opisami nie da się usunąć – wyłącz go („Aktywny”).` },
  { path: '/uzytkownicy', title: 'Użytkownicy', section: 'role', md: `- Nadawanie ról: generujący, akceptujący, admin. Role dziedziczą uprawnienia w górę.` },
  { path: '/', title: 'Pulpit Studio', section: 'role', md: `- Kafelki modułów SchedpolAI eCommerce Studio: co działa, co jest w budowie, kto jest właścicielem.
- Admin decyduje, które moduły widzi zespół (przełącznik „widoczny dla zespołu”).` },
  { path: '/tresci', title: 'Dashboard Generatora Treści', section: 'ekrany', md: `- **Pokrycie asortymentu:** ile SKU jest w PIM, w Baselinkerze, w aplikacji, z treścią i opublikowanych. Przy każdej luce jest lista CSV do pobrania.
- Filtr rynku zmienia dwa ostatnie etapy (treść i publikacja) na wybrany kanał.
- **Odśwież stan Base** (akceptujący, admin) pobiera aktualną listę SKU z katalogu Baselinkera – rób to po zmianach w Base.
- **Od czego zacząć** – najważniejsze następne kroki z linkami do właściwych ekranów.` },
]
export const helpFor = path => SCREEN_HELP.find(h => h.path !== '/' && path.startsWith(h.path)) || (path === '/' ? SCREEN_HELP.find(h => h.path === '/') : null)
